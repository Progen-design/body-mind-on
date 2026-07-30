/**
 * Spoonacular complexSearch → recipes_catalog upsert (server-side only).
 */
import { supabaseServer } from '../supabaseServer';
import { normalizeDietTags } from '../dietTags.js';
import {
  MEAL_SIMPLICITY_RULES,
  SEASONINGS,
  applyImportGateBatch,
  countMainIngredients,
  evaluateImportGate,
  getMainIngredientLimit,
  getMealSimplicityRules,
  hasCompleteNutrition,
  isNotARecipeTitle,
  isSeasoningIngredient,
  buildImportFiltersForMealType,
  DEFAULT_CATALOG_IMPORT_FILTERS,
  normalizeIngredientName,
  setActivePantrySet,
} from './catalogImportGate';
import {
  COMPLEX_PREP_REGEX,
  COOKING_REGEX,
  evaluateRecipeSimplicity,
  recipePassesSimplicityFilter,
} from './catalogSimplicity';
import {
  checkImportBudget,
  estimateSpoonacularRequestCost,
  MAX_DAILY_POINTS,
  readQuotaLeftFromResponse,
  readQuotaRequestCostFromResponse,
  readQuotaUsedFromResponse,
} from './importBudget';
import {
  filterRecipesForImport,
  mergeReasonCounts,
} from './importFilterPipeline';
import {
  advanceImportQueryAfterRun,
  applyQueryParamsToSearch,
  DEFAULT_RESULTS_PER_QUERY,
  MAX_QUERIES_PER_RUN,
  selectImportQueriesGlobal,
} from './importQueryRotation';
import { createImportRunLogger, logImportStructured } from './importRunLog';
import { loadPantryNormalizedSet } from './pantryIngredients';
import { cacheRawRecipes } from './rawCache';
import { randomUUID } from 'crypto';

export {
  MEAL_SIMPLICITY_RULES,
  SEASONINGS,
  applyImportGateBatch,
  countMainIngredients,
  evaluateImportGate,
  getMainIngredientLimit,
  getMealSimplicityRules,
  hasCompleteNutrition,
  isNotARecipeTitle,
  isSeasoningIngredient,
  normalizeIngredientName,
  nutrientAmount,
  setActivePantrySet,
} from './catalogImportGate';

export {
  COMPLEX_PREP_REGEX,
  COOKING_REGEX,
  evaluateRecipeSimplicity,
  recipePassesSimplicityFilter,
} from './catalogSimplicity';

export { MAX_DAILY_POINTS, MAX_QUERIES_PER_RUN, DEFAULT_RESULTS_PER_QUERY };

const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes/complexSearch';

export { estimateSpoonacularRequestCost } from './importBudget';

function maxPointsPerRun() {
  const n = Number(process.env.SPOONACULAR_MAX_REQUESTS_PER_PLAN);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_DAILY_POINTS) : MAX_DAILY_POINTS;
}

export const MAX_MAIN_INGREDIENTS = 6;
export const MAX_INSTRUCTION_STEPS = 5;

/** Spoonacular complexSearch type → Czech catalog meal_type. */
export const SPOONACULAR_SEARCH_TYPE_TO_CATALOG = Object.freeze({
  breakfast: 'snidane',
  'main course': 'obed',
  salad: 'obed',
  soup: 'obed',
  snack: 'svacina',
  dessert: 'svacina',
});

/** Czech catalog meal_type → default Spoonacular search type (when admin passes Czech type). */
export const CATALOG_MEAL_TYPE_TO_SPOONACULAR_SEARCH = Object.freeze({
  snidane: 'breakfast',
  obed: 'main course',
  svacina: 'snack',
  vecere: 'main course',
});

/** Default fitness filters — re-exported from catalogImportGate for API callers. */
export { DEFAULT_CATALOG_IMPORT_FILTERS, buildImportFiltersForMealType } from './catalogImportGate';

/**
 * @param {string} [inputType]
 * @returns {{ spoonacularSearchType: string, catalogMealType: string, cursorKey: string }}
 */
