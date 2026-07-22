/**
 * Spoonacular complexSearch → recipes_catalog upsert (server-side only).
 */
import { supabaseServer } from '../supabaseServer';

const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes/complexSearch';
const QUOTA_STOP_THRESHOLD = 5;

/** Default fitness-oriented complexSearch filters (cron + admin when not overridden). */
export const DEFAULT_CATALOG_IMPORT_FILTERS = Object.freeze({
  minProtein: 5,
  maxSugar: 30,
  sort: 'healthiness',
  sortDirection: 'desc',
});

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
  const offsetRaw = raw.offset != null ? Number(raw.offset) : 0;
  const pagesRaw = raw.pages != null ? Number(raw.pages) : 1;

  if (!Number.isFinite(numberRaw) || numberRaw < 1 || numberRaw > 100) {
    return { ok: false, error: 'number must be 1–100' };
  }
  if (!Number.isFinite(offsetRaw) || offsetRaw < 0) {
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
      offset: Math.floor(offsetRaw),
      pages: Math.floor(pagesRaw),
      filters,
    },
  };
}

/**
 * @typedef {{ minProtein?: number, maxSugar?: number, maxCalories?: number, maxReadyTime?: number, sort?: string, sortDirection?: string }} CatalogImportFilters
 * @typedef {{ type?: string, diet?: string, number?: number, offset?: number, pages?: number, maxRequests?: number, filters?: CatalogImportFilters }} ImportOptions
 * @typedef {{ imported: number, updated: number, matched: number, totalResults: number|null, quotaLeft: number|null, requestsUsed: number, filters: CatalogImportFilters, stoppedReason?: string, errors?: string[] }} ImportResult
 */

/**
 * @param {URLSearchParams} params
 * @param {CatalogImportFilters|undefined} filters
 */
function applyCatalogImportFilters(params, filters) {
  const f = filters || DEFAULT_CATALOG_IMPORT_FILTERS;
  if (f.minProtein != null) params.set('minProtein', String(f.minProtein));
  if (f.maxSugar != null) params.set('maxSugar', String(f.maxSugar));
  if (f.maxCalories != null) params.set('maxCalories', String(f.maxCalories));
  if (f.maxReadyTime != null) params.set('maxReadyTime', String(f.maxReadyTime));
  if (f.sort) params.set('sort', f.sort);
  if (f.sortDirection) params.set('sortDirection', f.sortDirection);
}

function spoonacularApiKey() {
  const key = String(process.env.SPOONACULAR_API_KEY || '').trim();
  if (!key) throw new Error('SPOONACULAR_API_KEY is not configured');
  return key;
}

