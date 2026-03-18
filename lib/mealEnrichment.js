/**
 * lib/mealEnrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Meal enrichment via Spoonacular (metadata + image).
 *
 * TRUST MODEL:
 *   image_trust_level: "exact" → Spoonacular match with confidence >= threshold
 *   image_trust_level: "none"   → no image, low confidence or no match
 *
 * SHORTLIST EVALUATION:
 *   For each search candidate, Spoonacular returns up to 3 results (shortlist).
 *   All recipes in the shortlist are scored. The best across all candidates × all
 *   shortlist results is selected via chooseBestMealRecipe().
 *   This prevents the pipeline from being stuck on a weak first result when a
 *   better match is available in the same API response.
 *
 * Cache: meal_metadata_cache (Supabase) – key is normalized meal name.
 * Cache is used for consistency of trust evaluation, not just performance.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabaseServer } from './supabaseServer';
import { scoreMealMatch, normalizeMealQueryCs, buildMealSearchCandidates, removeDiacritics } from './mealNormalization';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_SPOONACULAR_HOST =
  process.env.RAPIDAPI_SPOONACULAR_HOST || 'spoonacular-recipe-food-nutrition-v1.p.rapidapi.com';
const API_TIMEOUT_MS = 5000;

/** Minimum Spoonacular confidence score to treat image as exact truth. */
const CONFIDENCE_THRESHOLD = 0.75;

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

// ─── Cache ─────────────────────────────────────────────────────────────────

/**
 * Return a cached meal entry — but ONLY if it is still fresh for its trust level.
 *
 * Cache freshness rules:
 *   exact        → always valid (Spoonacular confirmed, stable truth)
 *   illustrative → valid for 7 days (Pexels fallback, may improve over time)
 *   none         → valid for 3 days (re-try after a few days)
 *
 * This prevents a low-quality first result from being returned indefinitely.
 */