export function resolveImportMealTypes(inputType) {
  const raw = String(inputType || 'main course').trim().toLowerCase();

  if (Object.prototype.hasOwnProperty.call(CATALOG_MEAL_TYPE_TO_SPOONACULAR_SEARCH, raw)) {
    const spoonacularSearchType = CATALOG_MEAL_TYPE_TO_SPOONACULAR_SEARCH[/** @type {keyof typeof CATALOG_MEAL_TYPE_TO_SPOONACULAR_SEARCH} */ (raw)];
    return { spoonacularSearchType, catalogMealType: raw, cursorKey: spoonacularSearchType };
  }

  if (Object.prototype.hasOwnProperty.call(SPOONACULAR_SEARCH_TYPE_TO_CATALOG, raw)) {
    return {
      spoonacularSearchType: raw,
      catalogMealType: SPOONACULAR_SEARCH_TYPE_TO_CATALOG[/** @type {keyof typeof SPOONACULAR_SEARCH_TYPE_TO_CATALOG} */ (raw)],
      cursorKey: raw,
    };
  }

  return { spoonacularSearchType: 'main course', catalogMealType: 'obed', cursorKey: 'main course' };
}

/**
 * @param {unknown} raw
 * @param {{ min?: number, max?: number, label: string }} bounds
 * @returns {number|null}
 */
function parseOptionalNumber(raw, { min, max, label }) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) throw new Error(`${label} must be >= ${min}`);
  if (max != null && n > max) throw new Error(`${label} must be <= ${max}`);
  return n;
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {CatalogImportFilters}
 */
export function parseCatalogImportFilters(raw) {
  /** @type {CatalogImportFilters} */
  const filters = { ...DEFAULT_CATALOG_IMPORT_FILTERS };

  const minProtein = parseOptionalNumber(raw.minProtein, { min: 0, max: 200, label: 'minProtein' });
  if (minProtein != null) filters.minProtein = minProtein;

  const maxSugar = parseOptionalNumber(raw.maxSugar, { min: 0, max: 500, label: 'maxSugar' });
  if (maxSugar != null) filters.maxSugar = maxSugar;

  const maxCalories = parseOptionalNumber(raw.maxCalories, { min: 50, max: 5000, label: 'maxCalories' });
  if (maxCalories != null) filters.maxCalories = maxCalories;

  const maxReadyTime = parseOptionalNumber(raw.maxReadyTime, { min: 1, max: 600, label: 'maxReadyTime' });
  if (maxReadyTime != null) filters.maxReadyTime = maxReadyTime;

  return filters;
}

/**
 * @param {import('next').NextApiRequest} [_req]
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, value: ImportOptions } | { ok: false, error: string }}
 */
