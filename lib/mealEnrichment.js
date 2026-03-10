/**
 * lib/mealEnrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Meal enrichment via Spoonacular (metadata + image) and Pexels (image fallback).
 *
 * TRUST MODEL:
 *   image_trust_level: "exact"        → Spoonacular match with confidence >= threshold
 *   image_trust_level: "illustrative" → Pexels fallback (never treated as exact truth)
 *   image_trust_level: "none"         → no image, low confidence or no match
 *
 * The system never silently shows a Pexels image as if it were an exact meal photo.
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
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
const API_TIMEOUT_MS = 5000;

/** Minimum Spoonacular confidence score to treat image as exact truth. */
const CONFIDENCE_THRESHOLD = 0.75;

/**
 * Cache TTL by trust level (in milliseconds).
 *
 * exact       → never expire: Spoonacular confirmed the image with high confidence.
 *               Stable truth — no need to re-query.
 * illustrative → 7 days: Pexels fallback. May improve if Spoonacular gains better
 *               coverage later. Short enough to self-heal over time.
 * none         → 3 days: No result found. Re-try after a few days in case the
 *               upstream API improves or query normalization changes.
 */
const CACHE_TTL_MS = {
  exact: null,          // Never expires
  illustrative: 7 * 24 * 60 * 60 * 1000,   // 7 days
  none: 3 * 24 * 60 * 60 * 1000,            // 3 days
};

const BAD_NON_FOOD_HINTS = [
  'beach', 'coast', 'coastline', 'cliff', 'mountain', 'landscape', 'nature',
  'travel', 'ocean', 'sea', 'island', 'sunset', 'skyline', 'waterfall',
];
const GOOD_FOOD_HINTS = [
  'food', 'meal', 'dish', 'plate', 'lunch', 'dinner', 'breakfast', 'recipe',
  'chicken', 'beef', 'salad', 'rice', 'vegetable', 'pasta', 'tofu', 'tempeh',
  'soup', 'stew', 'bowl', 'grilled', 'baked',
];

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
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'name_key' }
      );
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Spoonacular ────────────────────────────────────────────────────────────

async function callSpoonacular(query) {
  const hasDirectSpoonacular = Boolean(SPOONACULAR_KEY);
  const hasRapidApiSpoonacular = Boolean(RAPIDAPI_KEY);
  if (!hasDirectSpoonacular && !hasRapidApiSpoonacular) return null;

  let url = '';
  let headers = { Accept: 'application/json' };

  if (hasDirectSpoonacular) {
    url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&query=${encodeURIComponent(query)}&number=1&addRecipeInformation=true&addRecipeNutrition=true`;
  } else {
    const host = RAPIDAPI_SPOONACULAR_HOST.replace(/^https?:\/\//, '');
    url = `https://${host}/recipes/complexSearch?query=${encodeURIComponent(query)}&number=1&addRecipeInformation=true&addRecipeNutrition=true`;
    headers = {
      ...headers,
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': host,
    };
  }

  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0] ?? null;
  } catch {
    return null;
  }
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
 * Search Spoonacular for a meal; evaluate confidence; return enrichment with trust level.
 *
 * SCORING FIX:
 * When a search candidate is an English translation, Spoonacular may return the correct
 * recipe — but scoring it ONLY against the original Czech mealName produces a near-zero
 * overlap score (Czech words ≠ English recipe title). The result is incorrectly classified
 * as low-confidence and falls through to illustrative or none.
 *
 * Fix: score against BOTH the original mealName AND the search candidate used. Take the
 * maximum. This way a correct English match is not penalised for being searched in English.
 *
 *   final_score = max(scoreMealMatch(mealName, recipe), scoreMealMatch(candidate, recipe))
 *
 * The threshold (0.75) is unchanged — we just evaluate from the best angle.
 *
 * Returns internal field `_bestCandidate` (not stored in cache) so the Pexels fallback
 * can use the best English query if Spoonacular did not produce an exact match.
 */
export async function searchMealMetadata(mealName) {
  if (!mealName || typeof mealName !== 'string') return EMPTY_MEAL(mealName);

  const candidates = buildMealSearchCandidates(mealName);
  if (!candidates.length) return EMPTY_MEAL(mealName);

  let bestRecipe = null;
  let bestScore = 0;
  let bestCandidate = candidates[0];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const recipe = await callSpoonacular(candidate);
    if (!recipe) continue;

    // Score against both the original Czech name AND the candidate used for search.
    // Take the higher of the two — prevents penalising a correct English match.
    const scoreOriginal = scoreMealMatch(mealName, recipe);
    const scoreCandidate = scoreMealMatch(candidate, recipe);
    const score = Math.max(scoreOriginal, scoreCandidate);

    if (score > bestScore) {
      bestScore = score;
      bestRecipe = recipe;
      bestCandidate = candidate;
    }
    // Early exit: strong match found, no need to try weaker candidates
    if (bestScore >= CONFIDENCE_THRESHOLD) break;
  }

  if (!bestRecipe) return EMPTY_MEAL(mealName);

  const nutrition = extractNutrition(bestRecipe);
  const isExact = bestScore >= CONFIDENCE_THRESHOLD && Boolean(bestRecipe.image);

  return {
    name: bestRecipe.title || mealName,
    image_url: isExact ? (bestRecipe.image || null) : null,
    source: 'spoonacular',
    // Trust metadata
    image_trust_level: isExact ? 'exact' : 'none',
    exact_source: isExact ? 'spoonacular' : null,
    illustrative_source: null,
    confidence_score: bestScore,
    // Internal field: best candidate used — used by enrichMeal for Pexels fallback query.
    // NOT stored in cache (enrichMeal strips it before caching).
    _bestCandidate: bestCandidate,
    ...nutrition,
  };
}