async function getCachedMeal(cacheKey) {
  if (!cacheKey) return null;
  try {
    const { data } = await supabaseServer
      .from('meal_metadata_cache')
      .select('name, image_url, source, image_trust_level, exact_source, illustrative_source, confidence_score, calories, protein_g, carbs_g, fat_g, updated_at')
      .eq('name_key', cacheKey)
      .maybeSingle();

    if (!data) return null;

    const trustLevel = data.image_trust_level || 'none';
    const ttlMs = CACHE_TTL_MS[trustLevel];

    // null TTL = never expire (exact)
    if (ttlMs !== null && ttlMs !== undefined) {
      const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      const ageMs = Date.now() - updatedAt;
      if (ageMs > ttlMs) {
        // Cache is stale for this trust level — let the resolver try again
        return null;
      }
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

/** Number of Spoonacular results to fetch per candidate query. */
const SPOONACULAR_SHORTLIST_SIZE = 3;

/**
 * Call Spoonacular and return a shortlist of up to SPOONACULAR_SHORTLIST_SIZE results.
 * Returns an empty array on failure or when no API key is configured.
 *
 * Returns array (not single recipe) so the caller can evaluate all candidates.
 */
async function callSpoonacular(query) {
  const hasDirectSpoonacular = Boolean(SPOONACULAR_KEY);
  const hasRapidApiSpoonacular = Boolean(RAPIDAPI_KEY);
  if (!hasDirectSpoonacular && !hasRapidApiSpoonacular) return [];

  let url = '';
  let headers = { Accept: 'application/json' };
  const n = SPOONACULAR_SHORTLIST_SIZE;

  if (hasDirectSpoonacular) {
    url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&query=${encodeURIComponent(query)}&number=${n}&addRecipeInformation=true&addRecipeNutrition=true`;
  } else {
    const host = RAPIDAPI_SPOONACULAR_HOST.replace(/^https?:\/\//, '');
    url = `https://${host}/recipes/complexSearch?query=${encodeURIComponent(query)}&number=${n}&addRecipeInformation=true&addRecipeNutrition=true`;
    headers = {
      ...headers,
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': host,
    };
  }

  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

/**
 * Score a single recipe against both the original meal name and the search candidate.
 * Returns a structured evaluation used by chooseBestMealRecipe().
 *
 * Internal use only — not exposed publicly.
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

/**
 * Choose the best recipe from a list of evaluated candidates.
 *
 * Priority order:
 *   1. Highest scoreFinal
 *   2. When scores are close (within CLOSE_DELTA): prefer recipe with image
 *   3. Then prefer recipe with nutrition data
 *   4. Then prefer shorter/more specific title (avoids overly generic matches)
 */
const CLOSE_SCORE_DELTA = 0.05;

function chooseBestMealRecipe(evaluations) {
  if (!evaluations.length) return null;

  const sorted = [...evaluations].sort((a, b) => {
    // Primary sort: highest score
    const scoreDiff = b.scoreFinal - a.scoreFinal;
    if (Math.abs(scoreDiff) > CLOSE_SCORE_DELTA) return scoreDiff;

    // Tie-break 1: prefer recipe with image
    if (a.hasImage !== b.hasImage) return a.hasImage ? -1 : 1;

    // Tie-break 2: prefer recipe with nutrition data
    if (a.hasNutrition !== b.hasNutrition) return a.hasNutrition ? -1 : 1;

    // Tie-break 3: prefer shorter (more specific) title
    const aLen = (a.recipe?.title || '').length;
    const bLen = (b.recipe?.title || '').length;
    return aLen - bLen;
  });

  return sorted[0] ?? null;
}

function extractNutrition(recipe) {
  let calories = null, protein_g = null, carbs_g = null, fat_g = null;
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
 * Search Spoonacular for a meal; evaluate a shortlist of results; return the best match.
 *
 * PRIORITY: When meal_key (canonical from HTML) is provided, it is used as the first
 * search candidate so exact lookup aligns with plan keys.
 *
 * SHORTLIST EVALUATION:
 * For each search candidate, callSpoonacular() returns up to 3 recipes. All recipes
 * across all candidates are scored and compared. chooseBestMealRecipe() selects the
 * winner using score + tie-break rules (image, nutrition, title specificity).
 *
 * DUAL-QUERY SCORING:
 * Each recipe is scored against BOTH the original Czech mealName AND the search candidate.
 * The maximum is taken, preventing penalisation of a correct English match.
 *
 * EARLY EXIT:
 * After processing all shortlist results for a candidate, if the best score so far
 * exceeds CONFIDENCE_THRESHOLD, remaining candidates are skipped (save API calls).
 *
 * Returns internal field `_bestCandidate` (not cached, not public) for Pexels fallback.
 */
export async function searchMealMetadata(mealName, mealKey = null) {
  if (!mealName || typeof mealName !== 'string') return EMPTY_MEAL(mealName);

  const baseCandidates = buildMealSearchCandidates(mealName);
  const keyNorm = mealKey && typeof mealKey === 'string' ? normalizeMealQueryCs(mealKey).trim().slice(0, 80) : '';
  const seen = new Set(keyNorm ? [keyNorm.toLowerCase().replace(/\s+/g, ' ')] : []);
  const candidates = keyNorm.length >= 3
    ? [keyNorm].concat(baseCandidates.filter((c) => {
        const n = (c || '').toLowerCase().trim();
        if (!n || seen.has(n)) return false;
        seen.add(n);
        return true;
      }))
    : baseCandidates;
  if (!candidates.length) return EMPTY_MEAL(mealName);

  /** @type {Array<ReturnType<evaluateRecipeAgainstQuery>>} */
  const allEvaluations = [];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const recipes = await callSpoonacular(candidate);
    for (const recipe of recipes) {
      if (!recipe || typeof recipe !== 'object') continue;
      allEvaluations.push(evaluateRecipeAgainstQuery(mealName, candidate, recipe));
    }

    // Early exit: at least one strong match found — skip remaining candidates
    const bestSoFar = allEvaluations.reduce((max, e) => Math.max(max, e.scoreFinal), 0);
    if (bestSoFar >= CONFIDENCE_THRESHOLD) break;
  }

  const best = chooseBestMealRecipe(allEvaluations);
  if (!best) return EMPTY_MEAL(mealName);

  const nutrition = extractNutrition(best.recipe);
  const isExact = best.scoreFinal >= CONFIDENCE_THRESHOLD && best.hasImage;
  const recipeId = best.recipe?.id != null ? Number(best.recipe.id) : null;

  return {
    name: best.recipe.title || mealName,
    image_url: isExact ? (best.recipe.image || null) : null,
    source: 'spoonacular',
    image_trust_level: isExact ? 'exact' : 'none',
    exact_source: isExact ? 'spoonacular' : null,
    illustrative_source: null,
    confidence_score: best.scoreFinal,
    recipe_id: isExact && recipeId ? recipeId : null,
    // Internal fields: used by enrichMeal, stripped before cache/public output.
    _bestCandidate: best.candidate,
    ...nutrition,
  };
}

// ─── Main enrichment function ───────────────────────────────────────────────

/**
 * Enrich a single meal with the trust-aware pipeline:
 *   1. Check meal_metadata_cache (key = meal_key or normalized mealName)
 *   2. Spoonacular → score → if confident: exact, else: metadata only
 *
 * @param {string} mealName   Raw meal name from plan HTML.
 * @param {string|null} mealKey Optional canonical meal_key from data-meal-key (priority 1 for cache and search).
 * @returns {Promise<{...}>}
 */
export async function enrichMeal(mealName, mealKey = null) {
  const cacheKey = makeCacheKey(mealKey || mealName);

  // 1. Cache hit (trust-level-aware TTL)
  const cached = await getCachedMeal(cacheKey);
  if (cached && cached.name) {
    return {
      ...EMPTY_MEAL(mealName),
      ...cached,
    };
  }

  // 2. Spoonacular with dual-score confidence evaluation (meal_key as first candidate when provided)
  const meta = await searchMealMetadata(mealName, mealKey);

  // Extract internal field before it reaches cache or public output
  const { _bestCandidate, ...metaPublic } = meta;

  // 3. Cache the result for future lookups (consistency guarantee)
  await setCachedMeal(cacheKey, metaPublic);

  return metaPublic;
}
