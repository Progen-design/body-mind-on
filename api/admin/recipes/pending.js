// GET /api/admin/recipes/pending — recepty čekající na ruční schválení
//
// Žádné UI, jen JSON. Vrací všechno, co je potřeba k rozhodnutí: suroviny
// s gramáží, postup, SPOČTENOU nutrici a odhad času.
import { isAdmin } from '../../../lib/adminAuth.js';
import { supabaseServer } from '../../../lib/supabaseServer.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = Math.min(Number(req.query?.limit) || 50, 200);

  try {
    const { data, error } = await supabaseServer
      .from('recipes_catalog')
      .select('id, name_cs, meal_type, diet_tags, servings, ingredients, instructions, '
        + 'kcal, protein_g, carbs_g, fat_g, nutrition_source, '
        + 'prep_minutes_estimated, prep_minutes_passive, source, created_at')
      .eq('pending_review', true)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    return res.status(200).json({
      ok: true,
      pocet: data?.length ?? 0,
      recepty: (data || []).map((r) => ({
        ...r,
        aktivni_min: r.prep_minutes_estimated,
        pasivni_min: r.prep_minutes_passive,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
}
