/**
 * Spoonacular complexSearch → recipes_catalog upsert (server-side only).
 */
import { supabaseServer } from '../supabaseServer';
import { extractInstructionStepsEn } from './catalogTranslate';

const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes/complexSearch';
const QUOTA_STOP_THRESHOLD = 5;

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

/**
 * @typedef {{ maxMainIngredients: number, maxReadyTime: number, maxSteps: number, noCooking?: boolean }} MealSimplicityRules
 * @type {Record<string, MealSimplicityRules>}
 */
export const MEAL_SIMPLICITY_RULES = Object.freeze({
  snidane: { maxMainIngredients: 4, maxReadyTime: 10, maxSteps: 4 },
  svacina: { maxMainIngredients: 3, maxReadyTime: 5, maxSteps: 99, noCooking: true },
  obed: { maxMainIngredients: 6, maxReadyTime: 20, maxSteps: 5 },
  vecere: { maxMainIngredients: 6, maxReadyTime: 20, maxSteps: 5 },
});

/**
 * Seasonings excluded from main-ingredient count (normalized match, case/diacritic-insensitive).
 */
export const SEASONINGS = Object.freeze([
  'sůl',
  'pepř',
  'olej',
  'olivový olej',
  'voda',
  'cukr',
  'mletý pepř',
  'mořská sůl',
  'bazalka',
  'oregano',
  'tymián',
  'kmín',
  'skořice',
  'kurkuma',
  'koriandr',
  'petržel',
  'česnek',
  'jedlá soda',
  'prášek do pečiva',
  'vanilkový extrakt',
  'ocet',
]);

/** English aliases for Spoonacular ingredient names (matching only, not exported). */
const SEASONING_EN_ALIASES = Object.freeze([
  'salt',
  'pepper',
  'black pepper',
  'ground pepper',
  'oil',
  'olive oil',
  'water',
  'sugar',
  'sea salt',
  'basil',
  'thyme',
  'cumin',
  'cinnamon',
  'turmeric',
  'coriander',
  'parsley',
  'garlic',
  'baking soda',
  'baking powder',
  'vanilla extract',
  'vinegar',
]);

/** Reject recipes with complex preparation in instruction text. */
export const COMPLEX_PREP_REGEX = Object.freeze([
  /marinate overnight/i,
  /refrigerate for \d+\s*(hour|hours|hr|hrs)/i,
  /chill overnight/i,
  /overnight in the (fridge|refrigerator)/i,
  /food processor/i,
  /double boiler/i,
  /deep[- ]?fry/i,
  /stand mixer/i,
  /slow cooker/i,
  /pressure cooker/i,
  /candy thermometer/i,
  /proof for \d+/i,
  /rise for \d+\s*(hour|hours)/i,
]);

/** Cooking verbs/patterns — rejected for svacina (no-cook snacks). */
export const COOKING_REGEX = Object.freeze([
  /\bbake\b/i,
  /\bboil\b/i,
  /\bsimmer\b/i,
  /\bfry\b/i,
  /\broast\b/i,
  /\bgrill\b/i,
  /\bcook\b/i,
  /\boven\b/i,
  /\bstovetop\b/i,
  /\bstove top\b/i,
  /\bmicro?wave\b/i,
  /\bpreheat\b/i,
  /\bsaut[eé]\b/i,
  /\bbroil\b/i,
  /\bsteam\b/i,
  /\bpoach\b/i,
  /\bbraise\b/i,
  /\bskillet\b/i,
  /\bpan[- ]?fry/i,
  /\bheat (the|a|over|on|in)\b/i,
]);

/** Default fitness-oriented complexSearch filters (cron + admin when not overridden). */
export const DEFAULT_CATALOG_IMPORT_FILTERS = Object.freeze({
  minProtein: 5,
  maxSugar: 30,
  sort: 'healthiness',
  sortDirection: 'desc',
});

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
 * @param {string} catalogMealType
 * @returns {MealSimplicityRules}
 */
export function getMealSimplicityRules(catalogMealType) {
  const key = String(catalogMealType || 'obed').trim().toLowerCase();
  return MEAL_SIMPLICITY_RULES[key] || MEAL_SIMPLICITY_RULES.obed;
}

/**
 * @param {string} catalogMealType
 * @param {CatalogImportFilters|undefined} baseFilters
 * @returns {CatalogImportFilters}
 */