function maxRequestsPerRun() {
  const n = Number(process.env.SPOONACULAR_MAX_REQUESTS_PER_PLAN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 90;
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
 * @param {Record<string, unknown>} recipe
 * @param {string|null|undefined} name
 * @returns {number|null}
 */
function nutrientAmount(recipe, name) {
  const nutrients = recipe?.nutrition?.nutrients;
  if (!Array.isArray(nutrients)) return null;
  const hit = nutrients.find((n) => n && n.name === name);
  if (hit?.amount == null) return null;
  const val = Number(hit.amount);
  return Number.isFinite(val) ? val : null;
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} mealType
 * @returns {Record<string, unknown>}
 */
export function mapSpoonacularRecipeToCatalogRow(recipe, mealType) {
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

  const diets = Array.isArray(recipe.diets) ? recipe.diets.map((d) => String(d)) : [];

  return {
    source: 'spoonacular',
    source_id: sourceId,
    name_en: String(recipe.title || '').trim() || `Recipe ${sourceId}`,
    name_cs: null,
    servings: 1,
    kcal: kcal > 0 ? kcal : 300,
    protein_g: nutrientAmount(recipe, 'Protein'),
    carbs_g: nutrientAmount(recipe, 'Carbohydrates'),
    fat_g: nutrientAmount(recipe, 'Fat'),
    ingredients,
    instructions: recipe.analyzedInstructions ?? null,
    image_url: recipe.image ? String(recipe.image) : null,
    spoonacular_url:
      recipe.sourceUrl
      || recipe.spoonacularSourceUrl
      || `https://spoonacular.com/recipes/${sourceId}`,
    diet_tags: diets,
    meal_type: mealType || 'main course',
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
async function upsertSpoonacularCatalogRows(rows) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const { data, error } = await supabaseServer.rpc('upsert_spoonacular_catalog_import_rows', {
    p_rows: rows,
  });

  if (error) return { inserted: 0, updated: 0, error: error.message };

  const inserted = Number(data?.inserted) || 0;
  const updated = Number(data?.updated) || 0;
  return { inserted, updated };
}

/**
 * @param {ImportOptions} options
 * @returns {Promise<ImportResult>}
 */
export async function runSpoonacularCatalogImport(options = {}) {
  const apiKey = spoonacularApiKey();
  const number = options.number ?? 100;
  const pages = options.pages ?? 1;
  const maxRequests = options.maxRequests ?? maxRequestsPerRun();
  const mealType = options.type || 'main course';
  const diet = options.diet || '';
  const filters = options.filters || DEFAULT_CATALOG_IMPORT_FILTERS;

  let offset = options.offset ?? 0;
  let imported = 0;
  let updated = 0;
  let matched = 0;
  let totalResults = null;
  let requestsUsed = 0;
  let quotaLeft = null;
  /** @type {string[]} */
  const errors = [];

  for (let page = 0; page < pages; page += 1) {
    if (requestsUsed >= maxRequests) {
      return { imported, updated, matched, totalResults, quotaLeft, requestsUsed, filters, stoppedReason: 'max_requests_cap' };
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
    if (mealType) params.set('type', mealType);
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
    quotaLeft = readQuotaLeft(res);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const msg = `Spoonacular HTTP ${res.status}: ${body.slice(0, 200)}`;
      console.error('[import-spoonacular]', msg);
      errors.push(msg);
      break;
    }

    if (quotaLeft != null && quotaLeft < QUOTA_STOP_THRESHOLD) {
      console.warn('[import-spoonacular] quota low, stopping', { quotaLeft });
      return { imported, updated, matched, totalResults, quotaLeft, requestsUsed, filters, stoppedReason: 'quota_low', errors };
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
    if (results.length === 0) {
      return { imported, updated, matched, totalResults, quotaLeft, requestsUsed, filters, stoppedReason: 'no_results', errors };
    }

    /** @type {Record<string, unknown>[]} */
    const upsertRows = [];

    for (const recipe of results) {
      try {
        const row = mapSpoonacularRecipeToCatalogRow(/** @type {Record<string, unknown>} */ (recipe), mealType);
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

    offset += number;

    if (requestsUsed >= maxRequests) {
      return { imported, updated, matched, totalResults, quotaLeft, requestsUsed, filters, stoppedReason: 'max_requests_cap', errors };
    }
    if (quotaLeft != null && quotaLeft < QUOTA_STOP_THRESHOLD) {
      return { imported, updated, matched, totalResults, quotaLeft, requestsUsed, filters, stoppedReason: 'quota_low', errors };
    }
  }

  return { imported, updated, matched, totalResults, quotaLeft, requestsUsed, filters, errors: errors.length ? errors : undefined };
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
 * Cron batch: one page per meal type until quota or max requests.
 * @returns {Promise<ImportResult & { byType: Record<string, { imported: number, updated: number }> }>}
 */
export async function runDailySpoonacularCatalogImport() {
  const maxRequests = maxRequestsPerRun();
  let totalImported = 0;
  let totalUpdated = 0;
  let requestsUsed = 0;
  let quotaLeft = null;
  /** @type {Record<string, { imported: number, updated: number }>} */
  const byType = {};

  for (const type of CRON_IMPORT_MEAL_TYPES) {
    if (requestsUsed >= maxRequests) break;

    const remaining = maxRequests - requestsUsed;
    const result = await runSpoonacularCatalogImport({
      type,
      number: 100,
      offset: 0,
      pages: 1,
      maxRequests: remaining,
      filters: DEFAULT_CATALOG_IMPORT_FILTERS,
    });

    requestsUsed += result.requestsUsed;
    totalImported += result.imported;
    totalUpdated += result.updated;
    quotaLeft = result.quotaLeft;
    byType[type] = { imported: result.imported, updated: result.updated };

    if (result.stoppedReason === 'quota_low' || result.stoppedReason === 'max_requests_cap') {
      return {
        imported: totalImported,
        updated: totalUpdated,
        quotaLeft,
        requestsUsed,
        stoppedReason: result.stoppedReason,
        byType,
      };
    }
  }

  return {
    imported: totalImported,
    updated: totalUpdated,
    quotaLeft,
    requestsUsed,
    byType,
  };
}
