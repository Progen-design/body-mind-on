/**
 * lib/mealEnrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Meal enrichment via Spoonacular (metadata + image).
 *
 * TRUST MODEL:
 *   Recipe link (recipe_id, _recipe): when scoreFinal >= MEAL_CONFIDENCE_THRESHOLD — used for
 *   názvy, překlad, ověření v plánu; nevyžaduje obrázek (recept může být bez image v API).
 *   image_trust_level: "exact" → confidence >= threshold AND Spoonacular vrátil image URL
 *   image_trust_level: "none"   → žádný ověřený obrázek (UI: placeholder / API_ONLY_MEDIA)
 *
 * SHORTLIST EVALUATION:
 *   For each search candidate, callSpoonacular() returns a shortlist. All recipes
 *   across all candidates are scored and compared. chooseBestMealRecipe() selects the
 *   winner using score + tie-break rules (image, nutrition, title specificity).
 *
 * DUAL-QUERY SCORING:
 *   Each recipe is scored against BOTH the original Czech mealName AND the search candidate.
 *   The maximum is taken, preventing penalisation of a correct English match.
 *
 * EARLY EXIT:
 *   After processing all shortlist results for a candidate, if the best score so far
 *   exceeds MEAL_CONFIDENCE_THRESHOLD, remaining candidates are skipped (save API calls).
 *
 * Returns internal field `_bestCandidate` (not cached, not public) for Pexels fallback.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabaseServer } from './supabaseServer';
import { scoreMealMatch, normalizeMealQueryCs, buildMealSearchCandidates, removeDiacritics } from './mealNormalization';
import { buildComplexSearchQueryString } from './spoonacularComplexSearch';
import { shortenMealSearchQuery } from './mealQueryShorten';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const API_TIMEOUT_MS = 5000;

/**
 * Minimální skóre shody receptu (0–1). Sjednoceno s planOrchestrator / replace-meal.
 * Historicky 0.75 odmítalo i ~0.72; default 0.35. Přepis: env MEAL_CONFIDENCE_THRESHOLD (0–1).
 */
function readConfidenceThreshold() {
  const e = Number(process.env.MEAL_CONFIDENCE_THRESHOLD);
  if (Number.isFinite(e) && e > 0 && e <= 1) return e;
  return 0.35;
}

export const MEAL_CONFIDENCE_THRESHOLD = readConfidenceThreshold();
const CONFIDENCE_THRESHOLD = MEAL_CONFIDENCE_THRESHOLD;

/**
 * Cache TTL by trust level (in milliseconds).
 *
 * exact → never expire: Spoonacular confirmed the image with high confidence.
 * none  → 3 days: No result found. Re-try after a few days in case the
 *         upstream API improves or query normalization changes.
 */
const CACHE_TTL_MS = {
  exact: null,          // Never expires
  none: 3 * 24 * 60 * 60 * 1000,            // 3 days
};

/**
 * Canonical empty shape for a meal enrichment result.
 * image_trust_level, exact_source, illustrative_source support UI trust labels.
 */
const EMPTY_MEAL = (name) => ({
  name: name || 'Unknown',
  image_url: null,
  source: 'none',
  // Trust metadata – used by UI to show "Přesný zdroj" / "Ilustrační foto" labels
  image_trust_level: 'none',   // exact | illustrative | none
  exact_source: null,          // spoonacular | null
  illustrative_source: null,   // pexels | null
  confidence_score: 0,         // 0..1
  calories: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
});

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function makeCacheKey(mealName) {
  return removeDiacritics(normalizeMealQueryCs(mealName))
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}

/** Denní dedup: zkrácený dotaz + typ jídla (breakfast/lunch/…), UTC den. */
function makeDailyDedupKey(shortenedQuery, mealType = '') {
  const day = new Date().toISOString().slice(0, 10);
  const mt = mealType && typeof mealType === 'string' ? mealType : 'na';
  return makeCacheKey(`spoon_dedup_${day}_${mt}_${shortenedQuery}`);
}

