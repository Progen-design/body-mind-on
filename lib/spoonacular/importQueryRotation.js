/**
 * Spoonacular complexSearch query rotation — spoonacular_import_queries.
 */
import { supabaseServer } from '../supabaseServer';

export const MAX_SPOONACULAR_OFFSET = 900;
/** One page per query — number=100 costs ~12 pts; 3 queries ≈ 36 pts (< 40 cap). */
export const MAX_QUERIES_PER_RUN = 3;
export const DEFAULT_RESULTS_PER_QUERY = 100;

/**
 * Pick next queries globally (not per meal type).
 *
 * @param {number} limit
 * @returns {Promise<Array<{ id: number, meal_type: string, params: Record<string, unknown>, query_signature: string, next_offset: number, total_results: number|null, empty_streak: number }>>}
 */
export async function selectImportQueriesGlobal(limit = MAX_QUERIES_PER_RUN) {
  const n = Math.max(1, Math.floor(Number(limit) || 1));

  const { data, error } = await supabaseServer
    .from('spoonacular_import_queries')
    .select('id, meal_type, params, query_signature, next_offset, total_results, empty_streak')
    .is('exhausted_at', null)
    .order('priority', { ascending: true })
    .order('last_run_at', { ascending: true, nullsFirst: true })
    .limit(n);

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * @deprecated use selectImportQueriesGlobal
 * @param {string} mealType
 * @param {number} limit
 */
export async function selectImportQueries(mealType, limit = 1) {
  const key = String(mealType || '').trim();
  const n = Math.max(1, Math.floor(Number(limit) || 1));

  const { data, error } = await supabaseServer
    .from('spoonacular_import_queries')
    .select('id, meal_type, params, query_signature, next_offset, total_results, empty_streak')
    .eq('meal_type', key)
    .is('exhausted_at', null)
    .order('priority', { ascending: true })
    .order('last_run_at', { ascending: true, nullsFirst: true })
    .limit(n);

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * @param {number} queryId
 * @param {object} patch
 */
export async function updateImportQuery(queryId, patch) {
  const { error } = await supabaseServer
    .from('spoonacular_import_queries')
    .update({ ...patch, last_run_at: new Date().toISOString() })
    .eq('id', queryId);

  if (error) throw new Error(error.message);
}

/**
 * Advance rotation state after one API page.
 * Exhaust only when offset reaches result cap — not when filter rejects candidates.
 *
 * @param {{
 *   queryId: number,
 *   nextOffset: number,
 *   totalResults: number|null,
 *   apiResults: number,
 *   inserted: number,
 *   skippedDuplicate: number,
 * }} args
 */
export async function advanceImportQueryAfterRun({
  queryId,
  nextOffset,
  totalResults,
  apiResults,
  inserted,
  skippedDuplicate = 0,
}) {
  const cap = totalResults != null
    ? Math.min(totalResults, MAX_SPOONACULAR_OFFSET)
    : MAX_SPOONACULAR_OFFSET;

  let emptyStreak = 0;
  if (apiResults > 0 && inserted === 0 && skippedDuplicate >= apiResults) {
    const { data } = await supabaseServer
      .from('spoonacular_import_queries')
      .select('empty_streak')
      .eq('id', queryId)
      .maybeSingle();
    emptyStreak = (Number(data?.empty_streak) || 0) + 1;
  }

  const exhausted = nextOffset >= cap || (apiResults === 0 && totalResults === 0);

  await updateImportQuery(queryId, {
    next_offset: nextOffset,
    total_results: totalResults ?? undefined,
    empty_streak: inserted > 0 ? 0 : emptyStreak,
    exhausted_at: exhausted ? new Date().toISOString() : null,
  });
}

/**
 * API-only query params — no sort/minProtein/maxSugar (filtered locally).
 *
 * @param {Record<string, unknown>} params
 * @param {URLSearchParams} searchParams
 */
export function applyQueryParamsToSearch(params, searchParams) {
  const p = params || {};
  if (p.type) searchParams.set('type', String(p.type));
  if (p.cuisine) searchParams.set('cuisine', String(p.cuisine));
  if (p.diet) searchParams.set('diet', String(p.diet));
  if (p.maxReadyTime != null) searchParams.set('maxReadyTime', String(p.maxReadyTime));
  if (p.minCalories != null) searchParams.set('minCalories', String(p.minCalories));
  if (p.maxCalories != null) searchParams.set('maxCalories', String(p.maxCalories));
}
