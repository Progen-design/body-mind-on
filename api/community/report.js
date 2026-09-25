// POST /api/community/report – nahlásit příspěvek nebo odpověď
//
// JEDEN ČLOVĚK NAHLÁSÍ JEDNU VĚC JEDNOU. Duplicita není chyba uživatele —
// klidně klikne dvakrát nebo nahlásí totéž z detailu i ze seznamu — takže
// se vrací 200 a nic se nevkládá. Autoritou je unikátní index z migrace
// 20260923010000, ne tahle kontrola; ta jen šetří kolo do databáze.
import { supabaseServer } from '../../lib/supabaseServer.js';
import { DUVODY_NAHLASENI, overPravaKomunity, prihlasenyUzivatel } from '../../lib/community.js';

/** Volný text má strop — do moderace stačí věta, ne esej. */
const MAX_DUVOD = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await prihlasenyUzivatel(req);
  if (!auth.user) return res.status(auth.status).json({ error: auth.error });

  // Nahlásit smí každý, kdo komunitu čte — i START. Bezpečnost není výsada ON CLUBU.
  const pristup = await overPravaKomunity(auth.user);
  if (!pristup.allowed) return res.status(pristup.status).json({ error: pristup.error });
  const { user } = auth;

  const postId = (req.body?.post_id != null ? String(req.body.post_id).trim() : '') || null;
  const replyId = (req.body?.reply_id != null ? String(req.body.reply_id).trim() : '') || null;
  const duvod = String(req.body?.reason || '').trim().slice(0, MAX_DUVOD);

  if (!postId && !replyId) {
    return res.status(400).json({ error: 'Chybí, co se nahlašuje.' });
  }
  if (postId && replyId) {
    // Řádek nese vždy jen jedno z obojího — jinak by unikátní indexy
    // hlídaly každý něco jiného a moderace by nevěděla, čeho se to týká.
    return res.status(400).json({ error: 'Nahlásit jde příspěvek, nebo odpověď, ne obojí naráz.' });
  }
  if (!duvod) {
    return res.status(400).json({ error: 'Napiš, co je špatně.' });
  }

  // Nahlásit jde jen to, co existuje.
  const tabulka = postId ? 'community_posts' : 'community_replies';
  const { data: cil } = await supabaseServer
    .from(tabulka)
    .select('id')
    .eq('id', postId || replyId)
    .maybeSingle();
  if (!cil) return res.status(404).json({ error: 'Obsah už neexistuje.' });

  let dotaz = supabaseServer
    .from('community_reports')
    .select('id')
    .eq('reporter_id', user.id);
  dotaz = postId ? dotaz.eq('post_id', postId) : dotaz.eq('reply_id', replyId);
  const { data: uzNahlaseno } = await dotaz.maybeSingle();

  if (uzNahlaseno) {
    return res.status(200).json({ ok: true, duplicitni: true });
  }

  const { error } = await supabaseServer.from('community_reports').insert({
    post_id: postId,
    reply_id: replyId,
    reporter_id: user.id,
    reason: duvod,
  });

  if (error) {
    // 23505 = unikátní index. Mezi kontrolou výš a insertem se dá kliknout
    // dvakrát; pro uživatele je to pořád úspěch, ne chyba.
    if (error.code === '23505') return res.status(200).json({ ok: true, duplicitni: true });
    console.error('[community/report]', error);
    return res.status(500).json({ error: 'Nahlášení se nepodařilo uložit.' });
  }

  return res.status(201).json({ ok: true, duvody: DUVODY_NAHLASENI.map((d) => d.id) });
}