async function getDailySpoonacularDedup(shortenedQuery, mealType = '') {
  if (!shortenedQuery) return null;
  const key = makeDailyDedupKey(shortenedQuery, mealType);
  const todayUtc = new Date().toISOString().slice(0, 10);
  try {
    const { data } = await supabaseServer
      .from('meal_metadata_cache')
      .select('updated_at, nutrition_json')
      .eq('name_key', key)
      .maybeSingle();
    if (!data?.nutrition_json?.dedup_v1) return null;
    const u = data.updated_at ? new Date(data.updated_at).toISOString().slice(0, 10) : '';
    if (u !== todayUtc) return null;
    return data.nutrition_json.dedup_v1;
  } catch {
    return null;
  }
}

async function setDailySpoonacularDedup(shortenedQuery, meta, mealType = '') {
  if (!shortenedQuery || !meta) return;
  const key = makeDailyDedupKey(shortenedQuery, mealType);
  const dedup_v1 = {
    name: meta.name,
    image_url: meta.image_url,
    source: meta.source,
    image_trust_level: meta.image_trust_level,
    exact_source: meta.exact_source,
    illustrative_source: meta.illustrative_source,
    confidence_score: meta.confidence_score,
    recipe_id: meta.recipe_id,
    calories: meta.calories,
    protein_g: meta.protein_g,
    carbs_g: meta.carbs_g,
    fat_g: meta.fat_g,
    _bestCandidate: meta._bestCandidate,
    _recipe: meta._recipe,
  };
  try {
    await supabaseServer
      .from('meal_metadata_cache')
      .upsert(
        {
          name_key: key,
          name: shortenedQuery,
          image_url: meta.image_url ?? null,
          source: meta.source ?? 'none',
          image_trust_level: meta.image_trust_level ?? 'none',
          exact_source: meta.exact_source ?? null,
          illustrative_source: meta.illustrative_source ?? null,
          confidence_score: meta.confidence_score ?? 0,
          calories: meta.calories ?? null,
          protein_g: meta.protein_g ?? null,
          carbs_g: meta.carbs_g ?? null,
          fat_g: meta.fat_g ?? null,
          recipe_id: meta.recipe_id ?? null,
          nutrition_json: { dedup_v1 },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'name_key' }
      );
  } catch {
    // non-fatal
  }
}

// ─── Cache ─────────────────────────────────────────────────────────────────

/**
 * Return a cached meal entry — but ONLY if it is still fresh for its trust level.
 */
async function getCachedMeal(cacheKey) {
  if (!cacheKey) return null;
  try {
    const { data } = await supabaseServer
      .from('meal_metadata_cache')
      .select('name, image_url, source, image_trust_level, exact_source, illustrative_source, confidence_score, calories, protein_g, carbs_g, fat_g, recipe_id, updated_at')
      .eq('name_key', cacheKey)
      .maybeSingle();

    if (!data) return null;

    const trustLevel = data.image_trust_level || 'none';
    const ttlMs = CACHE_TTL_MS[trustLevel];

    if (ttlMs !== null && ttlMs !== undefined) {
      const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      const ageMs = Date.now() - updatedAt;
      if (ageMs > ttlMs) {
        return null;
      }
    }

    return data;
  } catch {
    return null;
  }
}

