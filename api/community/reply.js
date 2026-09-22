// POST /api/community/reply – přidat odpověď do tématu
import { supabaseServer } from '../../lib/supabaseServer.js';
import { jmenoAutora, prihlasenyUzivatel } from '../../lib/community.js';

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

  // Přezdívka z „Jak ti máme říkat", ne e-mail — stejně jako u příspěvků.
  const authorName = await jmenoAutora(user);

  const { data: reply, error: insertErr } = await supabaseServer
    .from('community_replies')
    .insert({
      topic_id: topicId,
      user_id: user.id,
      author_name: authorName,
      content: contentStr,
    })
    .select('id, user_id, author_name, content, created_at')
    .single();

  if (insertErr) {
    console.error('[community/reply]', insertErr);
    return res.status(500).json({ error: 'Odpověď se nepodařilo uložit.' });
  }
  const { data: profile } = await supabaseServer.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
  const replyWithAvatar = { ...reply, author_avatar_url: profile?.avatar_url || null };
  return res.status(201).json({ reply: replyWithAvatar });
}
