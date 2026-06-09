import { isRecipeConsistentWithMealDisplay } from './planDataIntegrity.js';

function isSafeExternalUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed);
}

/**
 * Veřejný odkaz na recept (Spoonacular / katalog) – stejná logika jako v týdenním e-mailu.
 * @param {object|null|undefined} meal structured meal nebo structDay.meals[i]
 * @returns {string}
 */
export function mealRecipeUrl(meal) {
  const fromCatalog = Boolean(meal?.catalog_id) || meal?.recipe?.source === 'catalog';
  if (!fromCatalog && !isRecipeConsistentWithMealDisplay(meal)) {
    return '';
  }
  const r = meal?.recipe;
  const direct =
    r?.sourceUrl ||
    r?.source_url ||
    r?.url ||
    meal?.spoonacular_url ||
    null;
  if (isSafeExternalUrl(direct)) return String(direct).trim();
  return '';
}
