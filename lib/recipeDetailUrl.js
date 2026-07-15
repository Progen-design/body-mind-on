import { getPublicAppUrl } from './siteUrls.js';

export const RECIPE_FROM_CATALOG_PATH = '/api/recipe-from-catalog';

/**
 * ID pro lookup v recipes_catalog: catalog_id z plánu, jinak recipe_id (staré plány).
 * @param {object|null|undefined} meal
 * @returns {number|null}
 */
export function catalogLookupIdFromMeal(meal) {
  if (!meal || typeof meal !== 'object') return null;
  const catalogId = meal.catalog_id;
  if (catalogId != null && Number.isFinite(Number(catalogId))) {
    return Number(catalogId);
  }
  const recipeId = meal.recipe?.id ?? meal.recipe_id ?? null;
  if (recipeId != null && Number.isFinite(Number(recipeId))) {
    return Number(recipeId);
  }
  return null;
}

/**
 * URL detailu receptu z recipes_catalog (modal + e-mail).
 * @param {number|string} lookupId — recipes_catalog.id (preferované) nebo source_id fallback
 * @param {string} appBaseUrl
 * @param {{ format?: string, meal?: object|null }} [options]
 */
export function recipeFromCatalogApiUrl(recipeId, appBaseUrl, { format, meal } = {}) {
  const base = String(appBaseUrl || getPublicAppUrl() || '').replace(/\/$/, '');
  const params = new URLSearchParams();
  const mealForQuery = meal;
  if (recipeId != null && Number.isFinite(Number(recipeId))) {
    params.set('id', String(recipeId));
  }
  if (format === 'html') params.set('format', 'html');
  if (mealForQuery?.display_name_cs) params.set('display_name', String(mealForQuery.display_name_cs));
  if (mealForQuery?.type) params.set('meal_type', String(mealForQuery.type));
  const kcal = mealForQuery?.recipe?.calories ?? mealForQuery?.calories ?? mealForQuery?.kcal;
  const protein = mealForQuery?.recipe?.protein_g ?? mealForQuery?.protein_g;
  const carbs = mealForQuery?.recipe?.carbs_g ?? mealForQuery?.carbs_g;
  const fat = mealForQuery?.recipe?.fat_g ?? mealForQuery?.fat_g;
  if (kcal != null && Number.isFinite(Number(kcal))) params.set('kcal', String(Math.round(Number(kcal))));
  if (protein != null && Number.isFinite(Number(protein))) params.set('protein_g', String(Number(protein)));
  if (carbs != null && Number.isFinite(Number(carbs))) params.set('carbs_g', String(Number(carbs)));
  if (fat != null && Number.isFinite(Number(fat))) params.set('fat_g', String(Number(fat)));
  if (
    (
      mealForQuery?.catalog_source === 'simple_start_fallback'
      || mealForQuery?.recipe?.source === 'simple_start_fallback'
      || mealForQuery?.catalog_source === 'start_safe_fallback'
      || mealForQuery?.recipe?.source === 'start_safe_fallback'
      || mealForQuery?.catalog_source === 'simple_start_library'
      || mealForQuery?.recipe?.source === 'simple_start_library'
    )
    && !(mealForQuery?.catalog_id != null && Number.isFinite(Number(mealForQuery.catalog_id)))
  ) {
    params.set('fallback', '1');
  }
  return `${base}${RECIPE_FROM_CATALOG_PATH}?${params.toString()}`;
}