export function parseImportBody(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const type = raw.type != null ? String(raw.type).trim() : '';
  const diet = raw.diet != null ? String(raw.diet).trim() : '';
  const numberRaw = raw.number != null ? Number(raw.number) : 100;
  const offsetRaw = raw.offset != null ? Number(raw.offset) : null;
  const pagesRaw = raw.pages != null ? Number(raw.pages) : 1;

  if (!Number.isFinite(numberRaw) || numberRaw < 1 || numberRaw > 100) {
    return { ok: false, error: 'number must be 1–100' };
  }
  if (offsetRaw != null && (!Number.isFinite(offsetRaw) || offsetRaw < 0)) {
    return { ok: false, error: 'offset must be >= 0' };
  }
  if (!Number.isFinite(pagesRaw) || pagesRaw < 1 || pagesRaw > 20) {
    return { ok: false, error: 'pages must be 1–20' };
  }

  let filters;
  try {
    filters = parseCatalogImportFilters(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  return {
    ok: true,
    value: {
      type,
      diet,
      number: Math.floor(numberRaw),
      offset: offsetRaw != null ? Math.floor(offsetRaw) : undefined,
      pages: Math.floor(pagesRaw),
      filters,
    },
  };
}

/**
 * @typedef {{ minProtein?: number, maxSugar?: number, maxCalories?: number, maxReadyTime?: number, sort?: string, sortDirection?: string }} CatalogImportFilters
 * @typedef {{ type?: string, diet?: string, number?: number, offset?: number, pages?: number, maxRequests?: number, filters?: CatalogImportFilters, useCursor?: boolean }} ImportOptions
 * @typedef {{ imported: number, updated: number, matched: number, fetched: number, rejected: number, rejectedReason: Record<string, number>, skipped_complex: number, skipped_not_recipe: number, skipped_missing_nutrition: number, skipped_protected: number, catalogMealType?: string, totalResults: number|null, quotaLeft: number|null, requestsUsed: number, pointsUsed: number, filters: CatalogImportFilters, offset?: number, nextOffset?: number, stoppedReason?: string, errors?: string[] }} ImportResult
 */

/**
 * @param {string} mealType
 * @returns {Promise<number>}
 */
export async function getSpoonacularImportCursor(mealType) {
  const key = String(mealType || '').trim();
  if (!key) return 0;

  const { data, error } = await supabaseServer
    .from('spoonacular_import_cursor_legacy')
    .select('next_offset')
    .eq('meal_type', key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const n = Number(data?.next_offset);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * @param {string} mealType
 * @param {number} nextOffset
 */
export async function saveSpoonacularImportCursor(mealType, nextOffset) {
  const key = String(mealType || '').trim();
  if (!key) return;

  const offset = Math.max(0, Math.floor(Number(nextOffset) || 0));
  const { error } = await supabaseServer
    .from('spoonacular_import_cursor_legacy')
    .upsert(
      { meal_type: key, next_offset: offset, updated_at: new Date().toISOString() },
      { onConflict: 'meal_type' },
    );

  if (error) throw new Error(error.message);
}

/**
 * API query params only — maxReadyTime/maxCalories. Protein/sugar filtered locally.
 *
 * @param {URLSearchParams} params
 * @param {CatalogImportFilters|undefined} filters
 */
function applyCatalogImportFilters(params, filters) {
  const f = filters || DEFAULT_CATALOG_IMPORT_FILTERS;
  if (f.maxCalories != null) params.set('maxCalories', String(f.maxCalories));
  if (f.maxReadyTime != null) params.set('maxReadyTime', String(f.maxReadyTime));
}

function spoonacularApiKey() {
  const key = String(process.env.SPOONACULAR_API_KEY || '').trim();
  if (!key) throw new Error('SPOONACULAR_API_KEY is not configured');
  return key;
}

function maxRequestsPerRun() {
  return maxPointsPerRun();
}

/**
 * @param {Response} res
 * @returns {number|null}
 */
function readQuotaRequestCost(res) {
  const raw = res.headers.get('x-api-quota-request') || res.headers.get('X-API-Quota-Request');
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {Response} res
 * @returns {number|null}
 */
function readQuotaLeft(res) {
  const raw = res.headers.get('x-api-quota-left') || res.headers.get('X-API-Quota-Left');
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Response} res
 * @returns {number|null}
 */
function readQuotaUsed(res) {
  const raw = res.headers.get('x-api-quota-used') || res.headers.get('X-API-Quota-Used');
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} catalogMealType
 * @returns {Record<string, unknown>}
 */
export function mapSpoonacularRecipeToCatalogRow(recipe, catalogMealType) {
  const servings = Math.max(1, Number(recipe.servings) || 1);
  const sourceId = String(recipe.id ?? '').trim();
  if (!sourceId) throw new Error('Recipe missing id');

  /** @type {Array<Record<string, unknown>>} */
  const ingredients = Array.isArray(recipe.extendedIngredients)
    ? recipe.extendedIngredients.map((i) => {
        const metric = i?.measures?.metric;
        const metricAmount = metric?.amount != null ? Number(metric.amount) : Number(i?.amount);
        const scaled = Number.isFinite(metricAmount) ? metricAmount / servings : null;
        return {
          name: i?.nameClean || i?.name || '',
          name_en: i?.nameClean || i?.name || '',
          unit: metric?.unitShort || i?.unit || '',
          amount: scaled != null && Number.isFinite(scaled) ? Math.round(scaled * 1000) / 1000 : null,
          original: i?.original || i?.name || '',
        };
      })
    : [];

  const kcalRaw = nutrientAmount(recipe, 'Calories') ?? Number(recipe.calories);
  const kcal = Math.round(Number(kcalRaw) || 0);
  if (kcal <= 0) throw new Error('Recipe missing kcal');

  const protein_g = nutrientAmount(recipe, 'Protein');
  const carbs_g = nutrientAmount(recipe, 'Carbohydrates');
  const fat_g = nutrientAmount(recipe, 'Fat');
  if (protein_g == null || carbs_g == null || fat_g == null) {
    throw new Error('Recipe missing macros');
  }

  // Spoonacular vrací mezerový zápis; katalog i filtr chtějí podtržítkový.
  const diets = normalizeDietTags(recipe.diets);

  return {
    source: 'spoonacular',
    source_id: sourceId,
    name_en: String(recipe.title || '').trim() || `Recipe ${sourceId}`,
    name_cs: null,
    servings: 1,
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    ingredients,
    instructions: recipe.analyzedInstructions ?? null,
    image_url: recipe.image ? String(recipe.image) : null,
    spoonacular_url:
      recipe.sourceUrl
      || recipe.spoonacularSourceUrl
      || `https://spoonacular.com/recipes/${sourceId}`,
    diet_tags: diets,
    meal_type: catalogMealType || 'obed',
    nutrition_source: 'spoonacular_api',
    active: false,
  };
}

/** Our engine-computed nutrition takes priority over Spoonacular API estimates on re-import. */
export const COMPUTED_NUTRITION_SOURCE = 'computed_from_ingredients';

/**
 * @param {Record<string, unknown>[]} rows
 * @returns {Promise<{ inserted: number, updated: number, error?: string }>}
 */
async function insertSpoonacularCatalogRows(rows) {
  if (!rows.length) return { inserted: 0, skipped_duplicate: 0, attempted: 0 };

  const { data, error } = await supabaseServer.rpc('insert_spoonacular_catalog_import_rows', {
    p_rows: rows,
  });

  if (error) return { inserted: 0, skipped_duplicate: 0, attempted: 0, error: error.message };

  return {
    inserted: Number(data?.inserted) || 0,
    skipped_duplicate: Number(data?.skipped_duplicate) || 0,
    attempted: Number(data?.attempted) || rows.length,
  };
}

/** @deprecated use insertSpoonacularCatalogRows */
async function upsertSpoonacularCatalogRows(rows) {
  const result = await insertSpoonacularCatalogRows(rows);
  return {
    inserted: result.inserted,
    updated: 0,
    skipped_duplicate: result.skipped_duplicate,
    error: result.error,
  };
}

/**
 * @param {string[]} sourceIds
 * @returns {Promise<Set<string>>}
 */
async function fetchComputedNutritionSourceIds(sourceIds) {
  const ids = [...new Set(sourceIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return new Set();

  const { data, error } = await supabaseServer
    .from('recipes_catalog')
    .select('source_id')
    .eq('source', 'spoonacular')
    .eq('nutrition_source', COMPUTED_NUTRITION_SOURCE)
    .in('source_id', ids);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((row) => String(row.source_id || '').trim()).filter(Boolean));
}

/**
 * @param {ImportOptions} options
 * @returns {Promise<ImportResult>}
 */
export async function runSpoonacularCatalogImport(options = {}) {
  const apiKey = spoonacularApiKey();
  const number = options.number ?? 100;
  const pages = options.pages ?? 1;
  const pointsCap = options.maxRequests ?? maxPointsPerRun();
  const { spoonacularSearchType, catalogMealType, cursorKey } = resolveImportMealTypes(options.type);
  const diet = options.diet || '';
  const filters = buildImportFiltersForMealType(catalogMealType, options.filters);
  const useCursor = options.useCursor === true;
  const cursorManaged = useCursor && options.offset == null;

  let offset;
  if (cursorManaged) {
    offset = await getSpoonacularImportCursor(cursorKey);
  } else {
    offset = options.offset ?? 0;
  }

  let imported = 0;
  let updated = 0;
  let matched = 0;
  let fetched = 0;
  let rejected = 0;
  let skippedComplex = 0;
  let skippedNotRecipe = 0;
  let skippedMissingNutrition = 0;
  let skippedProtected = 0;
  /** @type {Record<string, number>} */
  const rejectedReason = {};
  let totalResults = null;
  let requestsUsed = 0;
  let pointsUsed = 0;
  let quotaLeft = null;
  let nextOffset = offset;
  const startOffset = offset;
  /** @type {string[]} */
  const errors = [];

  /**
   * @param {string} reason
   */
  function recordRejection(reason) {
    rejected += 1;
    rejectedReason[reason] = (rejectedReason[reason] || 0) + 1;
  }

  /**
   * @param {Partial<ImportResult>} extra
   * @returns {ImportResult}
   */
  function buildResult(extra = {}) {
    return {
      imported,
      updated,
      matched,
      fetched,
      rejected,
      rejectedReason,
      skipped_complex: skippedComplex,
      skipped_not_recipe: skippedNotRecipe,
      skipped_missing_nutrition: skippedMissingNutrition,
      skipped_protected: skippedProtected,
      catalogMealType,
      totalResults,
      quotaLeft,
      requestsUsed,
      pointsUsed,
      filters,
      offset: startOffset,
      nextOffset,
      errors: errors.length ? errors : undefined,
      ...extra,
    };
  }

  /**
   * @param {'too_complex'|'not_a_recipe'|'missing_nutrition'} reason
   */
  function recordImportGateSkip(reason) {
    rejected += 1;
    rejectedReason[reason] = (rejectedReason[reason] || 0) + 1;
    if (reason === 'too_complex') skippedComplex += 1;
    else if (reason === 'not_a_recipe') skippedNotRecipe += 1;
    else if (reason === 'missing_nutrition') skippedMissingNutrition += 1;
  }

  /**
   * @param {number} pageOffset
   * @param {number} resultCount
   */
  async function persistCursorAfterSuccess(pageOffset, resultCount) {
    if (!cursorManaged) return;
    // Never reset to 0 — always advance by actual page size (fixes hypothesis A deadlock).
    nextOffset = pageOffset + Math.max(0, resultCount);
    await saveSpoonacularImportCursor(cursorKey, nextOffset);
  }

  for (let page = 0; page < pages; page += 1) {
    const estimatedCost = estimateSpoonacularRequestCost(number);
    if (pointsUsed + estimatedCost > pointsCap) {
      console.warn(
        `[import-spoonacular] zastaveno před překročením, spotřebováno ${pointsUsed} / strop ${pointsCap}`,
      );
      return buildResult({ stoppedReason: 'max_requests_cap' });
    }
    if (quotaLeft != null && quotaLeft < estimatedCost) {
      console.warn(
        `[import-spoonacular] zastaveno před překročením, spotřebováno ${pointsUsed} / strop ${pointsCap}`,
      );
      return buildResult({ stoppedReason: 'quota_low' });
    }

    const params = new URLSearchParams({
      apiKey,
      addRecipeInformation: 'true',
      addRecipeNutrition: 'true',
      fillIngredients: 'true',
      instructionsRequired: 'true',
      number: String(number),
      offset: String(offset),
    });
    if (spoonacularSearchType) params.set('type', spoonacularSearchType);
    if (diet) params.set('diet', diet);
    applyCatalogImportFilters(params, filters);

    const url = `${SPOONACULAR_BASE}?${params.toString()}`;
    let res;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[import-spoonacular] fetch failed', { offset, msg });
      errors.push(msg);
      break;
    }

    requestsUsed += 1;
    const requestCost = readQuotaRequestCost(res) ?? estimatedCost;
    pointsUsed += requestCost;
    quotaLeft = readQuotaLeft(res);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const msg = `Spoonacular HTTP ${res.status}: ${body.slice(0, 200)}`;
      console.error('[import-spoonacular]', msg);
      errors.push(msg);
      break;
    }

    /** @type {{ results?: unknown[] }} */
    let data;
    try {
      data = await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON';
      errors.push(msg);
      break;
    }

    if (data.totalResults != null) {
      const tr = Number(data.totalResults);
      if (Number.isFinite(tr)) totalResults = tr;
    }

    const results = Array.isArray(data.results) ? data.results : [];
    matched += results.length;
    fetched += results.length;
    if (results.length === 0) {
      if (cursorManaged) {
        nextOffset = offset;
        await saveSpoonacularImportCursor(cursorKey, nextOffset);
      }
      return buildResult({ stoppedReason: 'no_results' });
    }

    /** @type {Set<string>} */
    let protectedSourceIds = new Set();
    try {
      protectedSourceIds = await fetchComputedNutritionSourceIds(
        results.map((r) => String(/** @type {{ id?: unknown }} */ (r).id ?? '')),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[import-spoonacular] protected lookup failed', msg);
      errors.push(msg);
      break;
    }

    const gateBatch = applyImportGateBatch(
      /** @type {Record<string, unknown>[]} */ (results),
      catalogMealType,
      protectedSourceIds,
    );

    for (const { recipe, reason } of gateBatch.skipped) {
      if (reason === 'protected') {
        skippedProtected += 1;
        rejected += 1;
        rejectedReason.protected = (rejectedReason.protected || 0) + 1;
        console.log('[import-spoonacular] skipped', {
          reason: 'protected',
          source_id: String(recipe.id ?? ''),
        });
        continue;
      }
      recordImportGateSkip(reason);
      console.log('[import-spoonacular] skipped', { reason, title: recipe.title });
    }

    /** @type {Record<string, unknown>[]} */
    const upsertRows = [];

    for (const recipe of gateBatch.kept) {
      const evaluation = evaluateRecipeSimplicity(recipe, catalogMealType);
      if (!evaluation.pass) {
        recordRejection(evaluation.reason || 'rejected');
        continue;
      }
      try {
        const row = mapSpoonacularRecipeToCatalogRow(recipe, catalogMealType);
        upsertRows.push(row);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[import-spoonacular] skip recipe', msg);
        errors.push(msg);
      }
    }

    if (upsertRows.length > 0) {
      const upsertResult = await upsertSpoonacularCatalogRows(upsertRows);
      if (upsertResult.error) {
        console.error('[import-spoonacular] upsert failed', upsertResult.error);
        errors.push(upsertResult.error);
        break;
      }
      imported += upsertResult.inserted;
      updated += upsertResult.updated;
    }

    await persistCursorAfterSuccess(offset, results.length);

    offset += number;
  }

  const summary = buildResult();
  console.log('[import-spoonacular] summary', {
    fetched: summary.fetched,
    imported: summary.imported + summary.updated,
    skipped_complex: summary.skipped_complex,
    skipped_not_recipe: summary.skipped_not_recipe,
    skipped_missing_nutrition: summary.skipped_missing_nutrition,
    skipped_protected: summary.skipped_protected,
  });

  return summary;
}

/** Daily cron meal types */
export const CRON_IMPORT_MEAL_TYPES = Object.freeze([
  'breakfast',
  'main course',
  'salad',
  'soup',
  'snack',
  'dessert',
]);

/**
 * @param {string[]} sourceIds
 * @returns {Promise<Set<string>>}
 */
async function fetchExistingSpoonacularSourceIds(sourceIds) {
  const ids = [...new Set(sourceIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return new Set();

  const { data, error } = await supabaseServer
    .from('recipes_catalog')
    .select('source_id')
    .eq('source', 'spoonacular')
    .in('source_id', ids);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((row) => String(row.source_id || '').trim()).filter(Boolean));
}

/**
 * Execute one rotated query page (observability + never-reset offset).
 *
 * @param {{
 *   queryRow: { id: number, meal_type: string, params: Record<string, unknown>, query_signature: string, next_offset: number },
 *   runId: string,
 *   dryRun?: boolean,
 * }} opts
 * @returns {Promise<{ inserted: number, skipped_duplicate: number, skipped_filter: number, api_results: number, pointsUsed: number, quotaLeft: number|null, error?: string }>}
 */
export async function runSpoonacularQueryImport({ queryRow, runId, dryRun = false }) {
  const apiKey = spoonacularApiKey();
  const number = DEFAULT_RESULTS_PER_QUERY;
  const offset = Math.max(0, Math.floor(Number(queryRow.next_offset) || 0));
  const { catalogMealType } = resolveImportMealTypes(String(queryRow.params?.type || queryRow.meal_type));
  const filters = buildImportFiltersForMealType(catalogMealType, DEFAULT_CATALOG_IMPORT_FILTERS);

  const runLogger = createImportRunLogger(
    runId,
    queryRow.meal_type,
    queryRow.query_signature,
    offset,
  );

  let apiStatus = null;
  let apiResults = 0;
  let candidates = 0;
  let inserted = 0;
  let skippedDuplicate = 0;
  let skippedFilter = 0;
  /** @type {Record<string, number>} */
  let skippedFilterReasons = {};
  let quotaLeft = null;
  let quotaUsed = null;
  let pointsUsed = 0;
  /** @type {string|null} */
  let errorMsg = null;
  let totalResults = null;
  let quotaExceeded = false;

  try {
    const budget = await checkImportBudget(estimateSpoonacularRequestCost(number));
    if (!budget.ok) {
      errorMsg = 'budget_exhausted';
      await runLogger.finish({
        api_status: null,
        skipped_filter_reasons: {},
        error: errorMsg,
      });
      return {
        inserted: 0,
        skipped_duplicate: 0,
        skipped_filter: 0,
        skipped_filter_reasons: {},
        api_results: 0,
        pointsUsed: 0,
        quotaLeft,
        budgetExhausted: true,
      };
    }

    const params = new URLSearchParams({
      apiKey,
      addRecipeInformation: 'true',
      addRecipeNutrition: 'true',
      fillIngredients: 'true',
      instructionsRequired: 'true',
      number: String(number),
      offset: String(offset),
    });
    applyQueryParamsToSearch(queryRow.params, params);
    applyCatalogImportFilters(params, filters);

    const url = `${SPOONACULAR_BASE}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });

    apiStatus = res.status;
    pointsUsed = readQuotaRequestCostFromResponse(res) ?? estimateSpoonacularRequestCost(number);
    quotaLeft = readQuotaLeftFromResponse(res);
    quotaUsed = readQuotaUsedFromResponse(res);

    if (apiStatus === 402) {
      quotaExceeded = true;
      errorMsg = `Spoonacular HTTP 402: quota exceeded`;
      await runLogger.finish({
        api_status: apiStatus,
        skipped_filter_reasons: {},
        quota_left: quotaLeft,
        quota_used: quotaUsed,
        error: errorMsg,
      });
      return {
        inserted: 0,
        skipped_duplicate: 0,
        skipped_filter: 0,
        skipped_filter_reasons: {},
        api_results: 0,
        pointsUsed,
        quotaLeft,
        quotaExceeded: true,
        error: errorMsg,
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      errorMsg = `Spoonacular HTTP ${res.status}: ${body.slice(0, 200)}`;
      throw new Error(errorMsg);
    }

    /** @type {{ results?: unknown[], totalResults?: number }} */
    const data = await res.json();
    if (data.totalResults != null) {
      const tr = Number(data.totalResults);
      if (Number.isFinite(tr)) totalResults = tr;
    }

    const results = Array.isArray(data.results) ? data.results : [];
    apiResults = results.length;

    await cacheRawRecipes(
      /** @type {Record<string, unknown>[]} */ (results),
      { queryMealType: queryRow.meal_type, querySignature: queryRow.query_signature },
    );

    const protectedSourceIds = await fetchComputedNutritionSourceIds(
      results.map((r) => String(/** @type {{ id?: unknown }} */ (r).id ?? '')),
    );

    const filtered = filterRecipesForImport(
      /** @type {Record<string, unknown>[]} */ (results),
      catalogMealType,
      { filters, protectedSourceIds },
    );

    skippedFilter = filtered.skipped.length;
    skippedFilterReasons = filtered.reasonCounts;

    /** @type {Record<string, unknown>[]} */
    const upsertRows = [];
    for (const recipe of filtered.kept) {
      try {
        upsertRows.push(mapSpoonacularRecipeToCatalogRow(recipe, catalogMealType));
      } catch {
        skippedFilter += 1;
        skippedFilterReasons.map_error = (skippedFilterReasons.map_error || 0) + 1;
      }
    }

    candidates = upsertRows.length;

    if (dryRun) {
      const existing = await fetchExistingSpoonacularSourceIds(
        upsertRows.map((r) => String(r.source_id || '')),
      );
      inserted = upsertRows.filter((r) => !existing.has(String(r.source_id || ''))).length;
      skippedDuplicate = upsertRows.length - inserted;
    } else if (upsertRows.length > 0) {
      const insertResult = await insertSpoonacularCatalogRows(upsertRows);
      if (insertResult.error) throw new Error(insertResult.error);
      inserted = insertResult.inserted;
      skippedDuplicate = insertResult.skipped_duplicate;
    }

    const nextOffset = offset + apiResults;
    await advanceImportQueryAfterRun({
      queryId: queryRow.id,
      nextOffset,
      totalResults,
      apiResults,
      inserted,
      skippedDuplicate,
    });

    logImportStructured({
      event: 'query_complete',
      run_id: runId,
      meal_type: queryRow.meal_type,
      query_signature: queryRow.query_signature,
      offset_used: offset,
      next_offset: nextOffset,
      api_results: apiResults,
      candidates,
      inserted,
      skipped_duplicate: skippedDuplicate,
      skipped_filter: skippedFilter,
      skipped_filter_reasons: skippedFilterReasons,
      dry_run: dryRun,
      quota_left: quotaLeft,
      quota_used: quotaUsed,
    });

    await runLogger.finish({
      api_status: apiStatus,
      api_results: apiResults,
      candidates,
      inserted,
      skipped_duplicate: skippedDuplicate,
      skipped_filter: skippedFilter,
      skipped_filter_reasons: skippedFilterReasons,
      quota_left: quotaLeft,
      quota_used: quotaUsed,
    });

    return {
      inserted,
      skipped_duplicate: skippedDuplicate,
      skipped_filter: skippedFilter,
      skipped_filter_reasons: skippedFilterReasons,
      api_results: apiResults,
      pointsUsed,
      quotaLeft,
    };
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    await runLogger.finish({
      api_status: apiStatus,
      api_results: apiResults,
      candidates,
      inserted,
      skipped_duplicate: skippedDuplicate,
      skipped_filter: skippedFilter,
      skipped_filter_reasons: skippedFilterReasons,
      quota_left: quotaLeft,
      quota_used: quotaUsed,
      error: errorMsg,
    });
    logImportStructured({
      event: 'query_error',
      run_id: runId,
      meal_type: queryRow.meal_type,
      query_signature: queryRow.query_signature,
      error: errorMsg,
    });
    return {
      inserted: 0,
      skipped_duplicate: 0,
      skipped_filter: skippedFilter,
      skipped_filter_reasons: skippedFilterReasons,
      api_results: apiResults,
      pointsUsed,
      quotaLeft,
      quotaExceeded,
      error: errorMsg,
    };
  }
}

/**
 * @typedef {{ dryRun?: boolean, queriesPerMealType?: number, runId?: string }} DailyImportOptions
 */

/**
 * Cron batch: rotated queries per meal type (replaces linear cursor deadlock).
 * @param {DailyImportOptions} [options]
 * @returns {Promise<ImportResult & { runId: string, byType: Record<string, object>, dryRun?: boolean }>}
 */
export async function runDailySpoonacularCatalogImport(options = {}) {
  const dryRun = options.dryRun === true || process.env.SPOONACULAR_IMPORT_DRY_RUN === '1';
  const runId = options.runId || randomUUID();
  const queryLimit = options.queriesPerRun ?? MAX_QUERIES_PER_RUN;

  const pantrySet = await loadPantryNormalizedSet();
  setActivePantrySet(pantrySet);

  let totalImported = 0;
  let totalSkippedDuplicate = 0;
  let totalSkippedFilter = 0;
  let totalFetched = 0;
  let pointsUsed = 0;
  let requestsUsed = 0;
  let quotaLeft = null;
  /** @type {Record<string, number>} */
  let totalFilterReasons = {};
  /** @type {Record<string, object>} */
  const byType = {};
  /** @type {string[]} */
  const errors = [];
  /** @type {string|null} */
  let stoppedReason = null;

  logImportStructured({
    event: 'run_start',
    run_id: runId,
    dry_run: dryRun,
    queries_per_run: queryLimit,
    max_daily_points: MAX_DAILY_POINTS,
  });

  const queries = await selectImportQueriesGlobal(queryLimit);

  for (const queryRow of queries) {
    if (stoppedReason) break;

    const result = await runSpoonacularQueryImport({ queryRow, runId, dryRun });
    requestsUsed += 1;
    pointsUsed += result.pointsUsed;
    quotaLeft = result.quotaLeft ?? quotaLeft;
    totalFilterReasons = mergeReasonCounts(totalFilterReasons, result.skipped_filter_reasons || {});

    totalImported += result.inserted;
    totalSkippedDuplicate += result.skipped_duplicate;
    totalSkippedFilter += result.skipped_filter;
    totalFetched += result.api_results;

    const mealKey = queryRow.meal_type;
    if (!byType[mealKey]) {
      byType[mealKey] = {
        imported: 0,
        skipped_duplicate: 0,
        skipped_filter: 0,
        fetched: 0,
        queries: [],
      };
    }
    byType[mealKey].imported += result.inserted;
    byType[mealKey].skipped_duplicate += result.skipped_duplicate;
    byType[mealKey].skipped_filter += result.skipped_filter;
    byType[mealKey].fetched += result.api_results;
    byType[mealKey].queries.push({
      query_signature: queryRow.query_signature,
      inserted: result.inserted,
      api_results: result.api_results,
      skipped_duplicate: result.skipped_duplicate,
      skipped_filter: result.skipped_filter,
      skipped_filter_reasons: result.skipped_filter_reasons,
      error: result.error,
    });

    if (result.error) errors.push(result.error);
    if (result.budgetExhausted) {
      stoppedReason = 'budget_exhausted';
      break;
    }
    if (result.quotaExceeded) {
      stoppedReason = 'quota_exceeded';
      break;
    }
  }

  const done = {
    runId,
    dryRun,
    imported: totalImported,
    updated: 0,
    fetched: totalFetched,
    rejected: totalSkippedFilter,
    skipped_duplicate: totalSkippedDuplicate,
    skipped_filter: totalSkippedFilter,
    skipped_filter_reasons: totalFilterReasons,
    rejectedReason: totalFilterReasons,
    skipped_complex: totalFilterReasons.too_complex || 0,
    skipped_not_recipe: totalFilterReasons.not_a_recipe || 0,
    skipped_missing_nutrition: totalFilterReasons.missing_nutrition || 0,
    skipped_protected: totalFilterReasons.protected || 0,
    pointsUsed,
    requestsUsed,
    quotaLeft,
    stoppedReason,
    byType,
    errors: errors.length ? errors : undefined,
  };

  logImportStructured({
    event: 'run_complete',
    run_id: runId,
    dry_run: dryRun,
    imported: done.imported,
    fetched: done.fetched,
    skipped_duplicate: done.skipped_duplicate,
    skipped_filter: done.skipped_filter,
    skipped_filter_reasons: totalFilterReasons,
    points_used: done.pointsUsed,
    quota_left: done.quotaLeft,
    stopped_reason: stoppedReason,
  });

  return done;
}
