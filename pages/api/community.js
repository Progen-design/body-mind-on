// GET /api/community – seznam příspěvků (jen přihlášení)
// POST /api/community – přidat příspěvek (jen přihlášení)
import { supabaseServer } from '../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Pro zobrazení komunity se přihlas.' });
  }

  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ error: 'Neplatná session. Přihlas se znovu.' });
  }

  if (req.method === 'GET') {
    const { data: posts, error } = await supabaseServer
      .from('community_posts')
      .select('id, user_id, author_name, title, content, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[community] GET', error);
      return res.status(500).json({ error: 'Nepodařilo se načíst příspěvky', posts: [] });
    }
    return res.status(200).json({ posts: posts || [] });
  }

  if (req.method === 'POST') {
    const { title, content } = req.body || {};
    const titleStr = (title != null ? String(title) : '').trim();
    const contentStr = (content != null ? String(content) : '').trim();
    if (!titleStr || !contentStr) {
      return res.status(400).json({ error: 'Vyplň nadpis i text příspěvku.' });
    }
    if (titleStr.length > 200) {
      return res.status(400).json({ error: 'Nadpis může mít max. 200 znaků.' });
    }

    const authorName = (user.user_metadata?.name || user.email?.split('@')[0] || 'Člen').trim().slice(0, 100);

    const { data: post, error: insertErr } = await supabaseServer
      .from('community_posts')
      .insert({
        user_id: user.id,
        author_name: authorName,
        title: titleStr,
        content: contentStr,
      })
      .select('id, author_name, title, content, created_at')
      .single();

    if (insertErr) {
      console.error('[community] POST', insertErr);
      return res.status(500).json({ error: 'Příspěvek se nepodařilo uložit.' });
    }
    return res.status(201).json({ post });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