// ─── Pexels ─────────────────────────────────────────────────────────────────

const PEXELS_EMPTY = { image_url: null, source: 'none', image_trust_level: 'none', illustrative_source: null };

/**
 * Pexels image search fallback with scoring.
 * ALWAYS sets image_trust_level = "illustrative". Never treated as exact meal truth.
 *
 * @param {string} mealName          Original meal name (Czech) — used for token scoring.
 * @param {string|null} bestQuery    Best search candidate from Spoonacular pipeline
 *                                   (often English). When provided, used as the primary
 *                                   Pexels query. Better relevance than raw Czech name.
 */
export async function searchMealImageFallback(mealName, bestQuery = null) {
  if (!mealName || typeof mealName !== 'string') return PEXELS_EMPTY;
  if (!PEXELS_KEY) return PEXELS_EMPTY;

  // Prefer the best English candidate for the Pexels query.
  // English keywords produce significantly more relevant Pexels results than Czech.
  const cleanMealName = normalizeMealQueryCs(mealName);
  const pexelsBase = (bestQuery && bestQuery.length >= 4 && bestQuery !== cleanMealName)
    ? bestQuery.slice(0, 50)
    : cleanMealName.slice(0, 45);

  const query = `${pexelsBase} food`;

  // Build scoring tokens from both the English query and the Czech name (union).
  // This way we reward photos that match either language.
  const enTokens = (bestQuery || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const csTokens = removeDiacritics(cleanMealName)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const allQueryTokens = [...new Set([...enTokens, ...csTokens])];

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: PEXELS_KEY, Accept: 'application/json' },
    });
    if (!res.ok) return PEXELS_EMPTY;
    const data = await res.json();
    const photos = Array.isArray(data?.photos) ? data.photos : [];

    const scorePhoto = (photo) => {
      const alt = String(photo?.alt || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      if (!alt) return -10;
      let score = 0;
      for (const bad of BAD_NON_FOOD_HINTS) if (alt.includes(bad)) score -= 8;
      for (const good of GOOD_FOOD_HINTS) if (alt.includes(good)) score += 4;
      for (const token of allQueryTokens) if (token.length > 2 && alt.includes(token)) score += 2;
      return score;
    };

    const ranked = photos
      .map((photo) => ({ photo, score: scorePhoto(photo) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score < 2) return PEXELS_EMPTY;

    const image_url = best.photo?.src?.large || best.photo?.src?.medium || best.photo?.src?.original || null;
    if (!image_url) return PEXELS_EMPTY;

    return {
      image_url,
      source: 'pexels',
      // Always mark Pexels as illustrative – never exact
      image_trust_level: 'illustrative',
      illustrative_source: 'pexels',
    };
  } catch {
    return PEXELS_EMPTY;
  }
}

// ─── Main enrichment function ───────────────────────────────────────────────

/**
 * Enrich a single meal with the full trust-aware pipeline:
 *   1. Check meal_metadata_cache
 *   2. Spoonacular → score → if confident: exact, else: metadata only
 *   3. Pexels → only if no exact image → illustrative
 *
 * @param {string} mealName  Raw meal name from plan HTML.
 * @returns {Promise<{
 *   name: string,
 *   image_url: string|null,
 *   source: string,
 *   image_trust_level: "exact"|"illustrative"|"none",
 *   exact_source: "spoonacular"|null,
 *   illustrative_source: "pexels"|null,
 *   confidence_score: number,
 *   calories: number|null,
 *   protein_g: number|null,
 *   carbs_g: number|null,
 *   fat_g: number|null
 * }>}
 */
export async function enrichMeal(mealName) {
  const cacheKey = makeCacheKey(mealName);

  // 1. Cache hit (trust-level-aware TTL)
  const cached = await getCachedMeal(cacheKey);
  if (cached && cached.name) {
    return {
      ...EMPTY_MEAL(mealName),
      ...cached,
    };
  }

  // 2. Spoonacular with dual-score confidence evaluation
  const meta = await searchMealMetadata(mealName);

  // Extract internal field before it reaches cache or public output
  const { _bestCandidate, ...metaPublic } = meta;

  // 3. Pexels only if Spoonacular did not produce a trusted exact image.
  // Pass the best search candidate (often English) for a more relevant Pexels query.
  let result = metaPublic;
  if (!metaPublic.image_url) {
    const fallback = await searchMealImageFallback(mealName, _bestCandidate || null);
    if (fallback.image_url) {
      result = {
        ...metaPublic,
        image_url: fallback.image_url,
        source: fallback.source,
        image_trust_level: fallback.image_trust_level, // illustrative
        illustrative_source: fallback.illustrative_source,
        exact_source: metaPublic.exact_source, // preserve
      };
    }
  }

  // 4. Cache the result for future lookups (consistency guarantee)
  // _bestCandidate is already stripped from result — it is internal only.
  await setCachedMeal(cacheKey, result);

  return result;
}
