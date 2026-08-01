/**
 * Spoonacular complexSearch query rotation — spoonacular_import_queries.
 */
import { supabaseServer } from '../supabaseServer';

export const MAX_SPOONACULAR_OFFSET = 900;
/**
 * Sekundární strop; skutečnou brzdou je checkImportBudget.
 *
 * Původní hodnota 3 stála na úvaze „3 × odhad 12 = 36 < 40", jenže rozpočet
 * neporovnává součet odhadů — checkImportBudget kouká na SKUTEČNÝ quota_used
 * z hlavičky a pustí další dotaz, dokud je `40 − spotřebováno ≥ 12`. Spotřeba
 * se tedy sama zastaví kolem 28 bodů a poslední dotaz ji dotáhne nejvýš na 40.
 *
 * Reálná cena dotazu je 1 + 0,11 × počet vrácených receptů, tedy 1,00–1,88 podle
 * dosavadních 43 běhů (průměr 1,13). 12 dotazů proto vyjde asi na 14 bodů, což
 * nechává prostor pro enrichment a ruční volání. Když se dotazy po odstranění
 * cuisine rozšíří a začnou vracet víc receptů, zastaví běh rozpočet, ne tahle
 * konstanta. Průchod všemi 36 dotazy trvá 3 dny.
 */
export const MAX_QUERIES_PER_RUN = 12;
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
    .select('id, meal_type, catalog_meal_type, params, query_signature, next_offset, total_results, empty_streak')
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
 * Prázdná odpověď z NULTÉ stránky neznamená vyčerpaný pool, ale prázdný — dotaz
 * nikdy nic nevrátil. Dřív obojí končilo stejně (`exhausted_at`), takže jediná
 * prázdná odpověď dotaz odepsala navždy. Tak se 31. 7. 2026 odepsaly tři veganské
 * snídaně po prvním a jediném volání. Rozlišujeme proto důvod:
 *   pool_exhausted — stránkovali jsme a došli na konec (offset > 0 nebo strop)
 *   pool_empty     — hned první stránka byla prázdná, filtr je moc úzký
 * Z rotace odcházejí oba (rotace bere jen `exhausted_at IS NULL`), ale pool_empty
 * jde hromadně vrátit, jakmile se filtry rozvolní — na rozdíl od skutečně
 * vyčerpaného poolu, kde by retry jen pálil body.
 *
 * @param {{
 *   queryId: number,
 *   offset: number,
 *   nextOffset: number,
 *   totalResults: number|null,
 *   apiResults: number,
 *   inserted: number,
 *   skippedDuplicate: number,
 * }} args
 */
export async function advanceImportQueryAfterRun({
  queryId,
  offset = 0,
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

  const startedAtZero = Math.max(0, Number(offset) || 0) === 0;
  /** Prázdná nultá stránka = pool je prázdný, ne vyčerpaný. */
  const poolEmpty = apiResults === 0 && totalResults === 0 && startedAtZero;
  const poolExhausted = !poolEmpty && (nextOffset >= cap || apiResults === 0);

  /** @type {'pool_empty'|'pool_exhausted'|null} */
  let retiredReason = null;
  if (poolEmpty) retiredReason = 'pool_empty';
  else if (poolExhausted) retiredReason = 'pool_exhausted';

  await updateImportQuery(queryId, {
    next_offset: nextOffset,
    total_results: totalResults ?? undefined,
    empty_streak: inserted > 0 ? 0 : emptyStreak,
    exhausted_at: retiredReason ? new Date().toISOString() : null,
    retired_reason: retiredReason,
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
