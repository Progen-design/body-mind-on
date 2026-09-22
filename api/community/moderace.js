// /api/community/moderace.js
/**
 * MODERACE KOMUNITY.
 *
 * GET  — nevyřízená nahlášení a nezodpovězené dotazy v jedné odpovědi.
 * POST — akce nad jedním nahlášením: hide / unhide / delete / resolve.
 *
 * AUTORIZACE JE PŘIHLÁŠENÝ ČLOVĚK, NE TOKEN. Bearer session jako zbytek
 * komunity, a nad ní `jeAdminKomunity()` proti `ADMIN_EMAILS`. Endpoint
 * proto leží v `api/community/`, ne v `api/admin/`: s `ADMIN_TOKEN` nemá
 * nic společného a míchat dvě různá oprávnění do jedné složky by svádělo
 * sáhnout v něm po `isAdmin()`.
 *
 * SKRÝT NENÍ SMAZAT. `is_hidden = true` schová příspěvek všem kromě autora
 * a dá se vrátit, když se nahlášení ukáže jako plané. Mazání je nevratné
 * a bere s sebou i fotky ze storage.
 *
 * ODPOVÍDÁ SE PŘES `POST /api/community/reply`, ne odsud — `is_team` řeší
 * ten endpoint a druhá cesta do `community_replies` by znamenala druhé
 * místo, kde jde na příznak zapomenout.
 */
import { supabaseServer } from '../../lib/supabaseServer.js';
import { BUCKET_FOTEK, jeAdminKomunity, prihlasenyUzivatel } from '../../lib/community.js';

/** Náhled obsahu v moderaci — celý text je v appce. */
const NAHLED = 400;

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

/** Nevyřízená nahlášení s náhledem obsahu a autorem. */
async function nactiNahlaseni() {
  const { data: nahlaseni, error } = await supabaseServer
    .from('community_reports')
    .select('id, post_id, reply_id, reporter_id, reason, created_at, resolved_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const seznam = nahlaseni || [];
  const postIds = [...new Set(seznam.map((n) => n.post_id).filter(Boolean))];
  const replyIds = [...new Set(seznam.map((n) => n.reply_id).filter(Boolean))];

  const [prispevkyRes, odpovediRes] = await Promise.all([
    postIds.length
      ? supabaseServer
        .from('community_posts')
        .select('id, author_name, content, is_hidden')
        .in('id', postIds)
      : Promise.resolve({ data: [] }),
    replyIds.length
      ? supabaseServer
        .from('community_replies')
        .select('id, author_name, content')
        .in('id', replyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const prispevky = Object.fromEntries((prispevkyRes.data || []).map((p) => [p.id, p]));
  const odpovedi = Object.fromEntries((odpovediRes.data || []).map((o) => [o.id, o]));

  return seznam.map((n) => {
    const obsah = n.post_id ? prispevky[n.post_id] : odpovedi[n.reply_id];
    return {
      id: n.id,
      typ: n.post_id ? 'prispevek' : 'odpoved',
      post_id: n.post_id,
      reply_id: n.reply_id,
      reason: n.reason,
      created_at: n.created_at,
      // Obsah může být pryč — autor ho mezitím smazal sám.
      existuje: Boolean(obsah),
      author_name: obsah?.author_name ?? null,
      is_hidden: obsah?.is_hidden ?? null,
      nahled: obsah?.content
        ? obsah.content.slice(0, NAHLED) + (obsah.content.length > NAHLED ? '…' : '')
        : null,
    };
  });
}

/** Dotazy, na které tým zatím neodpověděl. */
async function nactiDotazy() {
  const { data: kategorie } = await supabaseServer
    .from('community_categories')
    .select('id')
    .eq('slug', 'dotazy')
    .maybeSingle();

  // Migrace 20260923010000 ještě neběžela — prázdná fronta je lepší odpověď
  // než pád, moderátor aspoň vidí nahlášení.
  if (!kategorie) return { dotazy: [], kategorie_chybi: true };

  const { data: prispevky, error } = await supabaseServer
    .from('community_posts')
    .select('id, author_name, title, content, created_at, reply_count')
    .eq('category_id', kategorie.id)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const seznam = prispevky || [];
  const ids = seznam.map((d) => d.id);

  const { data: tymove } = ids.length
    ? await supabaseServer
      .from('community_replies')
      .select('topic_id')
      .in('topic_id', ids)
      .eq('is_team', true)
    : { data: [] };

  const zodpovezene = new Set((tymove || []).map((r) => r.topic_id));

  return {
    dotazy: seznam
      .filter((d) => !zodpovezene.has(d.id))
      .map((d) => ({
        id: d.id,
        author_name: d.author_name,
        created_at: d.created_at,
        reply_count: d.reply_count,
        nahled: d.content
          ? d.content.slice(0, NAHLED) + (d.content.length > NAHLED ? '…' : '')
          : d.title,
      })),
    kategorie_chybi: false,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await prihlasenyUzivatel(req);
  if (!auth.user) return res.status(auth.status).json({ error: auth.error });

  // Běžnému členovi se o existenci moderace nic neříká.
  if (!jeAdminKomunity(auth.user)) {
    return res.status(403).json({ error: 'Neoprávněný přístup' });
  }

  try {
    if (req.method === 'GET') {
      const [nahlaseni, { dotazy, kategorie_chybi: kategorieChybi }] = await Promise.all([
        nactiNahlaseni(),
        nactiDotazy(),
      ]);
      return res.status(200).json({ ok: true, reports: nahlaseni, questions: dotazy, kategorie_chybi: kategorieChybi });
    }

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

    // Každá akce nahlášení uzavírá, i `unhide` — to znamená „podíval jsem se
    // a je to v pořádku". Fronta má obsahovat jen to, co ještě nikdo neviděl.
    const { error: resolveErr } = await supabaseServer
      .from('community_reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', reportId);
    if (resolveErr) throw resolveErr;

    return res.status(200).json({ ok: true, action: akce, report_id: reportId });
  } catch (err) {
    console.error('[community/moderace]', err);
    return res.status(err?.statusCode || 500).json({ error: err?.message || 'Akce se nepodařila.' });
  }
}