export function buildImportFiltersForMealType(catalogMealType, baseFilters) {
  const rules = getMealSimplicityRules(catalogMealType);
  const merged = { ...(baseFilters || DEFAULT_CATALOG_IMPORT_FILTERS) };
  if (merged.maxReadyTime == null) merged.maxReadyTime = rules.maxReadyTime;
  return merged;
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeIngredientName(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @type {string[]} */
const SEASONINGS_NORMALIZED = [...SEASONINGS, ...SEASONING_EN_ALIASES]
  .map((s) => normalizeIngredientName(s))
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

/**
 * @param {string} ingredientName
 * @returns {boolean}
 */
export function isSeasoningIngredient(ingredientName) {
  const n = normalizeIngredientName(ingredientName);
  if (!n) return false;
  for (const s of SEASONINGS_NORMALIZED) {
    if (n === s) return true;
    if (n.startsWith(`${s} `) || n.endsWith(` ${s}`)) return true;
    if (s.includes(' ') && n.includes(s)) return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} recipe
 * @returns {number}
 */
export function countMainIngredients(recipe) {
  const ings = Array.isArray(recipe.extendedIngredients) ? recipe.extendedIngredients : [];
  let count = 0;
  for (const ing of ings) {
    const name = String(/** @type {{ nameClean?: string, name?: string }} */ (ing)?.nameClean
      || /** @type {{ name?: string }} */ (ing)?.name
      || '').trim();
    if (!isSeasoningIngredient(name)) count += 1;
  }
  return count;
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} catalogMealType
 * @returns {{ pass: boolean, reason: string|null }}
 */
export function evaluateRecipeSimplicity(recipe, catalogMealType) {
  const rules = getMealSimplicityRules(catalogMealType);
  const mainCount = countMainIngredients(recipe);
  if (mainCount > rules.maxMainIngredients) {
    return { pass: false, reason: 'too_many_ingredients' };
  }

  const steps = extractInstructionStepsEn(recipe.analyzedInstructions);
  if (steps.length === 0) return { pass: false, reason: 'no_instructions' };
  if (steps.length > rules.maxSteps) {
    return { pass: false, reason: 'too_many_steps' };
  }

  const ready = Number(recipe.readyInMinutes);
  if (Number.isFinite(ready) && ready > rules.maxReadyTime) {
    return { pass: false, reason: 'ready_time_exceeded' };
  }

  const stepsText = steps.join('\n');
  for (const re of COMPLEX_PREP_REGEX) {
    if (re.test(stepsText)) return { pass: false, reason: 'complex_preparation' };
  }

  if (rules.noCooking) {
    for (const re of COOKING_REGEX) {
      if (re.test(stepsText)) return { pass: false, reason: 'requires_cooking' };
    }
  }

  return { pass: true, reason: null };
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} catalogMealType
 * @returns {boolean}
 */
export function recipePassesSimplicityFilter(recipe, catalogMealType) {
  return evaluateRecipeSimplicity(recipe, catalogMealType).pass;
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
 * @typedef {{ imported: number, updated: number, matched: number, rejected: number, rejectedReason: Record<string, number>, catalogMealType?: string, totalResults: number|null, quotaLeft: number|null, requestsUsed: number, filters: CatalogImportFilters, offset?: number, nextOffset?: number, stoppedReason?: string, errors?: string[] }} ImportResult
 */

/**
 * @param {string} mealType
 * @returns {Promise<number>}
 */
export async function getSpoonacularImportCursor(mealType) {
  const key = String(mealType || '').trim();
  if (!key) return 0;

  const { data, error } = await supabaseServer
    .from('spoonacular_import_cursor')
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
    .from('spoonacular_import_cursor')
    .upsert(
      { meal_type: key, next_offset: offset, updated_at: new Date().toISOString() },
      { onConflict: 'meal_type' },
    );

  if (error) throw new Error(error.message);
}

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
  let rejected = 0;
  /** @type {Record<string, number>} */
  const rejectedReason = {};
  let totalResults = null;
  let requestsUsed = 0;
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
      rejected,
      rejectedReason,
      catalogMealType,
      totalResults,
      quotaLeft,
      requestsUsed,
      filters,
      offset: startOffset,
      nextOffset,
      errors: errors.length ? errors : undefined,
      ...extra,
    };
  }

  /**
   * @param {number} pageOffset
   * @param {number} resultCount
   */
  async function persistCursorAfterSuccess(pageOffset, resultCount) {
    if (!cursorManaged) return;
    nextOffset = resultCount < number ? 0 : pageOffset + number;
    await saveSpoonacularImportCursor(cursorKey, nextOffset);
  }

  for (let page = 0; page < pages; page += 1) {
    if (requestsUsed >= maxRequests) {
      return buildResult({ stoppedReason: 'max_requests_cap' });
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
      return buildResult({ stoppedReason: 'quota_low' });
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
      if (cursorManaged) {
        nextOffset = 0;
        await saveSpoonacularImportCursor(cursorKey, 0);
      }
      return buildResult({ stoppedReason: 'no_results' });
    }

    /** @type {Record<string, unknown>[]} */
    const upsertRows = [];

    for (const recipe of results) {
      const evaluation = evaluateRecipeSimplicity(/** @type {Record<string, unknown>} */ (recipe), catalogMealType);
      if (!evaluation.pass) {
        recordRejection(evaluation.reason || 'rejected');
        continue;
      }
      try {
        const row = mapSpoonacularRecipeToCatalogRow(
          /** @type {Record<string, unknown>} */ (recipe),
          catalogMealType,
        );
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

    if (requestsUsed >= maxRequests) {
      return buildResult({ stoppedReason: 'max_requests_cap' });
    }
    if (quotaLeft != null && quotaLeft < QUOTA_STOP_THRESHOLD) {
      return buildResult({ stoppedReason: 'quota_low' });
    }
  }

  return buildResult();
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
  let totalRejected = 0;
  /** @type {Record<string, number>} */
  let totalRejectedReason = {};
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
      pages: 1,
      maxRequests: remaining,
      useCursor: true,
    });

    requestsUsed += result.requestsUsed;
    totalImported += result.imported;
    totalUpdated += result.updated;
    totalRejected += result.rejected;
    for (const [reason, count] of Object.entries(result.rejectedReason || {})) {
      totalRejectedReason[reason] = (totalRejectedReason[reason] || 0) + count;
    }
    quotaLeft = result.quotaLeft;
    byType[type] = {
      imported: result.imported,
      updated: result.updated,
      rejected: result.rejected,
      rejectedReason: result.rejectedReason,
      catalogMealType: result.catalogMealType,
      offset: result.offset,
      nextOffset: result.nextOffset,
    };

    if (result.stoppedReason === 'quota_low' || result.stoppedReason === 'max_requests_cap') {
      return {
        imported: totalImported,
        updated: totalUpdated,
        rejected: totalRejected,
        rejectedReason: totalRejectedReason,
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
    rejected: totalRejected,
    rejectedReason: totalRejectedReason,
    quotaLeft,
    requestsUsed,
    byType,
  };
}
