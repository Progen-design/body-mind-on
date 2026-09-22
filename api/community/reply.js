// POST /api/community/reply – přidat odpověď do tématu
import { supabaseServer } from '../../lib/supabaseServer.js';
import { jeAdminSUctem } from '../../lib/adminAuth.js';
import {
  jmenoAutora,
  maSouhlasKomunity,
  prihlasenyUzivatel,
  zapisSouhlasKomunity,
} from '../../lib/community.js';

/** Jméno, pod kterým vystupuje tým. Ne přezdívka konkrétního člověka. */
const JMENO_TYMU = 'Tým BMON';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await prihlasenyUzivatel(req);
  if (!auth.user) return res.status(auth.status).json({ error: auth.error });
  const { user } = auth;

  const { topic_id, content } = req.body || {};
  const topicId = (topic_id != null ? String(topic_id).trim() : '') || null;
  const contentStr = (content != null ? String(content) : '').trim();
  if (!topicId || !contentStr) {
    return res.status(400).json({ error: 'Vyplň text odpovědi a zvol téma.' });
  }

  // TÝMOVÁ ODPOVĚĎ SE POZNÁ PODLE ADMIN_TOKENU, NE PODLE TOHO, CO POŠLE
  // PROHLÍŽEČ. Kdyby `is_team` chodilo v těle, označí se za tým kdokoli.
  //
  // Token jde v `x-admin-token`, protože `Authorization` tu nese
  // uživatelskou session: `community_replies.user_id` je NOT NULL s cizím
  // klíčem, takže i odpověď týmu musí mít skutečný účet autora.
  const jeTym = jeAdminSUctem(req);

  // SOUHLAS PLATÍ I PRO KOMENTÁŘE. Pravidla mluví o tom, co se smí psát —
  // a psát jde i pod cizí příspěvek. Tým je z toho ven: nevystupuje jako
  // člen komunity, pravidla vydává.
  if (!jeTym && !(await maSouhlasKomunity(user.id))) {
    if (req.body?.souhlas_s_pravidly !== true) {
      return res.status(403).json({
        error: 'Nejdřív potvrď pravidla komunity.',
        needs_consent: true,
      });
    }
    const zapis = await zapisSouhlasKomunity(user.id);
    if (!zapis.ok) {
      console.error('[community/reply] souhlas zapis', zapis.error);
      return res.status(500).json({ error: 'Souhlas se nepodařilo uložit, zkus to prosím znovu.' });
    }
  }

  // Přezdívka z „Jak ti máme říkat", ne e-mail — stejně jako u příspěvků.
  const authorName = jeTym ? JMENO_TYMU : await jmenoAutora(user);

  const { data: reply, error: insertErr } = await supabaseServer
    .from('community_replies')
    .insert({
      topic_id: topicId,
      user_id: user.id,
      author_name: authorName,
      content: contentStr,
      is_team: jeTym,
    })
    .select('id, user_id, author_name, content, created_at, is_team')
    .single();

  if (insertErr) {
    console.error('[community/reply]', insertErr);
    return res.status(500).json({ error: 'Odpověď se nepodařilo uložit.' });
  }

  // Tým nevystupuje pod avatarem konkrétního člověka — štítek „Tým BMON"
  // je to, co má čtenář poznat.
  const { data: profile } = jeTym
    ? { data: null }
    : await supabaseServer.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();

  return res.status(201).json({
    reply: { ...reply, author_avatar_url: profile?.avatar_url || null },
  });
}
