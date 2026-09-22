// /api/admin/community-reports.js
/**
 * ADMIN: MODERACE NAHLÁŠENÉHO OBSAHU.
 *
 * GET  — nevyřešená nahlášení s náhledem obsahu a autorem.
 * POST — akce nad jedním nahlášením: hide / unhide / delete / resolve.
 *
 * Auth je `isAdmin(req)` z lib/adminAuth.js — Bearer ADMIN_TOKEN, stejně
 * jako zbytek `api/admin`. Token v query ani v těle se nepřijímá: URL
 * a těla requestů končí v logách.
 *
 * SKRÝT NENÍ SMAZAT. `is_hidden = true` schová příspěvek všem kromě autora
 * (API filtruje `is_hidden = false OR user_id = me`), takže se dá vrátit,
 * když se nahlášení ukáže jako plané. Mazání je nevratné a bere s sebou
 * i fotky ze storage.
 */
import { isAdmin } from '../../lib/adminAuth.js';
import { supabaseServer } from '../../lib/supabaseServer.js';
import { BUCKET_FOTEK } from '../../lib/community.js';

/** Náhled v tabulce moderace — celý text tam nemá co dělat. */
const NAHLED = 240;

const AKCE = ['hide', 'unhide', 'delete', 'resolve'];

/** Smaže soubory příspěvku ze storage. Kaskáda objekty v bucketu nemaže. */
async function smazFotkyPrispevku(postId) {
  const { data: fotky } = await supabaseServer
    .from('community_post_photos')
    .select('storage_path')
    .eq('post_id', postId);

  const cesty = (fotky || []).map((f) => f.storage_path).filter(Boolean);
  if (cesty.length === 0) return;

  const { error } = await supabaseServer.storage.from(BUCKET_FOTEK).remove(cesty);
  if (error) throw error;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Neoprávněný přístup' });
  }

  try {
    if (req.method === 'GET') {
      const vcetneVyresenych = String(req.query?.all || '') === '1';

      let dotaz = supabaseServer
        .from('community_reports')
        .select('id, post_id, reply_id, reporter_id, reason, created_at, resolved_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!vcetneVyresenych) dotaz = dotaz.is('resolved_at', null);

      const { data: nahlaseni, error } = await dotaz;
      if (error) throw error;

      const seznam = nahlaseni || [];
      const postIds = [...new Set(seznam.map((n) => n.post_id).filter(Boolean))];
      const replyIds = [...new Set(seznam.map((n) => n.reply_id).filter(Boolean))];

      const [prispevkyRes, odpovediRes] = await Promise.all([
        postIds.length
          ? supabaseServer
            .from('community_posts')
            .select('id, author_name, content, is_hidden, post_type, created_at')
            .in('id', postIds)
          : Promise.resolve({ data: [] }),
        replyIds.length
          ? supabaseServer
            .from('community_replies')
            .select('id, topic_id, author_name, content, created_at')
            .in('id', replyIds)
          : Promise.resolve({ data: [] }),
      ]);

      const prispevky = Object.fromEntries((prispevkyRes.data || []).map((p) => [p.id, p]));
      const odpovedi = Object.fromEntries((odpovediRes.data || []).map((o) => [o.id, o]));

      const polozky = seznam.map((n) => {
        const obsah = n.post_id ? prispevky[n.post_id] : odpovedi[n.reply_id];
        return {
          id: n.id,
          typ: n.post_id ? 'prispevek' : 'odpoved',
          post_id: n.post_id,
          reply_id: n.reply_id,
          reason: n.reason,
          created_at: n.created_at,
          resolved_at: n.resolved_at,
          // Obsah může být pryč — autor ho mezitím smazal sám.
          existuje: Boolean(obsah),
          author_name: obsah?.author_name ?? null,
          is_hidden: obsah?.is_hidden ?? null,
          nahled: obsah?.content
            ? obsah.content.slice(0, NAHLED) + (obsah.content.length > NAHLED ? '…' : '')
            : null,
        };
      });

      return res.status(200).json({ ok: true, reports: polozky });
    }

    // POST – akce
    const reportId = req.body?.report_id != null ? String(req.body.report_id).trim() : '';
    const akce = String(req.body?.action || '').trim();

    if (!reportId) return res.status(400).json({ error: 'Chybí id nahlášení.' });
    if (!AKCE.includes(akce)) {
      return res.status(400).json({ error: `Neznámá akce. Povolené: ${AKCE.join(', ')}.` });
    }

    const { data: report } = await supabaseServer
      .from('community_reports')
      .select('id, post_id, reply_id')
      .eq('id', reportId)
      .maybeSingle();

    if (!report) return res.status(404).json({ error: 'Nahlášení nenalezeno.' });

    if (akce === 'hide' || akce === 'unhide') {
      if (!report.post_id) {
        // Odpověď sloupec `is_hidden` nemá — skrývat jde jen příspěvek.
        return res.status(400).json({ error: 'Skrýt jde jen příspěvek, ne odpověď. Použij delete.' });
      }
      const { error } = await supabaseServer
        .from('community_posts')
        .update({ is_hidden: akce === 'hide' })
        .eq('id', report.post_id);
      if (error) throw error;
    }

    if (akce === 'delete') {
      if (report.post_id) {
        // Soubory první: kdyby se smazal řádek a úklid pak selhal, zůstanou
        // v bucketu fotky, ke kterým už nevede žádný záznam.
        await smazFotkyPrispevku(report.post_id);
        const { error } = await supabaseServer.from('community_posts').delete().eq('id', report.post_id);
        if (error) throw error;
      } else {
        const { error } = await supabaseServer.from('community_replies').delete().eq('id', report.reply_id);
        if (error) throw error;
      }
    }

    // Každá akce nahlášení uzavírá — i `unhide`, což znamená „podíval jsem
    // se a je to v pořádku". Nevyřešená fronta má obsahovat jen to, co
    // ještě nikdo neviděl.
    const { error: resolveErr } = await supabaseServer
      .from('community_reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', reportId);
    if (resolveErr) throw resolveErr;

    return res.status(200).json({ ok: true, action: akce, report_id: reportId });
  } catch (err) {
    console.error('[admin/community-reports]', err);
    return res.status(err?.statusCode || 500).json({
      error: err?.message || 'Akce se nepodařila.',
    });
  }
}
