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
import { scoreMealMatch, normalizeMealQueryCs, buildMealSearchHints, removeDiacritics } from './mealNormalization';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_SPOONACULAR_HOST =
  process.env.RAPIDAPI_SPOONACULAR_HOST || 'spoonacular-recipe-food-nutrition-v1.p.rapidapi.com';
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
const API_TIMEOUT_MS = 5000;

/** Minimum Spoonacular confidence score to treat image as exact truth. */
const CONFIDENCE_THRESHOLD = 0.75;

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

async function getCachedMeal(cacheKey) {
  if (!cacheKey) return null;
  try {
    const { data } = await supabaseServer
      .from('meal_metadata_cache')
      .select('name, image_url, source, image_trust_level, exact_source, illustrative_source, confidence_score, calories, protein_g, carbs_g, fat_g')
      .eq('name_key', cacheKey)
      .maybeSingle();
    return data ?? null;
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
 * Uses buildMealSearchHints for fallback query chain if primary returns low confidence.
 */
export async function searchMealMetadata(mealName) {
  if (!mealName || typeof mealName !== 'string') return EMPTY_MEAL(mealName);

  const hints = buildMealSearchHints(mealName);
  if (!hints.length) return EMPTY_MEAL(mealName);

  let bestRecipe = null;
  let bestScore = 0;

  for (const hint of hints) {
    if (!hint) continue;
    const recipe = await callSpoonacular(hint);
    if (!recipe) continue;
    const score = scoreMealMatch(mealName, recipe);
    if (score > bestScore) {
      bestScore = score;
      bestRecipe = recipe;
    }
    // If we found a very good match, no need to try weaker hints
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
    ...nutrition,
  };
}

// ─── Pexels ─────────────────────────────────────────────────────────────────

/**
 * Pexels image search fallback with scoring.
 * ALWAYS sets image_trust_level = "illustrative".
 * Pexels images are NEVER treated as exact meal truth.
 */
export async function searchMealImageFallback(mealName) {
  if (!mealName || typeof mealName !== 'string') return { image_url: null, source: 'none', image_trust_level: 'none', illustrative_source: null };
  if (!PEXELS_KEY) return { image_url: null, source: 'none', image_trust_level: 'none', illustrative_source: null };

  const cleanMealName = normalizeMealQueryCs(mealName);
  const query = `${cleanMealName.slice(0, 45)} plated food meal`;

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: PEXELS_KEY, Accept: 'application/json' },
    });
    if (!res.ok) return { image_url: null, source: 'none', image_trust_level: 'none', illustrative_source: null };
    const data = await res.json();
    const photos = Array.isArray(data?.photos) ? data.photos : [];

    const queryTokens = removeDiacritics(cleanMealName)
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const scorePhoto = (photo) => {
      const alt = String(photo?.alt || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      if (!alt) return -10;
      let score = 0;
      for (const bad of BAD_NON_FOOD_HINTS) if (alt.includes(bad)) score -= 8;
      for (const good of GOOD_FOOD_HINTS) if (alt.includes(good)) score += 4;
      for (const token of queryTokens) if (token.length > 2 && alt.includes(token)) score += 2;
      return score;
    };

    const ranked = photos
      .map((photo) => ({ photo, score: scorePhoto(photo) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score < 2) return { image_url: null, source: 'none', image_trust_level: 'none', illustrative_source: null };

    const image_url = best.photo?.src?.large || best.photo?.src?.medium || best.photo?.src?.original || null;
    if (!image_url) return { image_url: null, source: 'none', image_trust_level: 'none', illustrative_source: null };

    return {
      image_url,
      source: 'pexels',
      // Always mark Pexels as illustrative – never exact
      image_trust_level: 'illustrative',
      illustrative_source: 'pexels',
    };
  } catch {
    return { image_url: null, source: 'none', image_trust_level: 'none', illustrative_source: null };
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

  // 1. Cache hit
  const cached = await getCachedMeal(cacheKey);
  if (cached && cached.name) {
    return {
      ...EMPTY_MEAL(mealName),
      ...cached,
    };
  }

  // 2. Spoonacular with confidence scoring
  const meta = await searchMealMetadata(mealName);

  // 3. Pexels only if Spoonacular did not produce a trusted exact image
  let result = meta;
  if (!meta.image_url) {
    const fallback = await searchMealImageFallback(mealName);
    if (fallback.image_url) {
      result = {
        ...meta,
        image_url: fallback.image_url,
        source: fallback.source,
        image_trust_level: fallback.image_trust_level, // illustrative
        illustrative_source: fallback.illustrative_source,
        exact_source: meta.exact_source, // preserve
      };
    }
  }

  // 4. Cache the result for future lookups (consistency guarantee)
  await setCachedMeal(cacheKey, result);

  return result;
}
