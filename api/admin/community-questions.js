// /api/admin/community-questions.js
/**
 * ADMIN: NEZODPOVĚZENÉ DOTAZY.
 *
 * Fronta pro sekci „Dotazy" — co se zeptal člen a tým to zatím nechal bez
 * odpovědi. Sem se dívá tým, ne moderace, proto vlastní endpoint a ne další
 * větev v `community-reports.js`: jsou to dvě různé práce a míchat je do
 * jednoho seznamu znamená, že se ta nepříjemnější odbyde.
 *
 * ODPOVÍDÁ SE PŘES `POST /api/community/reply`, ne odsud. Odpověď musí mít
 * skutečného autora (`community_replies.user_id` je NOT NULL s cizím klíčem)
 * a `is_team` nastavuje ten endpoint podle `x-admin-token`. Druhá cesta do
 * téže tabulky by znamenala dvě místa, kde se dá zapomenout na příznak.
 */
import { isAdmin } from '../../lib/adminAuth.js';
import { supabaseServer } from '../../lib/supabaseServer.js';

/** Náhled dotazu v administraci — celý text je v appce. */
const NAHLED = 400;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdmin(req)) return res.status(403).json({ error: 'Neoprávněný přístup' });

  try {
    const { data: kategorie } = await supabaseServer
      .from('community_categories')
      .select('id')
      .eq('slug', 'dotazy')
      .maybeSingle();

    if (!kategorie) {
      // Migrace 20260923010000 ještě neběžela — prázdná fronta je lepší
      // odpověď než pád, admin aspoň vidí zbytek stránky.
      return res.status(200).json({ ok: true, questions: [], kategorie_chybi: true });
    }

    const { data: dotazy, error } = await supabaseServer
      .from('community_posts')
      .select('id, author_name, title, content, created_at, is_hidden, reply_count')
      .eq('category_id', kategorie.id)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const seznam = dotazy || [];
    const ids = seznam.map((d) => d.id);

    const { data: tymove } = ids.length
      ? await supabaseServer
        .from('community_replies')
        .select('topic_id')
        .in('topic_id', ids)
        .eq('is_team', true)
      : { data: [] };

    const zodpovezene = new Set((tymove || []).map((r) => r.topic_id));

    const nezodpovezene = seznam
      .filter((d) => !zodpovezene.has(d.id))
      .map((d) => ({
        id: d.id,
        author_name: d.author_name,
        created_at: d.created_at,
        reply_count: d.reply_count,
        nahled: d.content
          ? d.content.slice(0, NAHLED) + (d.content.length > NAHLED ? '…' : '')
          : d.title,
      }));

    return res.status(200).json({ ok: true, questions: nezodpovezene });
  } catch (err) {
    console.error('[admin/community-questions]', err);
    return res.status(500).json({ error: err?.message || 'Dotazy se nepodařilo načíst.' });
  }
}
