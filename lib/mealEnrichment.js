/**
 * Meal enrichment via Spoonacular (metadata + image) and Pexels (image fallback).
 * Safe fallbacks when API keys are missing or requests fail.
 */

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';

const EMPTY_MEAL = (name) => ({
  name: name || 'Unknown',
  image_url: null,
  source: 'none',
  calories: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
});

/**
 * Search Spoonacular for recipe/food; return best match with image and nutrition if available.
 * @param {string} mealName
 * @returns {Promise<{ name: string, image_url: string | null, source: string, calories: number | null, protein_g: number | null, carbs_g: number | null, fat_g: number | null }>}
 */
export async function searchMealMetadata(mealName) {
  if (!mealName || typeof mealName !== 'string') return EMPTY_MEAL(mealName);
  const query = mealName.trim().slice(0, 80);
  if (!query) return EMPTY_MEAL(mealName);

  if (!SPOONACULAR_KEY) return EMPTY_MEAL(mealName);

  try {
    const url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&query=${encodeURIComponent(query)}&number=1&addRecipeInformation=true`;
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return EMPTY_MEAL(mealName);
    const data = await res.json();
    const recipe = data?.results?.[0];
    if (!recipe) return EMPTY_MEAL(mealName);

    let calories = null;
    let protein_g = null;
    let carbs_g = null;
    let fat_g = null;
    if (recipe.nutrition?.nutrients) {
      for (const n of recipe.nutrition.nutrients) {
        if (n.name?.toLowerCase() === 'calories') calories = n.amount ?? null;
        if (n.name?.toLowerCase() === 'protein') protein_g = n.amount ?? null;
        if (n.name?.toLowerCase() === 'carbohydrates') carbs_g = n.amount ?? null;
        if (n.name?.toLowerCase() === 'fat') fat_g = n.amount ?? null;
      }
    }

    return {
      name: recipe.title || mealName,
      image_url: recipe.image || null,
      source: 'spoonacular',
      calories: calories != null ? Number(calories) : null,
      protein_g: protein_g != null ? Number(protein_g) : null,
      carbs_g: carbs_g != null ? Number(carbs_g) : null,
      fat_g: fat_g != null ? Number(fat_g) : null,
    };
  } catch (err) {
    return EMPTY_MEAL(mealName);
  }
}

/**
 * Pexels image search fallback when Spoonacular has no image.
 * @param {string} mealName
 * @returns {Promise<{ image_url: string | null, source: string }>}
 */
export async function searchMealImageFallback(mealName) {
  if (!mealName || typeof mealName !== 'string') return { image_url: null, source: 'none' };
  const query = mealName.trim().slice(0, 60);
  if (!query || !PEXELS_KEY) return { image_url: null, source: 'none' };

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
    const res = await fetch(url, {
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
 * Enrich a meal: Spoonacular first, then Pexels for image if missing.
 * @param {string} mealName
 * @returns {Promise<{ name: string, image_url: string | null, source: string, calories: number | null, protein_g: number | null, carbs_g: number | null, fat_g: number | null }>}
 */
export async function enrichMeal(mealName) {
  const meta = await searchMealMetadata(mealName);
  if (meta.image_url) return meta;
  const fallback = await searchMealImageFallback(mealName);
  return {
    ...meta,
    image_url: fallback.image_url ?? meta.image_url,
    source: fallback.image_url ? fallback.source : meta.source,
  };
}
