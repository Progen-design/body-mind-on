// GET /api/community – seznam témat (volitelně filtr category_id)
// POST /api/community – nové téma (category_id, title, content)
import { supabaseServer } from '../../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Pro zobrazení komunity se přihlas.' });

  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Neplatná session. Přihlas se znovu.' });

  if (req.method === 'GET') {
    const categoryId = (req.query?.category_id || '').trim() || null;
    let query = supabaseServer
      .from('community_posts')
      .select('id, user_id, author_name, title, content, category_id, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (categoryId) query = query.eq('category_id', categoryId);
    const { data: topics, error } = await query;

    if (error) {
      console.error('[community] GET', error);
      return res.status(500).json({ error: 'Nepodařilo načíst témata', topics: [] });
    }

    const topicIds = (topics || []).map((t) => t.id);
    const replyCounts = {};
    if (topicIds.length > 0) {
      const { data: counts } = await supabaseServer
        .from('community_replies')
        .select('topic_id')
        .in('topic_id', topicIds);
      (counts || []).forEach((r) => {
        replyCounts[r.topic_id] = (replyCounts[r.topic_id] || 0) + 1;
      });
    }
    const topicsWithCount = (topics || []).map((t) => ({ ...t, reply_count: replyCounts[t.id] || 0 }));
    return res.status(200).json({ topics: topicsWithCount });
  }

  if (req.method === 'POST') {
    const { category_id, title, content } = req.body || {};
    const titleStr = (title != null ? String(title) : '').trim();
    const contentStr = (content != null ? String(content) : '').trim();
    const catId = (category_id != null ? String(category_id).trim() : '') || null;
    if (!titleStr || !contentStr) {
      return res.status(400).json({ error: 'Vyplň nadpis i text příspěvku.' });
    }
    if (titleStr.length > 200) return res.status(400).json({ error: 'Nadpis max. 200 znaků.' });

    const authorName = (user.user_metadata?.name || user.email?.split('@')[0] || 'Člen').trim().slice(0, 100);

    const { data: topic, error: insertErr } = await supabaseServer
      .from('community_posts')
      .insert({
        user_id: user.id,
        author_name: authorName,
        title: titleStr,
        content: contentStr,
        category_id: catId || null,
      })
      .select('id, author_name, title, content, category_id, created_at')
      .single();

    if (insertErr) {
      console.error('[community] POST', insertErr);
      return res.status(500).json({ error: 'Téma se nepodařilo uložit.' });
    }
    return res.status(201).json({ topic: { ...topic, reply_count: 0 } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
