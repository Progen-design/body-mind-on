/**
 * Meal enrichment via Spoonacular (metadata + image) and Pexels (image fallback).
 * Uses meal_metadata_cache to reduce API calls and as fallback on timeout. Safe without API keys.
 */
import { supabaseServer } from './supabaseServer';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
const API_TIMEOUT_MS = 5000;

const EMPTY_MEAL = (name) => ({
  name: name || 'Unknown',
  image_url: null,
  source: 'none',
  calories: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
});

/** fetch with timeout; on timeout throws so caller can fallback to cache. */
function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Search Spoonacular for recipe/food; return best match. Uses cache first; saves to cache after. 5s timeout → fallback to cache or empty.
 */
export async function searchMealMetadata(mealName) {
  if (!mealName || typeof mealName !== 'string') return EMPTY_MEAL(mealName);
  const query = mealName.trim().slice(0, 80);
  if (!query) return EMPTY_MEAL(mealName);

  const cacheKey = query;

  try {
    const { data: cached } = await supabaseServer
      .from('meal_metadata_cache')
      .select('meal_name, image_url, calories, protein_g, carbs_g, fat_g, source')
      .eq('meal_name', cacheKey)
      .maybeSingle();
    if (cached) {
      return {
        name: cached.meal_name || mealName,
        image_url: cached.image_url ?? null,
        source: cached.source || 'cache',
        calories: cached.calories != null ? Number(cached.calories) : null,
        protein_g: cached.protein_g != null ? Number(cached.protein_g) : null,
        carbs_g: cached.carbs_g != null ? Number(cached.carbs_g) : null,
        fat_g: cached.fat_g != null ? Number(cached.fat_g) : null,
      };
    }
  } catch (_) {}

  if (!SPOONACULAR_KEY) return EMPTY_MEAL(mealName);

  try {
    const url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&query=${encodeURIComponent(query)}&number=1&addRecipeInformation=true`;
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return EMPTY_MEAL(mealName);
    const data = await res.json();
    const recipe = data?.results?.[0];
    if (!recipe) return EMPTY_MEAL(mealName);

    let calories = null, protein_g = null, carbs_g = null, fat_g = null;
    if (recipe.nutrition?.nutrients) {
      for (const n of recipe.nutrition.nutrients) {
        if (n.name?.toLowerCase() === 'calories') calories = n.amount ?? null;
        if (n.name?.toLowerCase() === 'protein') protein_g = n.amount ?? null;
        if (n.name?.toLowerCase() === 'carbohydrates') carbs_g = n.amount ?? null;
        if (n.name?.toLowerCase() === 'fat') fat_g = n.amount ?? null;
      }
    }
    const image_url = recipe.image || null;
    const result = {
      name: recipe.title || mealName,
      image_url,
      source: 'spoonacular',
      calories: calories != null ? Number(calories) : null,
      protein_g: protein_g != null ? Number(protein_g) : null,
      carbs_g: carbs_g != null ? Number(carbs_g) : null,
      fat_g: fat_g != null ? Number(fat_g) : null,
    };
    try {
      await supabaseServer.from('meal_metadata_cache').upsert(
        { meal_name: cacheKey, image_url: result.image_url, calories: result.calories, protein_g: result.protein_g, carbs_g: result.carbs_g, fat_g: result.fat_g, source: result.source },
        { onConflict: 'meal_name' }
      );
    } catch (_) {}
    return result;
  } catch (err) {
    try {
      const { data: cached } = await supabaseServer.from('meal_metadata_cache').select('meal_name, image_url, calories, protein_g, carbs_g, fat_g, source').eq('meal_name', cacheKey).maybeSingle();
      if (cached) {
        return {
          name: cached.meal_name || mealName,
          image_url: cached.image_url ?? null,
          source: cached.source || 'cache',
          calories: cached.calories != null ? Number(cached.calories) : null,
          protein_g: cached.protein_g != null ? Number(cached.protein_g) : null,
          carbs_g: cached.carbs_g != null ? Number(cached.carbs_g) : null,
          fat_g: cached.fat_g != null ? Number(cached.fat_g) : null,
        };
      }
    } catch (_) {}
    return EMPTY_MEAL(mealName);
  }
}

/**
 * Pexels image search fallback; query uses "${mealName} food". 5s timeout.
 */
export async function searchMealImageFallback(mealName) {
  if (!mealName || typeof mealName !== 'string') return { image_url: null, source: 'none' };
  const query = `${mealName.trim().slice(0, 50)} food`;
  if (!PEXELS_KEY) return { image_url: null, source: 'none' };

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: PEXELS_KEY, Accept: 'application/json' },
    });
    if (!res.ok) return { image_url: null, source: 'none' };
    const data = await res.json();
    const photo = data?.photos?.[0];
    const image_url = photo?.src?.medium || photo?.src?.original || null;
    return { image_url, source: image_url ? 'pexels' : 'none' };
  } catch (err) {
    return { image_url: null, source: 'none' };
  }
}

/**
 * Enrich a meal: cache → Spoonacular → Pexels if no image. Timeout falls back to cache or empty.
 */
export async function enrichMeal(mealName) {
  const meta = await searchMealMetadata(mealName);
  if (meta.image_url) return meta;
  const fallback = await searchMealImageFallback(mealName);
  const result = {
    ...meta,
    image_url: fallback.image_url ?? meta.image_url,
    source: fallback.image_url ? fallback.source : meta.source,
  };
  if (result.image_url && result.source === 'pexels') {
    try {
      const cacheKey = (mealName || '').trim().slice(0, 80);
      await supabaseServer.from('meal_metadata_cache').upsert(
        { meal_name: cacheKey, image_url: result.image_url, calories: result.calories, protein_g: result.protein_g, carbs_g: result.carbs_g, fat_g: result.fat_g, source: result.source },
        { onConflict: 'meal_name' }
      );
    } catch (_) {}
  }
  return result;
}
