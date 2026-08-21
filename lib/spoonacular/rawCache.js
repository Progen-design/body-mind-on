/**
 * Spoonacular complexSearch result cache — avoid paying twice for the same recipe payload.
 */
import { supabaseServer } from '../supabaseServer.js';

/**
 * @param {Record<string, unknown>[]} recipes
 * @param {{ queryMealType?: string, querySignature?: string }} [meta]
 * @returns {Promise<number>}
 */
export async function cacheRawRecipes(recipes, meta = {}) {
  const list = Array.isArray(recipes) ? recipes : [];
  if (!list.length) return 0;

  const rows = list
    .map((recipe) => {
      const sourceId = String(recipe?.id ?? '').trim();
      if (!sourceId) return null;
      return {
        source_id: sourceId,
        payload: recipe,
        query_meal_type: meta.queryMealType || null,
        query_signature: meta.querySignature || null,
        fetched_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (!rows.length) return 0;

  const { error } = await supabaseServer
    .from('spoonacular_raw_cache')
    .upsert(rows, { onConflict: 'source_id' });

  if (error) throw new Error(`spoonacular_raw_cache upsert failed: ${error.message}`);
  return rows.length;
}

/**
 * @param {number} [limit]
 * @returns {Promise<Array<{ source_id: string, payload: Record<string, unknown>, query_meal_type: string|null, query_signature: string|null, fetched_at: string }>>}
 */
export async function loadAllCachedRecipes(limit = 5000) {
  const { data, error } = await supabaseServer
    .from('spoonacular_raw_cache')
    .select('source_id, payload, query_meal_type, query_signature, fetched_at')
    .order('fetched_at', { ascending: false })
    .limit(Math.max(1, Math.floor(Number(limit) || 1)));

  if (error) throw new Error(`spoonacular_raw_cache load failed: ${error.message}`);
  return data || [];
}
