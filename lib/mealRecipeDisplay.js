import { createMealDisplayModel } from './mealDisplayModel.js';

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

