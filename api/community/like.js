// POST /api/community/like – přepnout lajk u příspěvku
//
// Toggle, ne dvě cesty: klient posílá jen `post_id` a server řekne, jak to
// dopadlo. Dvojklik ani dva telefony nevyrobí druhý lajk — brání tomu
// primární klíč (post_id, user_id), ne aplikace.
import { supabaseServer } from '../../lib/supabaseServer.js';
import { overPravaKomunity, prihlasenyUzivatel } from '../../lib/community.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await prihlasenyUzivatel(req);
  if (!auth.user) return res.status(auth.status).json({ error: auth.error });
  const { user } = auth;

  // Lajk je taky psaní — jen ON CLUB (a tým).
  const pristup = await overPravaKomunity(user, { psani: true });
  if (!pristup.allowed) return res.status(pristup.status).json({ error: pristup.error });

  const postId = (req.body?.post_id != null ? String(req.body.post_id).trim() : '') || null;
  if (!postId) return res.status(400).json({ error: 'Chybí id příspěvku.' });

  const { data: post, error: postErr } = await supabaseServer
    .from('community_posts')
    .select('id, user_id, is_hidden')
    .eq('id', postId)
    .maybeSingle();

  if (postErr || !post) return res.status(404).json({ error: 'Příspěvek nenalezen.' });
  // Skrytý příspěvek cizí člověk nevidí, takže ho nemá ani lajkovat.
  if (post.is_hidden && post.user_id !== user.id) {
    return res.status(404).json({ error: 'Příspěvek nenalezen.' });
  }

  const { data: existujici } = await supabaseServer
    .from('community_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existujici) {
    const { error } = await supabaseServer
      .from('community_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);
    if (error) {
      console.error('[community/like] delete', error);
      return res.status(500).json({ error: 'Lajk se nepodařilo odebrat.' });
    }
  } else {
    const { error } = await supabaseServer
      .from('community_likes')
      .insert({ post_id: postId, user_id: user.id });
    if (error) {
      console.error('[community/like] insert', error);
      return res.status(500).json({ error: 'Lajk se nepodařilo uložit.' });
    }
  }

  // Počet se čte zpátky z příspěvku, ne dopočítává v hlavě — sloupec plní
  // trigger, takže tohle je jediná pravda o tom, kolik lajků tam je.
  const { data: poZmene } = await supabaseServer
    .from('community_posts')
    .select('like_count')
    .eq('id', postId)
    .maybeSingle();

  return res.status(200).json({
    liked: !existujici,
    like_count: poZmene?.like_count ?? 0,
  });
}
