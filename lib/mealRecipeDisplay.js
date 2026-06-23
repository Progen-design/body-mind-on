import { recipeFromCatalogApiUrl, catalogLookupIdFromMeal } from './recipeDetailUrl.js';
import { isRecipeConsistentWithMealDisplay } from './planDataIntegrity.js';

function isSafeExternalUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return !!trimmed && /^https?:\/\//i.test(trimmed);
}

function isFallbackMeal(meal) {
  return (
    meal?.catalog_source === 'simple_start_fallback'
    || meal?.recipe?.source === 'simple_start_fallback'
    || meal?.catalog_source === 'start_safe_fallback'
    || meal?.recipe?.source === 'start_safe_fallback'
  );
}

/**
 * Shared recipe URL resolution for web + email rendering.
 * Fallback meals always return local fallback detail endpoint.
 * @param {object|null|undefined} meal
 * @param {string} appBaseUrl
 * @returns {string}
 */
export function getMealRecipeUrl(meal, appBaseUrl) {
  if (!meal || typeof meal !== 'object') return '';

  if (isFallbackMeal(meal)) {
    return recipeFromCatalogApiUrl(null, appBaseUrl, { format: 'html', meal });
  }

  const fromCatalog = Boolean(meal?.catalog_id) || meal?.recipe?.source === 'catalog';
  if (!fromCatalog && !isRecipeConsistentWithMealDisplay(meal)) {
    return '';
  }

  const lookupId = catalogLookupIdFromMeal(meal);
  if (lookupId != null) {
    return recipeFromCatalogApiUrl(lookupId, appBaseUrl, { format: 'html', meal });
  }

  const r = meal?.recipe;
  const direct = r?.sourceUrl || r?.source_url || r?.url || meal?.spoonacular_url || null;
  if (isSafeExternalUrl(direct)) return String(direct).trim();
  return '';
}

