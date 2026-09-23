// GET /api/community – seznam témat (volitelně filtr category_id)
// POST /api/community – nové téma (category_id, content, post_type, weight_kg, photos[])
import { supabaseServer } from '../../lib/supabaseServer.js';
import {
  MAX_FOTEK,
  MAX_PRISPEVKU_DENNE,
  avatary,
  fotkyPrispevku,
  jeAdminKomunity,
  jmenoAutora,
  lajkyUzivatele,
  maSouhlasKomunity,
  nahrajFotky,
  posledniVaha,
  prekrocilDenniLimit,
  prihlasenyUzivatel,
  zapisSouhlasKomunity,
} from '../../lib/community.js';

/** Náhled odpovědi v kartě — celý text by kartu roztáhl přes celou obrazovku. */
const NAHLED_ODPOVEDI = 200;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await prihlasenyUzivatel(req);
  if (!auth.user) return res.status(auth.status).json({ error: auth.error });
  const { user } = auth;

  if (req.method === 'GET') {
    const categoryId = (req.query?.category_id || '').trim() || null;
    let query = supabaseServer
      .from('community_posts')
      .select(
        'id, user_id, author_name, title, content, category_id, post_type, weight_kg,'
        + ' is_hidden, reply_count, like_count, created_at, updated_at',
      )
      // „JEN PRO MĚ" ZNAMENÁ JEN PRO MĚ. Skrytý příspěvek vidí výhradně
      // autor — filtruje se v dotazu, ne až při vykreslení.
      .or(`is_hidden.eq.false,user_id.eq.${user.id}`)
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

    // Poslední tři odpovědi ke každému tématu jako náhled. `reply_count`
    // se už nepočítá tady — drží ho sloupec s triggerem.
    const { data: repliesData } = topicIds.length > 0
      ? await supabaseServer
        .from('community_replies')
        .select('id, topic_id, user_id, author_name, content, created_at, is_team')
        .in('topic_id', topicIds)
        .order('created_at', { ascending: false })
      : { data: [] };

    const allReplies = repliesData || [];
    const lastRepliesByTopic = {};
    allReplies.forEach((r) => {
      if (!lastRepliesByTopic[r.topic_id]) lastRepliesByTopic[r.topic_id] = [];
      if (lastRepliesByTopic[r.topic_id].length < 3) lastRepliesByTopic[r.topic_id].push(r);
    });

    const [avatarByUserId, fotky, lajkl] = await Promise.all([
      avatary([...list.map((t) => t.user_id), ...allReplies.map((r) => r.user_id)]),
      fotkyPrispevku(topicIds),
      lajkyUzivatele(topicIds, user.id),
    ]);

    // ČEKÁ NA ODPOVĚĎ = v Dotazech, a zatím bez odpovědi od týmu. Počítá se
    // ze VŠECH odpovědí, ne jen z těch dvou v náhledu — jinak by dotaz se
    // třemi odpověďmi od členů a týmovou na čtvrtém místě vypadal jako
    // nevyřízený.
    const maOdpovedTymu = new Set(allReplies.filter((r) => r.is_team).map((r) => r.topic_id));

    const topicsWithCount = list.map((t) => ({
      ...t,
      team_answered: maOdpovedTymu.has(t.id),
      author_avatar_url: avatarByUserId[t.user_id] || null,
      photos: fotky[t.id] || [],
      liked_by_me: lajkl.has(t.id),
      can_delete: t.user_id === user.id,
      last_replies: [...(lastRepliesByTopic[t.id] || [])].reverse().map((r) => ({
        id: r.id,
        author_name: r.author_name,
        author_avatar_url: avatarByUserId[r.user_id] || null,
        is_team: r.is_team === true,
        content: r.content.slice(0, NAHLED_ODPOVEDI) + (r.content.length > NAHLED_ODPOVEDI ? '…' : ''),
        created_at: r.created_at,
      })),
    }));
    // `is_admin` řídí, jestli se nad seznamem ukáže panel moderace. Je to
    // jen UI příznak — každý endpoint moderace si oprávnění ověřuje sám.
    return res.status(200).json({ topics: topicsWithCount, is_admin: jeAdminKomunity(user) });
  }

  // POST
  const { category_id, content, post_type, weight_kg, photos, is_hidden } = req.body || {};
  const contentStr = (content != null ? String(content) : '').trim();
  const catId = (category_id != null ? String(category_id).trim() : '') || null;
  const typ = post_type === 'checkin' ? 'checkin' : 'text';
  const fotkyVstup = Array.isArray(photos) ? photos.filter(Boolean) : [];

  // Check-in smí být i beze slov — fotka a váha samy o sobě něco řeknou.
  if (!contentStr && typ !== 'checkin') return res.status(400).json({ error: 'Napiš zprávu.' });
  if (!contentStr && fotkyVstup.length === 0 && weight_kg == null) {
    return res.status(400).json({ error: 'Přidej fotku, váhu nebo pár slov.' });
  }
  if (fotkyVstup.length > MAX_FOTEK) {
    return res.status(400).json({ error: `Najednou jde přidat nejvýš ${MAX_FOTEK} fotky.` });
  }

  // PRAVIDLA SE POTVRZUJÍ PŘED PRVNÍM PŘÍSPĚVKEM, NE PŘI REGISTRACI.
  // Kdo do komunity nikdy nenapíše, nemá co odsouhlasovat. Klient posílá
  // `souhlas_s_pravidly: true` ze zaškrtávátka; bez platného souhlasu
  // request neprojde a UI podle `needs_consent` ukáže checkbox.
  if (!(await maSouhlasKomunity(user.id))) {
    if (req.body?.souhlas_s_pravidly !== true) {
      return res.status(403).json({
        error: 'Nejdřív potvrď pravidla komunity.',
        needs_consent: true,
      });
    }
    const zapis = await zapisSouhlasKomunity(user.id);
    if (!zapis.ok) {
      // Bez doložitelného souhlasu příspěvek neuložíme — audit je to,
      // kvůli čemu ta tabulka existuje (GDPR čl. 7 odst. 1).
      console.error('[community] souhlas zapis', zapis.error);
      return res.status(500).json({ error: 'Souhlas se nepodařilo uložit, zkus to prosím znovu.' });
    }
  }

  if (await prekrocilDenniLimit(user.id)) {
    return res.status(429).json({
      error: `Na dnešek stačí — víc než ${MAX_PRISPEVKU_DENNE} příspěvků za den neuložíme. Zkus to zítra.`,
    });
  }

  // VÁHU SI NEVYMÝŠLÍME. U check-inu bez vyplněné váhy se vezme poslední
  // vážení z `body_measurements`; když žádné není, zůstane prázdná —
  // nula ani odhad není měření.
  let vaha = null;
  if (typ === 'checkin') {
    const zadana = Number(weight_kg);
    vaha = Number.isFinite(zadana) && zadana > 0
      ? Math.round(zadana * 10) / 10
      : await posledniVaha(user.id);
  }

  const authorName = await jmenoAutora(user);
  const titleStr = contentStr.slice(0, 100).trim() || (typ === 'checkin' ? 'Check-in' : 'Zpráva');

  const { data: topic, error: insertErr } = await supabaseServer
    .from('community_posts')
    .insert({
      user_id: user.id,
      author_name: authorName,
      title: titleStr,
      content: contentStr,
      category_id: catId,
      post_type: typ,
      weight_kg: vaha,
      is_hidden: is_hidden === true,
    })
    .select(
      'id, user_id, author_name, title, content, category_id, post_type, weight_kg,'
      + ' is_hidden, reply_count, like_count, created_at',
    )
    .single();

  if (insertErr) {
    console.error('[community] POST', insertErr);
    return res.status(500).json({ error: 'Téma se nepodařilo uložit.' });
  }

  let fotkySignovane = [];
  if (fotkyVstup.length > 0) {
    try {
      await nahrajFotky(fotkyVstup, { userId: user.id, postId: topic.id });
      fotkySignovane = (await fotkyPrispevku([topic.id]))[topic.id] || [];
    } catch (err) {
      // Příspěvek bez fotek, o které člověk žádal, je polovičatý výsledek —
      // radši ho smažeme celý a řekneme proč, než abychom tvrdili „uloženo".
      await supabaseServer.from('community_posts').delete().eq('id', topic.id);
      console.error('[community] POST fotky', err);
      return res.status(err?.statusCode || 500).json({
        error: err?.statusCode ? err.message : 'Fotky se nepodařilo uložit, zkus to prosím znovu.',
      });
    }
  }

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  return res.status(201).json({
    topic: {
      ...topic,
      author_avatar_url: profile?.avatar_url || null,
      photos: fotkySignovane,
      liked_by_me: false,
      can_delete: true,
      last_replies: [],
    },
  });
}
