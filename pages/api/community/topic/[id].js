// GET /api/community/topic/[id] – jedno téma včetně odpovědí
import { supabaseServer } from '../../../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Přihlas se.' });

  const { error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr) return res.status(401).json({ error: 'Neplatná session.' });

  const topicId = req.query?.id;
  if (!topicId) return res.status(400).json({ error: 'Chybí id tématu.' });

  const { data: topic, error: topicErr } = await supabaseServer
    .from('community_posts')
    .select('id, user_id, author_name, title, content, category_id, created_at, updated_at')
    .eq('id', topicId)
    .single();

  if (topicErr || !topic) {
    return res.status(404).json({ error: 'Téma nenalezeno.' });
  }

  const { data: replies, error: repliesErr } = await supabaseServer
    .from('community_replies')
    .select('id, user_id, author_name, content, created_at')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true });

  if (repliesErr) {
    console.error('[community/topic] replies', repliesErr);
    return res.status(200).json({ topic, replies: [] });
  }
  return res.status(200).json({ topic, replies: replies || [] });
}
