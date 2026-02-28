// POST /api/community/reply – přidat odpověď do tématu
import { supabaseServer } from '../../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Přihlas se.' });

  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Neplatná session.' });

  const { topic_id, content } = req.body || {};
  const topicId = (topic_id != null ? String(topic_id).trim() : '') || null;
  const contentStr = (content != null ? String(content) : '').trim();
  if (!topicId || !contentStr) {
    return res.status(400).json({ error: 'Vyplň text odpovědi a zvol téma.' });
  }

  const authorName = (user.user_metadata?.name || user.email?.split('@')[0] || 'Člen').trim().slice(0, 100);

  const { data: reply, error: insertErr } = await supabaseServer
    .from('community_replies')
    .insert({
      topic_id: topicId,
      user_id: user.id,
      author_name: authorName,
      content: contentStr,
    })
    .select('id, author_name, content, created_at')
    .single();

  if (insertErr) {
    console.error('[community/reply]', insertErr);
    return res.status(500).json({ error: 'Odpověď se nepodařilo uložit.' });
  }
  return res.status(201).json({ reply });
}
