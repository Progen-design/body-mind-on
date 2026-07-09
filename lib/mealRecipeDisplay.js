import { createMealDisplayModel } from './mealDisplayModel.js';
import { catalogLookupIdFromMeal } from './recipeDetailUrl.js';
import { buildMacroEnergyNutritionHtml, escapeHtml, recipePartsToHtml } from './recipeDetailHtml.js';

/**
 * Shared recipe URL resolution for web + email rendering.
 * Fallback meals always return local fallback detail endpoint.
 * @param {object|null|undefined} meal
 * @param {string} appBaseUrl
 * @returns {string}
 */
export function getMealRecipeUrl(meal, appBaseUrl) {
  return createMealDisplayModel(meal, appBaseUrl).recipeUrl || '';
}

/**
 * @param {ReturnType<typeof createMealDisplayModel>|null|undefined} model
 * @returns {boolean}
 */
export function hasLocalMealRecipeDetail(model) {
  if (!model || typeof model !== 'object') return false;
  if (model.isSimpleStartLibrary || model.isFallback) return true;
  const ingredients = Array.isArray(model.ingredients) ? model.ingredients.filter(Boolean) : [];
  const instructions = Array.isArray(model.instructions) ? model.instructions.filter(Boolean) : [];
  return ingredients.length > 0 && instructions.length > 0;
}

/**
 * @param {ReturnType<typeof createMealDisplayModel>|null|undefined} model
 * @returns {boolean}
 */
export function shouldFetchMealRecipeFromApi(model) {
  if (hasLocalMealRecipeDetail(model)) return false;
  const meal = model?.normalizedMeal;
  if (meal && model.source === 'catalog' && catalogLookupIdFromMeal(meal) != null) return true;
  return !hasLocalMealRecipeDetail(model);
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function isRecipeRateLimitMessage(message) {
  return /překročen limit|rate limit|429|quota/i.test(String(message || ''));
}

function macroNutrientsFromDisplayModel(model) {
  if (!model || typeof model !== 'object') return {};
  return {
    kcal: model.calories ?? model.kcal ?? null,
    calories: model.calories ?? model.kcal ?? null,
    protein_g: model.protein_g ?? null,
    carbs_g: model.carbs_g ?? null,
    fat_g: model.fat_g ?? null,
  };
}

function mealImageUrl(model) {
  const meal = model?.normalizedMeal;
  if (!meal || typeof meal !== 'object') return null;
  return meal.image_url || meal.recipe?.image || meal.recipe?.image_url || null;
}

/**
 * HTML fragment for profile recipe modal from display model (no API).
 * @param {ReturnType<typeof createMealDisplayModel>} model
 * @param {{ includeSourceMeta?: boolean }} [options]
 * @returns {string}
 */
export function buildMealRecipeModalHtml(model, options = {}) {
  if (!model?.title) return '';
  const nutritionHtml = buildMacroEnergyNutritionHtml(macroNutrientsFromDisplayModel(model));
  const html = recipePartsToHtml({
    title: model.title,
    ingredients_cs: model.ingredients || [],
    instructions_cs: model.instructions || [],
    image_url: mealImageUrl(model),
    nutritionHtml,
  });
  const meta = options.includeSourceMeta && model.source
    ? `<p class="plan-recipe-source-meta"><small>Zdroj dat: ${escapeHtml(String(model.source))}</small></p>`
    : '';
  return `${html}${meta}`.trim();
}

/**
 * Minimal modal content (title + macros) when ingredients are missing.
 * @param {ReturnType<typeof createMealDisplayModel>} model
 * @returns {string}
 */
export function buildMealRecipeBasicsHtml(model) {
  if (!model?.title) return '';
  const nutritionHtml = buildMacroEnergyNutritionHtml(macroNutrientsFromDisplayModel(model));
  const parts = [
    `<p><b>Jídlo:</b> ${escapeHtml(model.title)}</p>`,
    nutritionHtml,
  ].filter(Boolean);
  return parts.join('').trim();
}

/**
 * Graceful modal body when API hit rate limit but local meal data exists.
 * @param {ReturnType<typeof createMealDisplayModel>} model
 * @returns {string}
 */
export function buildMealRecipeRateLimitFallbackHtml(model) {
  const detail = buildMealRecipeModalHtml(model) || buildMealRecipeBasicsHtml(model);
  if (!detail) {
    return '<p class="plan-no-recipe-msg">Recept se teď nepodařilo načíst.</p>';
  }
  return (
    '<p class="plan-recipe-rate-limit-msg">Recept se teď nepodařilo načíst. Základní údaje k jídlu máš níže.</p>'
    + detail
  );
}

/**
 * Replace bare API rate-limit error with local fallback when possible.
 * @param {string|null|undefined} apiHtmlOrError
 * @param {ReturnType<typeof createMealDisplayModel>|null|undefined} model
 * @returns {string|null|undefined}
 */
export function mergeRecipeApiErrorWithLocalFallback(apiHtmlOrError, model) {
  const text = String(apiHtmlOrError || '');
  if (!text) return apiHtmlOrError;
  const isError = isRecipeRateLimitMessage(text)
    || text.includes('plan-no-recipe-msg')
    || text.includes('Recept se nepodařilo');
  if (!isError) return apiHtmlOrError;
  if (model && (hasLocalMealRecipeDetail(model) || model.title)) {
    return buildMealRecipeRateLimitFallbackHtml(model);
  }
  return apiHtmlOrError;
}

/**
 * @param {object|null|undefined} structMeal
 * @param {string} [appBaseUrl]
 */
export function createMealDisplayModelFromStructuredMeal(structMeal, appBaseUrl = '') {
  return structMeal ? createMealDisplayModel(structMeal, appBaseUrl) : null;
}
