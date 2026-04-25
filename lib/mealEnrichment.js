/**
 * lib/mealEnrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Meal enrichment via Spoonacular (metadata + image).
 *
 * TRUST MODEL:
 *   recipe_id: z prvního výsledku prvního neprázdného complexSearch (results[0]), jinak z nejlepšího skóre.
 *   _recipe (plný recept / nákup): jen při scoreFinal >= threshold.
 *   image_url: z prvního hitu (results[0]), jinak z nejlepšího skóre — bez ohledu na confidence
 *     (exact vs illustrative dle threshold).
 *   image_trust_level: "exact" → threshold splněn a image k dispozici; "illustrative" → image bez splnění threshold.
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
import { lookupStaticSpoonacularRecipeId } from './mealStaticRecipeIds';
import { translateAisle } from './spoonacularShopping';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const API_TIMEOUT_MS = 5000;

/**
 * Minimální skóre shody receptu (0–1). Sjednoceno s planOrchestrator / replace-meal.
 * Historicky 0.75 odmítalo i ~0.72; default 0.1 (env MEAL_CONFIDENCE_THRESHOLD 0–1 přebije).
 */
function readConfidenceThreshold() {
  const e = Number(process.env.MEAL_CONFIDENCE_THRESHOLD);
  if (Number.isFinite(e) && e > 0 && e <= 1) return e;
  return 0.1;
}

export const MEAL_CONFIDENCE_THRESHOLD = readConfidenceThreshold();
const CONFIDENCE_THRESHOLD = MEAL_CONFIDENCE_THRESHOLD;

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

// ─── Spoonacular ────────────────────────────────────────────────────────────

/** Default shortlist size (overriden per opts / fastMode); odpovídá complexSearch `number`. */
const SPOONACULAR_SHORTLIST_SIZE = 3;

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
      magnesium_mg: null,
      zinc_mg: null,
      vitamin_b12_ug: null,
      vitamin_a_iu: null,
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
    magnesium_mg: getN('Magnesium'),
    zinc_mg: getN('Zinc'),
    vitamin_b12_ug: getNAny(['Vitamin B12', 'Vitamin B-12']),
    vitamin_a_iu: getNAny(['Vitamin A', 'Vitamin A IU']),
    health_score: recipe.healthScore ?? null,
    price_per_serving: recipe.pricePerServing ?? null,
    diets: Array.isArray(recipe.diets) ? recipe.diets : [],
    dish_types: Array.isArray(recipe.dishTypes) ? recipe.dishTypes : [],
    ingredients: (recipe.extendedIngredients || []).map((i) => ({
      id: i.id,
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      aisle: i.aisle ? translateAisle(String(i.aisle).trim()) : null,
    })),
  };
}

/**
 * Obrázek z complexSearch / information — někdy chybí string v `image`, ale jde složit z `id`.
 * @param {object|null|undefined} recipe
 * @returns {string|null}
 */
