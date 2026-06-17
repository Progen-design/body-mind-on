import { getPublicAppUrl } from './siteUrls';

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
 */
export function recipeFromCatalogApiUrl(recipeId, appBaseUrl, { format } = {}) {
  const base = String(appBaseUrl || getPublicAppUrl() || '').replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('id', String(recipeId));
  if (format === 'html') params.set('format', 'html');
  return `${base}${RECIPE_FROM_CATALOG_PATH}?${params.toString()}`;
}
