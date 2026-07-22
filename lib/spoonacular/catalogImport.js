/**
 * Spoonacular complexSearch → recipes_catalog upsert (server-side only).
 */
import { supabaseServer } from '../supabaseServer';

const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes/complexSearch';
const QUOTA_STOP_THRESHOLD = 5;

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

  return {
    ok: true,
    value: {
      type,
      diet,
      number: Math.floor(numberRaw),
      offset: Math.floor(offsetRaw),
      pages: Math.floor(pagesRaw),
    },
  };
}

/**
 * @typedef {{ type?: string, diet?: string, number?: number, offset?: number, pages?: number, maxRequests?: number }} ImportOptions
 * @typedef {{ imported: number, updated: number, quotaLeft: number|null, requestsUsed: number, stoppedReason?: string, errors?: string[] }} ImportResult
 */

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

  let offset = options.offset ?? 0;
  let imported = 0;
  let updated = 0;
  let requestsUsed = 0;
  let quotaLeft = null;
  /** @type {string[]} */
  const errors = [];

  for (let page = 0; page < pages; page += 1) {
    if (requestsUsed >= maxRequests) {
      return { imported, updated, quotaLeft, requestsUsed, stoppedReason: 'max_requests_cap' };
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
      return { imported, updated, quotaLeft, requestsUsed, stoppedReason: 'quota_low', errors };
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

    const results = Array.isArray(data.results) ? data.results : [];
    if (results.length === 0) {
      return { imported, updated, quotaLeft, requestsUsed, stoppedReason: 'no_results', errors };
    }

    const sourceIds = results
      .map((r) => String(/** @type {{ id?: unknown }} */ (r).id ?? '').trim())
      .filter(Boolean);

    const { data: existingRows, error: existErr } = await supabaseServer
      .from('recipes_catalog')
      .select('source_id, name_cs, active')
      .eq('source', 'spoonacular')
      .in('source_id', sourceIds);

    if (existErr) {
      errors.push(existErr.message);
      break;
    }

    /** @type {Map<string, { name_cs: string|null, active: boolean }>} */
    const existingMap = new Map(
      (existingRows || []).map((r) => [String(r.source_id), { name_cs: r.name_cs, active: r.active }]),
    );

    /** @type {Record<string, unknown>[]} */
    const toInsert = [];
    /** @type {Array<{ row: Record<string, unknown>, existing: { name_cs: string|null, active: boolean } }>} */
    const toUpdate = [];

    for (const recipe of results) {
      try {
        const row = mapSpoonacularRecipeToCatalogRow(/** @type {Record<string, unknown>} */ (recipe), mealType);
        const sid = String(row.source_id);
        const ex = existingMap.get(sid);
        if (ex) toUpdate.push({ row, existing: ex });
        else toInsert.push(row);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[import-spoonacular] skip recipe', msg);
        errors.push(msg);
      }
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabaseServer.from('recipes_catalog').insert(toInsert);
      if (insertErr) {
        console.error('[import-spoonacular] insert failed', insertErr.message);
        errors.push(insertErr.message);
        break;
      }
      imported += toInsert.length;
    }

    for (const { row, existing } of toUpdate) {
      /** @type {Record<string, unknown>} */
      const payload = { ...row };
      if (existing.name_cs) {
        delete payload.name_cs;
        payload.active = existing.active;
      }
      const { error: updateErr } = await supabaseServer
        .from('recipes_catalog')
        .update(payload)
        .eq('source', 'spoonacular')
        .eq('source_id', String(row.source_id));

      if (updateErr) {
        errors.push(`Update ${row.source_id}: ${updateErr.message}`);
        continue;
      }
      updated += 1;
    }

    offset += number;

    if (requestsUsed >= maxRequests) {
      return { imported, updated, quotaLeft, requestsUsed, stoppedReason: 'max_requests_cap', errors };
    }
    if (quotaLeft != null && quotaLeft < QUOTA_STOP_THRESHOLD) {
      return { imported, updated, quotaLeft, requestsUsed, stoppedReason: 'quota_low', errors };
    }
  }

  return { imported, updated, quotaLeft, requestsUsed, errors: errors.length ? errors : undefined };
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
