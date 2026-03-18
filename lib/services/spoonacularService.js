/**
 * lib/services/spoonacularService.js
 * Spoonacular API – vyhledávání receptů podle dotazu.
 * Pro onboarding flow: OpenAI vrací search_query, backend dohledá reálný recept.
 */
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_SPOONACULAR_HOST =
  process.env.RAPIDAPI_SPOONACULAR_HOST || 'spoonacular-recipe-food-nutrition-v1.p.rapidapi.com';
const API_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
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
 * Vyhledá recept podle dotazu (EN).
 * @param {string} query - např. "oatmeal banana eggs", "chicken breast rice"
 * @param {{ diet?: string, excludeIngredients?: string, number?: number }} [opts]
 * @returns {Promise<{
 *   id: number,
 *   title: string,
 *   image: string,
 *   sourceUrl: string,
 *   readyInMinutes: number,
 *   calories: number | null,
 *   protein_g: number | null,
 *   carbs_g: number | null,
 *   fat_g: number | null,
 *   source: 'spoonacular'
 * } | null>}
 */
export async function searchRecipe(query, opts = {}) {
  if (!query || typeof query !== 'string') return null;
  const hasDirect = Boolean(SPOONACULAR_KEY);
  const hasRapid = Boolean(RAPIDAPI_KEY);
  if (!hasDirect && !hasRapid) return null;

  const q = query.trim().slice(0, 100);
  const number = opts.number ?? 5;
  const params = new URLSearchParams({
    query: q,
    number: String(number),
    addRecipeInformation: 'true',
    addRecipeNutrition: 'true',
  });
  if (opts.diet) params.set('diet', opts.diet);
  if (opts.excludeIngredients) params.set('excludeIngredients', opts.excludeIngredients);

  let url, headers = { Accept: 'application/json' };
  if (hasDirect) {
    url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&${params}`;
  } else {
    const host = RAPIDAPI_SPOONACULAR_HOST.replace(/^https?:\/\//, '');
    url = `https://${host}/recipes/complexSearch?${params}`;
    headers['X-RapidAPI-Key'] = RAPIDAPI_KEY;
    headers['X-RapidAPI-Host'] = host;
  }

  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers });
    if (!res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const recipe = results[0];
    if (!recipe || typeof recipe !== 'object') return null;

    const nutr = extractNutrition(recipe);
    return {
      id: recipe.id,
      title: recipe.title || query,
      image: recipe.image || null,
      sourceUrl: recipe.sourceUrl || recipe.spoonacularSourceUrl || null,
      readyInMinutes: recipe.readyInMinutes ?? null,
      calories: nutr.calories,
      protein_g: nutr.protein_g,
      carbs_g: nutr.carbs_g,
      fat_g: nutr.fat_g,
      source: 'spoonacular',
    };
  } catch {
    return null;
  }
}
