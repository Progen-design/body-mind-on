// GET /api/community/categories – seznam kategorií fóra (přihlášení)
import { supabaseServer } from '../../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Přihlas se.' });

  const { error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr) return res.status(401).json({ error: 'Neplatná session.' });

  const { data: categories, error } = await supabaseServer
    .from('community_categories')
    .select('id, name, slug, description, sort_order')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[community/categories]', error);
    return res.status(500).json({ error: 'Nepodařilo načíst kategorie', categories: [] });
  }

  const list = categories || [];
  const categoryIds = list.map((c) => c.id);
  const topicCountByCat = {};
  if (categoryIds.length > 0) {
    const { data: counts } = await supabaseServer
      .from('community_posts')
      .select('category_id')
      .in('category_id', categoryIds);
    (counts || []).forEach((row) => {
      const cid = row.category_id;
      if (cid) topicCountByCat[cid] = (topicCountByCat[cid] || 0) + 1;
    });
  }
  const withCount = list.map((c) => ({ ...c, topic_count: topicCountByCat[c.id] || 0 }));

  return res.status(200).json({ categories: withCount });
}
