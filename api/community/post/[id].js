// DELETE /api/community/post/[id] – smazat vlastní příspěvek
//
// Vlastník, nikdo jiný (admin moderace přijde v PR 2). Řádky odpovědí,
// fotek a lajků odejdou kaskádou, ale SOUBORY V BUCKETU KASKÁDA NEMAŽE —
// ty se musí smazat ručně, jinak by v private bucketu zůstaly fotky
// postavy, na které už nevede žádný řádek a nikdo je nenajde.
import { supabaseServer } from '../../../lib/supabaseServer.js';
import { BUCKET_FOTEK, prihlasenyUzivatel } from '../../../lib/community.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await prihlasenyUzivatel(req);
  if (!auth.user) return res.status(auth.status).json({ error: auth.error });
  const { user } = auth;

  const postId = req.query?.id ? String(req.query.id).trim() : '';
  if (!postId) return res.status(400).json({ error: 'Chybí id příspěvku.' });

  const { data: post, error: postErr } = await supabaseServer
    .from('community_posts')
    .select('id, user_id')
    .eq('id', postId)
    .maybeSingle();

  if (postErr || !post) return res.status(404).json({ error: 'Příspěvek nenalezen.' });
  if (post.user_id !== user.id) {
    return res.status(403).json({ error: 'Smazat jde jen vlastní příspěvek.' });
  }

  const { data: fotky } = await supabaseServer
    .from('community_post_photos')
    .select('storage_path')
    .eq('post_id', postId);

  const cesty = (fotky || []).map((f) => f.storage_path).filter(Boolean);
  if (cesty.length > 0) {
    // Soubory jdou první. Kdyby se smazal řádek a úklid souborů pak selhal,
    // zůstanou v bucketu osiřelé fotky, ke kterým už nevede žádná cesta.
    const { error: storageErr } = await supabaseServer.storage.from(BUCKET_FOTEK).remove(cesty);
    if (storageErr) {
      console.error('[community/post] storage', storageErr);
      return res.status(500).json({ error: 'Fotky se nepodařilo smazat, příspěvek zůstává.' });
    }
  }

  const { error: deleteErr } = await supabaseServer
    .from('community_posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', user.id);

  if (deleteErr) {
    console.error('[community/post] delete', deleteErr);
    return res.status(500).json({ error: 'Příspěvek se nepodařilo smazat.' });
  }

  return res.status(200).json({ ok: true, deleted_id: postId });
}