/** Lookup by recipe_id when HTML has data-recipe-id (from structured plan). */
async function getCachedMealByRecipeId(recipeId) {
  if (!recipeId || !Number.isFinite(recipeId)) return null;
  try {
    const { data } = await supabaseServer
      .from('meal_metadata_cache')
      .select('name, image_url, source, image_trust_level, exact_source, illustrative_source, confidence_score, calories, protein_g, carbs_g, fat_g, recipe_id, updated_at')
      .eq('recipe_id', recipeId)
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    const trustLevel = data.image_trust_level || 'none';
    const ttlMs = CACHE_TTL_MS[trustLevel];
    if (ttlMs !== null && ttlMs !== undefined) {
      const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      if (Date.now() - updatedAt > ttlMs) return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function setCachedMeal(cacheKey, meal) {
  if (!cacheKey || !meal) return;
  try {
    await supabaseServer
      .from('meal_metadata_cache')
      .upsert(
        {
          name_key: cacheKey,
          name: meal.name,
          image_url: meal.image_url,
          source: meal.source,
          image_trust_level: meal.image_trust_level ?? 'none',
          exact_source: meal.exact_source ?? null,
          illustrative_source: meal.illustrative_source ?? null,
          confidence_score: meal.confidence_score ?? 0,
          calories: meal.calories ?? null,
          protein_g: meal.protein_g ?? null,
          carbs_g: meal.carbs_g ?? null,
          fat_g: meal.fat_g ?? null,
          recipe_id: meal.recipe_id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'name_key' }
      );
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Spoonacular ────────────────────────────────────────────────────────────

/** Default shortlist size (overriden per opts / fastMode). */
const SPOONACULAR_SHORTLIST_SIZE = 5;

/**
 * Mapuje odpověď Spoonacular receptu na náš strukturovaný tvar (makra + vitamíny + ingredience).
 * @param {object} recipe – položka z complexSearch nebo information
 */
export function mapSpoonacularRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') {
    return {
      id: null,
      title: null,
      image: null,
      source_url: null,
      ready_in_minutes: null,
      servings: null,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      sugar_g: null,
      saturated_fat_g: null,
      sodium_mg: null,
      cholesterol_mg: null,
      vitamin_c_mg: null,
      vitamin_d_ug: null,
      calcium_mg: null,
      iron_mg: null,
      potassium_mg: null,
      health_score: null,
      price_per_serving: null,
      diets: [],
      dish_types: [],
      ingredients: [],
    };
  }

  const nutrients = recipe.nutrition?.nutrients || [];
  const getN = (name) => {
    const n = nutrients.find((x) => (x.name || '').toLowerCase() === String(name).toLowerCase());
    return n?.amount != null ? Number(n.amount) : null;
  };
  const getNAny = (names) => {
    for (const name of names) {
      const v = getN(name);
      if (v != null) return v;
    }
    return null;
  };

  return {
    id: recipe.id ?? null,
    title: recipe.title ?? null,
    image: recipe.image ?? null,
    source_url: recipe.sourceUrl ?? null,
    ready_in_minutes: recipe.readyInMinutes ?? null,
    servings: recipe.servings ?? null,
    calories: getN('Calories'),
    protein_g: getN('Protein'),
    carbs_g: getN('Carbohydrates'),
    fat_g: getN('Fat'),
    fiber_g: getN('Fiber'),
    sugar_g: getN('Sugar'),
    saturated_fat_g: getN('Saturated Fat'),
    sodium_mg: getN('Sodium'),
    cholesterol_mg: getN('Cholesterol'),
    vitamin_c_mg: getN('Vitamin C'),
    vitamin_d_ug: getNAny(['Vitamin D', 'Vitamin D (D2 + D3)']),
    calcium_mg: getN('Calcium'),
    iron_mg: getN('Iron'),
    potassium_mg: getN('Potassium'),
    health_score: recipe.healthScore ?? null,
    price_per_serving: recipe.pricePerServing ?? null,
    diets: Array.isArray(recipe.diets) ? recipe.diets : [],
    dish_types: Array.isArray(recipe.dishTypes) ? recipe.dishTypes : [],
    ingredients: (recipe.extendedIngredients || []).map((i) => ({
      id: i.id,
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      aisle: i.aisle || null,
    })),
  };
}

/**
 * Call Spoonacular complexSearch; vrátí shortlist receptů.
 * @param {string} query
 * @param {number} timeoutMs
 * @param {object|null} ctx – spoonacularContext (mealType, diet, kalorie, intolerance, …)
 */
async function callSpoonacular(query, timeoutMs = API_TIMEOUT_MS, ctx = null) {
  if (!SPOONACULAR_KEY) return [];

  const n = ctx?.number ?? SPOONACULAR_SHORTLIST_SIZE;
  const base = {
    query,
    number: n,
    mealType: ctx?.mealType ?? 'lunch',
    diet: ctx?.diet ?? 'standard',
    caloriesPerDay: ctx?.caloriesPerDay ?? 2000,
    mealsPerDay: ctx?.mealsPerDay ?? 3,
    intolerances: ctx?.intolerances ?? [],
    excludeIngredients: ctx?.excludeIngredients ?? [],
    maxReadyTime: ctx?.maxReadyTime ?? 60,
  };
  const qs = buildComplexSearchQueryString(base, SPOONACULAR_KEY);
  const url = `https://api.spoonacular.com/recipes/complexSearch?${qs}`;

  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } }, timeoutMs);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

/**
 * Score a single recipe against both the original meal name and the search candidate.
 */
function evaluateRecipeAgainstQuery(mealName, candidate, recipe) {
  const scoreOriginal = scoreMealMatch(mealName, recipe);
  const scoreCandidate = scoreMealMatch(candidate, recipe);
  const scoreFinal = Math.max(scoreOriginal, scoreCandidate);
  return {
    recipe,
    candidate,
    scoreOriginal,
    scoreCandidate,
    scoreFinal,
    hasImage: Boolean(recipe?.image),
    hasNutrition: (recipe?.nutrition?.nutrients?.length ?? 0) > 0,
  };
}

const CLOSE_SCORE_DELTA = 0.05;

function chooseBestMealRecipe(evaluations) {
  if (!evaluations.length) return null;

  const sorted = [...evaluations].sort((a, b) => {
    const scoreDiff = b.scoreFinal - a.scoreFinal;
    if (Math.abs(scoreDiff) > CLOSE_SCORE_DELTA) return scoreDiff;

    if (a.hasImage !== b.hasImage) return a.hasImage ? -1 : 1;

    if (a.hasNutrition !== b.hasNutrition) return a.hasNutrition ? -1 : 1;

    const aLen = (a.recipe?.title || '').length;
    const bLen = (b.recipe?.title || '').length;
    return aLen - bLen;
  });

  return sorted[0] ?? null;
}

function extractNutrition(recipe) {
  let calories = null; let protein_g = null; let carbs_g = null; let fat_g = null;
  const nutrients = recipe?.nutrition?.nutrients ?? [];
  for (const n of nutrients) {
    const label = (n.name || '').toLowerCase();
    if (label === 'calories') calories = n.amount ?? null;
    else if (label === 'protein') protein_g = n.amount ?? null;
    else if (label === 'carbohydrates') carbs_g = n.amount ?? null;
    else if (label === 'fat') fat_g = n.amount ?? null;
  }
  return {
    calories: calories != null ? Number(calories) : null,
    protein_g: protein_g != null ? Number(protein_g) : null,
    carbs_g: carbs_g != null ? Number(carbs_g) : null,
    fat_g: fat_g != null ? Number(fat_g) : null,
  };
}

/**
 * @param {string} mealName
 * @param {string|null} mealKey
 * @param {{
 *   maxCandidates?: number,
 *   timeoutMs?: number,
 *   fastMode?: boolean,
 *   shortlistSize?: number,
 *   spoonacularContext?: object,
 *   skipDailyDedup?: boolean
 * }} [opts]
 */
export async function searchMealMetadata(mealName, mealKey = null, opts = {}) {
  if (!mealName || typeof mealName !== 'string') return EMPTY_MEAL(mealName);

  const normalizedMeal = normalizeMealQueryCs(mealName);
  let shortForApi = shortenMealSearchQuery(normalizedMeal);
  if (!shortForApi) shortForApi = (normalizedMeal.split(/\s+/)[0] || '').trim();

  const dedupMealType = opts?.spoonacularContext?.mealType || '';

  if (!opts?.skipDailyDedup && shortForApi) {
    const dedup = await getDailySpoonacularDedup(shortForApi, dedupMealType);
    if (dedup) {
      return {
        ...dedup,
        _spoonacularCalls: 0,
      };
    }
  }

  const baseCandidates = buildMealSearchCandidates(shortForApi || normalizedMeal);
  const keyNorm = mealKey && typeof mealKey === 'string' ? normalizeMealQueryCs(mealKey).trim().slice(0, 80) : '';
  const keyNormShort = keyNorm.length >= 3 ? shortenMealSearchQuery(keyNorm) : '';

  const seen = new Set();
  const candidates = [];
  const push = (c) => {
    const raw = (c || '').trim();
    if (!raw) return;
    const n = raw.toLowerCase();
    if (seen.has(n)) return;
    seen.add(n);
    candidates.push(raw);
  };

  if (keyNorm.length >= 3) push((keyNormShort || keyNorm).trim());
  if (shortForApi) push(shortForApi);
  for (const c of baseCandidates) push(c);

  const maxC = opts?.maxCandidates;
  if (maxC != null && maxC > 0 && candidates.length > maxC) candidates.splice(maxC);
  if (!candidates.length) {
    const empty = EMPTY_MEAL(mealName);
    if (!opts?.skipDailyDedup && shortForApi) await setDailySpoonacularDedup(shortForApi, empty, dedupMealType);
    return empty;
  }

  const sc = opts?.spoonacularContext || null;
  const shortlistN = opts?.shortlistSize
    ?? (opts?.fastMode ? 3 : SPOONACULAR_SHORTLIST_SIZE);

  /** @type {Array<ReturnType<evaluateRecipeAgainstQuery>>} */
  const allEvaluations = [];
  let spoonacularCalls = 0;

  const timeoutMs = opts?.timeoutMs ?? API_TIMEOUT_MS;
  for (const candidate of candidates) {
    if (!candidate) continue;

    spoonacularCalls += 1;
    const callCtx = sc
      ? { ...sc, number: shortlistN }
      : { number: shortlistN, mealType: 'lunch', diet: 'standard', caloriesPerDay: 2000, mealsPerDay: 3 };
    const recipes = await callSpoonacular(candidate, timeoutMs, callCtx);
    for (const recipe of recipes) {
      if (!recipe || typeof recipe !== 'object') continue;
      allEvaluations.push(evaluateRecipeAgainstQuery(mealName, candidate, recipe));
    }

    const bestSoFar = allEvaluations.reduce((max, e) => Math.max(max, e.scoreFinal), 0);
    if (bestSoFar >= CONFIDENCE_THRESHOLD) break;
  }

  const best = chooseBestMealRecipe(allEvaluations);
  if (!best) {
    const empty = EMPTY_MEAL(mealName);
    if (!opts?.skipDailyDedup && shortForApi) await setDailySpoonacularDedup(shortForApi, empty, dedupMealType);
    return empty;
  }

  const nutrition = extractNutrition(best.recipe);
  const scoreAccepted = best.scoreFinal >= CONFIDENCE_THRESHOLD;
  const isImageExact = scoreAccepted && best.hasImage;
  const recipeId = best.recipe?.id != null ? Number(best.recipe.id) : null;

  const result = {
    name: best.recipe.title || mealName,
    image_url: isImageExact ? (best.recipe.image || null) : null,
    source: 'spoonacular',
    image_trust_level: isImageExact ? 'exact' : 'none',
    exact_source: isImageExact ? 'spoonacular' : null,
    illustrative_source: null,
    confidence_score: best.scoreFinal,
    recipe_id: scoreAccepted && recipeId ? recipeId : null,
    _bestCandidate: best.candidate,
    _recipe: scoreAccepted && best.recipe ? best.recipe : null,
    _spoonacularCalls: spoonacularCalls,
    ...nutrition,
  };

  if (!opts?.skipDailyDedup && shortForApi) await setDailySpoonacularDedup(shortForApi, result, dedupMealType);
  return result;
}

// ─── Main enrichment function ───────────────────────────────────────────────

/**
 * Enrich a single meal – vždy volá Spoonacular, žádná cache.
 *
 * @param {string} mealName   Raw meal name from plan HTML.
 * @param {string|null} mealKey Optional canonical meal_key from data-meal-key (priority 1 for search).
 * @param {number|null} recipeId Nepoužívá se (zachováno pro kompatibilitu API).
 * @returns {Promise<{...}>}
 */
export async function enrichMeal(mealName, mealKey = null, recipeId = null) {
  const meta = await searchMealMetadata(mealName, mealKey);
  const { _bestCandidate, _recipe, ...metaPublic } = meta;
  return metaPublic;
}

export { shortenMealSearchQuery } from './mealQueryShorten';