export function resolveSpoonacularRecipeImageUrl(recipe) {
  if (!recipe || typeof recipe !== 'object') return null;
  const raw = recipe.image;
  if (typeof raw === 'string' && raw.trim()) {
    const t = raw.trim();
    if (/^https?:\/\//i.test(t)) return t;
    if (t.startsWith('//')) return `https:${t}`;
    if (t.startsWith('/')) return `https://spoonacular.com${t}`;
  }
  const id = recipe.id != null ? Number(recipe.id) : NaN;
  if (Number.isFinite(id)) {
    return `https://img.spoonacular.com/recipes/${id}-312x231.jpg`;
  }
  return null;
}

/** Klíč pro sdílenou cache výsledků complexSearch v rámci jednoho plánu (planOrchestrator). */
function spoonacularCandidateCacheKey(query, base) {
  return JSON.stringify({
    q: String(query || '').trim().toLowerCase(),
    n: base.number,
    off: base.offset ?? 0,
    mt: base.mealType,
    diet: base.diet,
    cal: base.caloriesPerDay,
    mpd: base.mealsPerDay,
    int: (base.intolerances || []).join(','),
    ex: (base.excludeIngredients || []).join(','),
    mrt: base.maxReadyTime,
    instr: base.instructionsRequired,
    minC: base.minCalories,
    maxC: base.maxCalories,
    minP: base.minProtein,
  });
}

/**
 * Call Spoonacular complexSearch; vrátí shortlist receptů.
 * ctx.candidateCache (Map) — sdílené výsledky pro stejný query+parametry v rámci jednoho plánu.
 * ctx.httpStats — { count } inkrement jen při reálném HTTP (ne cache hit).
 * @param {string} query
 * @param {number} timeoutMs
 * @param {object|null} ctx – spoonacularContext (mealType, diet, kalorie, intolerance, …)
 */
/** complexSearch vrací { results: Recipe[] }; někdy proxy/wrapper vnoří pole jinak. */
function normalizeComplexSearchResults(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.data?.results)) return data.data.results;
  if (data.results && typeof data.results === 'object' && Array.isArray(data.results.results)) {
    return data.results.results;
  }
  return [];
}

async function callSpoonacular(query, timeoutMs = API_TIMEOUT_MS, ctx = null) {
  if (!SPOONACULAR_KEY) return [];

  const n = ctx?.number ?? SPOONACULAR_SHORTLIST_SIZE;
  const base = {
    query,
    number: n,
    offset: ctx?.offset ?? 0,
    mealType: ctx?.mealType ?? 'lunch',
    diet: ctx?.diet ?? 'standard',
    caloriesPerDay: ctx?.caloriesPerDay ?? 2000,
    mealsPerDay: ctx?.mealsPerDay ?? 3,
    intolerances: ctx?.intolerances ?? [],
    excludeIngredients: ctx?.excludeIngredients ?? [],
    maxReadyTime: ctx?.maxReadyTime ?? 60,
    instructionsRequired: ctx?.instructionsRequired,
    minCalories: ctx?.minCalories,
    maxCalories: ctx?.maxCalories,
    minProtein: ctx?.minProtein,
  };

  const candidateCache = ctx?.candidateCache;
  const ckey = spoonacularCandidateCacheKey(query, base);
  if (candidateCache instanceof Map && candidateCache.has(ckey)) {
    return candidateCache.get(ckey);
  }

  /** Parametry přes buildComplexSearchQueryString — vždy addRecipeInformation=true + number (viz spoonacularComplexSearch). */
  const qs = buildComplexSearchQueryString(base, SPOONACULAR_KEY);
  const url = `https://api.spoonacular.com/recipes/complexSearch?${qs}`;

  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } }, timeoutMs);
    if (ctx?.httpStats && typeof ctx.httpStats === 'object') {
      ctx.httpStats.count = (ctx.httpStats.count || 0) + 1;
    }
    if (!res.ok) {
      const empty = [];
      if (candidateCache instanceof Map) candidateCache.set(ckey, empty);
      return empty;
    }
    const data = await res.json();
    const results = normalizeComplexSearchResults(data);
    const r0 = Array.isArray(results) && results[0] && typeof results[0] === 'object' ? results[0] : null;
    console.log('[IMG-DEBUG]', String(query || '').slice(0, 80), {
      n: results?.length ?? 0,
      offset: base.offset ?? 0,
      'recipes[0].id': r0?.id ?? null,
      'recipes[0].image': r0?.image ?? null,
    });
    if (candidateCache instanceof Map) candidateCache.set(ckey, results);
    return results;
  } catch {
    const empty = [];
    if (candidateCache instanceof Map) candidateCache.set(ckey, empty);
    return empty;
  }
}

