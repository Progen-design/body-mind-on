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

    const list = topics || [];
    const topicIds = list.map((t) => t.id);
    const userIds = [...new Set(list.map((t) => t.user_id).filter(Boolean))];

    const [countsRes, repliesRes, profilesRes] = await Promise.all([
      topicIds.length > 0
        ? supabaseServer.from('community_replies').select('topic_id').in('topic_id', topicIds)
        : Promise.resolve({ data: [] }),
      topicIds.length > 0
        ? supabaseServer
            .from('community_replies')
            .select('id, topic_id, user_id, author_name, content, created_at')
            .in('topic_id', topicIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabaseServer.from('profiles').select('id, avatar_url').in('id', userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const replyCounts = {};
    (countsRes.data || []).forEach((r) => {
      replyCounts[r.topic_id] = (replyCounts[r.topic_id] || 0) + 1;
    });

    const allReplies = repliesRes.data || [];
    const lastRepliesByTopic = {};
    allReplies.forEach((r) => {
      if (!lastRepliesByTopic[r.topic_id]) lastRepliesByTopic[r.topic_id] = [];
      if (lastRepliesByTopic[r.topic_id].length < 3) lastRepliesByTopic[r.topic_id].push(r);
    });
    const replyUserIds = [...new Set(allReplies.map((r) => r.user_id).filter(Boolean))];
    const replyProfiles =
      replyUserIds.length > 0
        ? await supabaseServer.from('profiles').select('id, avatar_url').in('id', replyUserIds)
        : { data: [] };
    const avatarByUserId = {};
    (profilesRes.data || []).forEach((p) => {
      avatarByUserId[p.id] = p.avatar_url || null;
    });
    (replyProfiles.data || []).forEach((p) => {
      avatarByUserId[p.id] = p.avatar_url || null;
    });

    const topicsWithCount = list.map((t) => {
      const lastThree = lastRepliesByTopic[t.id] || [];
      const chronological = [...lastThree].reverse();
      return {
        ...t,
        reply_count: replyCounts[t.id] || 0,
        author_avatar_url: avatarByUserId[t.user_id] || null,
        last_replies: chronological.map((r) => ({
        id: r.id,
        author_name: r.author_name,
        author_avatar_url: avatarByUserId[r.user_id] || null,
        content: r.content.slice(0, 200) + (r.content.length > 200 ? '…' : ''),
        created_at: r.created_at,
      })),
      };
    });
    return res.status(200).json({ topics: topicsWithCount });
  }

  if (req.method === 'POST') {
    const { category_id, content } = req.body || {};
    const contentStr = (content != null ? String(content) : '').trim();
    const catId = (category_id != null ? String(category_id).trim() : '') || null;
    if (!contentStr) return res.status(400).json({ error: 'Napiš zprávu.' });

    const authorName = (user.user_metadata?.name || user.email?.split('@')[0] || 'Člen').trim().slice(0, 100);
    const titleStr = contentStr.slice(0, 100).trim() || 'Zpráva';

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
    const { data: profile } = await supabaseServer.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
    return res.status(201).json({
      topic: { ...topic, reply_count: 0, author_avatar_url: profile?.avatar_url || null, last_replies: [] },
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
