// GET /api/community/topic/[id] – jedno téma včetně odpovědí, fotek a lajků
import { supabaseServer } from '../../../lib/supabaseServer.js';
import { avatary, fotkyPrispevku, lajkyUzivatele, overPravaKomunity, prihlasenyUzivatel } from '../../../lib/community.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await prihlasenyUzivatel(req);
  if (!auth.user) return res.status(auth.status).json({ error: auth.error });

  // Čtení jen s aktivním členstvím (prošlý trial / zrušené předplatné → 403).
  const pristup = await overPravaKomunity(auth.user);
  if (!pristup.allowed) return res.status(pristup.status).json({ error: pristup.error });
  const { user } = auth;

  const topicId = req.query?.id;
  if (!topicId) return res.status(400).json({ error: 'Chybí id tématu.' });

  const { data: topic, error: topicErr } = await supabaseServer
    .from('community_posts')
    .select(
      'id, user_id, author_name, title, content, category_id, post_type, weight_kg,'
      + ' is_hidden, reply_count, like_count, created_at, updated_at',
    )
    .eq('id', topicId)
    .maybeSingle();

  if (topicErr || !topic) {
    return res.status(404).json({ error: 'Téma nenalezeno.' });
  }

  // Skryté téma („Jen pro mě") patří jen autorovi. Cizímu člověku říkáme
  // totéž co u neexistujícího — že něco takového existuje, se dozvědět nemá.
  if (topic.is_hidden && topic.user_id !== user.id) {
    return res.status(404).json({ error: 'Téma nenalezeno.' });
  }

  const { data: replies, error: repliesErr } = await supabaseServer
    .from('community_replies')
    .select('id, user_id, author_name, content, created_at, is_team')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true });

  const replyList = repliesErr ? [] : (replies || []);

  const [avatarByUserId, fotky, lajkl] = await Promise.all([
    avatary([topic.user_id, ...replyList.map((r) => r.user_id)]),
    fotkyPrispevku([topic.id]),
    lajkyUzivatele([topic.id], user.id),
  ]);

  const topicWithAvatar = {
    ...topic,
    team_answered: replyList.some((r) => r.is_team),
    author_avatar_url: avatarByUserId[topic.user_id] || null,
    photos: fotky[topic.id] || [],
    liked_by_me: lajkl.has(topic.id),
    can_delete: topic.user_id === user.id,
  };
  const repliesWithAvatar = replyList.map((r) => ({
    ...r,
    author_avatar_url: avatarByUserId[r.user_id] || null,
  }));
  return res.status(200).json({ topic: topicWithAvatar, replies: repliesWithAvatar });
}