/** Zkrácený EN dotaz z prvního kandidáta / shortlistu — klíč pro záchranné mapy. */
function mealRescueLookupKey(candidates, shortForApi, normalizedMeal) {
  return String(candidates[0] || shortForApi || normalizedMeal || '')
    .trim()
    .toLowerCase();
}

const MEAL_RESCUE_ALT_QUERY = {
  'oatmeal banana': 'oatmeal',
  'baked salmon': 'salmon',
  'chicken salad': 'grilled chicken',
  'tuna salad': 'tuna',
  'grilled chicken': 'chicken rice',
};

/**
 * Záchrana bez zbytečných HTTP: nejdřív sdílená statická mapa, až pak alternativní complexSearch.
 * @returns {{ id: number, leadRecipe: object|null }|null}
 */
async function rescueRecipeIdFromAltOrStatic(
  candidates,
  shortForApi,
  normalizedMeal,
  sc,
  shortlistN,
  timeoutMs,
  httpStats,
  nameCsHint
) {
  const query = mealRescueLookupKey(candidates, shortForApi, normalizedMeal);
  if (!query) return null;

  const staticId = lookupStaticSpoonacularRecipeId(query, nameCsHint);
  if (staticId != null) {
    return { id: staticId, leadRecipe: null };
  }

  const callCtx = sc
    ? { ...sc, number: Math.max(shortlistN, 5), candidateCache: null, httpStats }
    : {
        number: Math.max(shortlistN, 5),
        mealType: 'lunch',
        diet: 'standard',
        caloriesPerDay: 2000,
        mealsPerDay: 3,
        candidateCache: null,
        httpStats,
      };

  const tryQueries = [];
  const mapped = MEAL_RESCUE_ALT_QUERY[query] || MEAL_RESCUE_ALT_QUERY[query.split(/\s+/)[0]];
  if (mapped) tryQueries.push(mapped);
  const firstWord = query.split(/\s+/)[0];
  if (firstWord && firstWord !== query && !tryQueries.includes(firstWord)) tryQueries.push(firstWord);

  for (const q of tryQueries) {
    const rows = await callSpoonacular(q, timeoutMs, callCtx);
    const r0 = Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' ? rows[0] : null;
    if (r0?.id != null && Number.isFinite(Number(r0.id))) {
      return { id: Number(r0.id), leadRecipe: r0 };
    }
  }
  return null;
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
    hasImage: Boolean(resolveSpoonacularRecipeImageUrl(recipe)),
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

/**
 * Stejné řazení jako chooseBestMealRecipe, ale přeskočí recipe.id v excludeRecipeIds (dedup v rámci plánu).
 * @param {Array<{ recipe: object, scoreFinal: number, hasImage: boolean, hasNutrition: boolean }>} evaluations
 * @param {Set<number>|number[]|null|undefined} excludeRecipeIds
 */
function pickBestMealRecipeAvoiding(evaluations, excludeRecipeIds) {
  if (!evaluations?.length) return null;
  const exclude = new Set(
    excludeRecipeIds instanceof Set
      ? excludeRecipeIds
      : Array.isArray(excludeRecipeIds)
        ? excludeRecipeIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : []
  );
  const sorted = [...evaluations].sort((a, b) => {
    const scoreDiff = b.scoreFinal - a.scoreFinal;
    if (Math.abs(scoreDiff) > CLOSE_SCORE_DELTA) return scoreDiff;
    if (a.hasImage !== b.hasImage) return a.hasImage ? -1 : 1;
    if (a.hasNutrition !== b.hasNutrition) return a.hasNutrition ? -1 : 1;
    const aLen = (a.recipe?.title || '').length;
    const bLen = (b.recipe?.title || '').length;
    return aLen - bLen;
  });
  for (const ev of sorted) {
    const id = ev.recipe?.id != null ? Number(ev.recipe.id) : NaN;
    if (Number.isFinite(id) && exclude.has(id)) continue;
    return ev;
  }
  return null;
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

/** complexSearch+addRecipeNutrition někdy vrátí záznam bez plných nutrientů / surovin – doplníme přes Recipe Information. */
function recipeNeedsSpoonacularInformation(recipe) {
  if (!recipe || recipe.id == null) return false;
  const nutrients = recipe?.nutrition?.nutrients;
  const hasNutrients = Array.isArray(nutrients) && nutrients.length > 0;
  const ing = recipe?.extendedIngredients;
  const hasIngredients = Array.isArray(ing) && ing.length > 0;
  return !hasNutrients || !hasIngredients;
}

/**
 * GET /recipes/{id}/information – plný recept včetně extendedIngredients a nutrition (shoda s modalem / nákupním seznamem).
 * @param {number} recipeId
 * @param {number} timeoutMs
 * @param {{ count?: number }|null} httpStats
 */
async function fetchSpoonacularRecipeInformation(recipeId, timeoutMs, httpStats) {
  if (!SPOONACULAR_KEY || recipeId == null || !Number.isFinite(Number(recipeId))) return null;
  const id = Number(recipeId);
  const url = `https://api.spoonacular.com/recipes/${id}/information?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&includeNutrition=true`;
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } }, timeoutMs);
    if (httpStats && typeof httpStats === 'object') httpStats.count = (httpStats.count || 0) + 1;
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' && data.id != null ? data : null;
  } catch {
    return null;
  }
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
 *   skipDailyDedup?: boolean,
 *   candidateCache?: Map<string, object[]>
 *   excludeRecipeIds?: Set<number>|number[] — vyloučit tyto Spoonacular recipe id (jiný výsledek ze shortlistu)
 *   nameCs?: string — český název z plánu (statický fallback podle name_cs)
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
    const dedupRid = dedup?.recipe_id != null ? Number(dedup.recipe_id) : NaN;
    if (dedup && Number.isFinite(dedupRid)) {
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

  const httpStats = { count: 0 };
  const candidateCache = opts?.candidateCache;

  /** @type {Array<ReturnType<evaluateRecipeAgainstQuery>>} */
  const allEvaluations = [];

  /** První položka z prvního neprázdného complexSearch — pro image_url i při nízkém skóre „best“. */
  let firstComplexSearchLeadRecipe = null;

  const timeoutMs = opts?.timeoutMs ?? API_TIMEOUT_MS;
  for (const candidate of candidates) {
    if (!candidate) continue;

    const callCtx = sc
      ? { ...sc, number: shortlistN, candidateCache, httpStats }
      : {
          number: shortlistN,
          mealType: 'lunch',
          diet: 'standard',
          caloriesPerDay: 2000,
          mealsPerDay: 3,
          candidateCache,
          httpStats,
        };
    const recipes = await callSpoonacular(candidate, timeoutMs, callCtx);
    if (
      firstComplexSearchLeadRecipe == null &&
      Array.isArray(recipes) &&
      recipes.length > 0 &&
      recipes[0] &&
      typeof recipes[0] === 'object'
    ) {
      firstComplexSearchLeadRecipe = recipes[0];
    }
    for (const recipe of recipes) {
      if (!recipe || typeof recipe !== 'object') continue;
      allEvaluations.push(evaluateRecipeAgainstQuery(mealName, candidate, recipe));
    }

    const bestSoFar = allEvaluations.reduce((max, e) => Math.max(max, e.scoreFinal), 0);
    if (bestSoFar >= CONFIDENCE_THRESHOLD) break;
  }

  const excludeIds = opts?.excludeRecipeIds;
  const excludeActive = Boolean(
    excludeIds && (excludeIds instanceof Set ? excludeIds.size : excludeIds?.length)
  );
  let best = excludeActive
    ? pickBestMealRecipeAvoiding(allEvaluations, excludeIds)
    : chooseBestMealRecipe(allEvaluations);

  /** Všechny shortlist položky už v plánu — další stránky complexSearch (offset), jen primární dotaz. */
  if (excludeActive && !best && candidates.length) {
    const primary = candidates[0];
    for (let page = 1; page <= 4; page++) {
      const off = page * shortlistN;
      const callCtx = sc
        ? { ...sc, number: shortlistN, candidateCache, httpStats, offset: off }
        : {
            number: shortlistN,
            mealType: 'lunch',
            diet: 'standard',
            caloriesPerDay: 2000,
            mealsPerDay: 3,
            candidateCache,
            httpStats,
            offset: off,
          };
      const recipes = await callSpoonacular(primary, timeoutMs, callCtx);
      if (!Array.isArray(recipes) || !recipes.length) break;
      if (
        firstComplexSearchLeadRecipe == null &&
        recipes[0] &&
        typeof recipes[0] === 'object'
      ) {
        firstComplexSearchLeadRecipe = recipes[0];
      }
      for (const recipe of recipes) {
        if (!recipe || typeof recipe !== 'object') continue;
        allEvaluations.push(evaluateRecipeAgainstQuery(mealName, primary, recipe));
      }
      best = pickBestMealRecipeAvoiding(allEvaluations, excludeIds);
      if (best) break;
    }
  }

  if (!best && allEvaluations.length) {
    best = chooseBestMealRecipe(allEvaluations);
  }

  if (!best) {
    const rescued = await rescueRecipeIdFromAltOrStatic(
      candidates,
      shortForApi,
      normalizedMeal,
      sc,
      shortlistN,
      timeoutMs,
      httpStats,
      opts?.nameCs
    );
    if (rescued?.id) {
      const image_url =
        (rescued.leadRecipe && resolveSpoonacularRecipeImageUrl(rescued.leadRecipe)) ||
        `https://img.spoonacular.com/recipes/${rescued.id}-312x231.jpg`;
      const synthetic = {
        ...EMPTY_MEAL(mealName),
        name: mealName,
        source: 'spoonacular',
        image_trust_level: 'illustrative',
        illustrative_source: 'spoonacular',
        exact_source: null,
        confidence_score: 0.05,
        recipe_id: rescued.id,
        image_url,
        _recipe: null,
        _spoonacularCalls: httpStats.count,
      };
      if (!opts?.skipDailyDedup && shortForApi) await setDailySpoonacularDedup(shortForApi, synthetic, dedupMealType);
      return synthetic;
    }
    const empty = EMPTY_MEAL(mealName);
    if (!opts?.skipDailyDedup && shortForApi) await setDailySpoonacularDedup(shortForApi, empty, dedupMealType);
    return empty;
  }

  const scoreAccepted = best.scoreFinal >= CONFIDENCE_THRESHOLD;
  const recipeId = best.recipe?.id != null ? Number(best.recipe.id) : null;

  let outputRecipe = best.recipe;
  if (recipeId && scoreAccepted && recipeNeedsSpoonacularInformation(best.recipe)) {
    const full = await fetchSpoonacularRecipeInformation(recipeId, timeoutMs, httpStats);
    if (full) outputRecipe = full;
  }
  if (recipeId && !outputRecipe?.image) {
    const full = await fetchSpoonacularRecipeInformation(recipeId, timeoutMs, httpStats);
    if (full) outputRecipe = full;
  }

  const nutrition = extractNutrition(outputRecipe);
  /** První hit z prvního neprázdného complexSearch — obrázek + recipe_id nezávisle na confidence. */
  const hit = firstComplexSearchLeadRecipe;
  const leadImageUrl = hit && typeof hit === 'object' ? resolveSpoonacularRecipeImageUrl(hit) : null;
  const bestImageUrl = resolveSpoonacularRecipeImageUrl(outputRecipe);
  const resolvedImageUrl = leadImageUrl || bestImageUrl;

  const leadRecipeId = hit?.id != null ? Number(hit.id) : NaN;
  const recipeIdForMeta =
    Number.isFinite(leadRecipeId) ? leadRecipeId : recipeId != null && Number.isFinite(recipeId) ? recipeId : null;

  let imageUrlFinal = resolvedImageUrl;
  if (!imageUrlFinal && recipeIdForMeta != null && Number.isFinite(recipeIdForMeta)) {
    imageUrlFinal = resolveSpoonacularRecipeImageUrl({ id: recipeIdForMeta });
  }
  const hasImage = Boolean(imageUrlFinal);
  const imageTrust = hasImage ? (scoreAccepted ? 'exact' : 'illustrative') : 'none';

  // `name` = interní label pro shodu (ne UI); display_name_cs z AI. recipe_id z prvního hitu (dedup / náhled), ověření receptu dle skóre.
  const result = {
    name: outputRecipe.title || mealName,
    image_url: imageUrlFinal,
    source: 'spoonacular',
    image_trust_level: imageTrust,
    exact_source: scoreAccepted && hasImage ? 'spoonacular' : null,
    illustrative_source: hasImage && !scoreAccepted ? 'spoonacular' : null,
    confidence_score: best.scoreFinal,
    recipe_id: recipeIdForMeta,
    _bestCandidate: best.candidate,
    _recipe: scoreAccepted && outputRecipe ? outputRecipe : null,
    _spoonacularCalls: httpStats.count,
    ...nutrition,
  };

  // FAILSAFE: image z recipe_id / prvního hitu (komplexní search někdy vrátí image jen v poli nebo ho UI ztratí dříve v pipeline).
  if (!result.image_url && result.recipe_id) {
    result.image_url = `https://img.spoonacular.com/recipes/${result.recipe_id}-312x231.jpg`;
  }
  const fallbackRecipe = firstComplexSearchLeadRecipe || best?.recipe;
  if (!result.image_url && fallbackRecipe && typeof fallbackRecipe === 'object') {
    const r = fallbackRecipe;
    const fromImg =
      typeof r.image === 'string' && r.image.trim() ? resolveSpoonacularRecipeImageUrl(r) : null;
    const fromId =
      r.id != null && Number.isFinite(Number(r.id))
        ? `https://img.spoonacular.com/recipes/${Number(r.id)}-312x231.jpg`
        : null;
    result.image_url = fromImg || fromId || result.image_url;
    if (!result.recipe_id && r.id != null && Number.isFinite(Number(r.id))) result.recipe_id = Number(r.id);
  }
  if (result.image_url && result.image_trust_level === 'none') {
    result.image_trust_level = scoreAccepted ? 'exact' : 'illustrative';
    result.exact_source = scoreAccepted ? 'spoonacular' : null;
    result.illustrative_source = scoreAccepted ? null : 'spoonacular';
  }

  if (!result.recipe_id) {
    const rescued = await rescueRecipeIdFromAltOrStatic(
      candidates,
      shortForApi,
      normalizedMeal,
      sc,
      shortlistN,
      timeoutMs,
      httpStats,
      opts?.nameCs
    );
    if (rescued?.id) {
      result.recipe_id = rescued.id;
      if (!result.image_url) {
        result.image_url =
          (rescued.leadRecipe && resolveSpoonacularRecipeImageUrl(rescued.leadRecipe)) ||
          `https://img.spoonacular.com/recipes/${rescued.id}-312x231.jpg`;
      }
      if (result.image_trust_level === 'none') {
        result.image_trust_level = 'illustrative';
        result.illustrative_source = 'spoonacular';
        result.exact_source = null;
      }
    }
  }

  console.log(
    '[MEAL-RESULT]',
    result.name_cs || result.query || mealName,
    '→ recipe_id:',
    result.recipe_id,
    'image_url:',
    result.image_url,
    'leadImg:',
    leadImageUrl,
    'bestImg:',
    bestImageUrl
  );

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

export { shortenMealSearchQuery, shortenSpoonacularQuery } from './mealQueryShorten';
