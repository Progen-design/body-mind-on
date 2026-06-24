/**
 * Shared meal nutrition display mapping for web + email.
 */
import { createMealDisplayModel } from './mealDisplayModel.js';

/**
 * Returns normalized nutrition values from meal/recipe/macros/nutrition.
 * @param {object|null|undefined} meal
 */
export function getMealNutritionDisplay(meal) {
  const model = createMealDisplayModel(meal);
  return {
    calories: model.calories,
    protein_g: model.protein_g,
    carbs_g: model.carbs_g,
    fat_g: model.fat_g,
    fiber_g: model.fiber_g,
  };
}

/**
 * Sum daily calories from all meals that have nutrition data.
 * @param {object[]|null|undefined} meals
 * @returns {number|null}
 */
export function sumMealCalories(meals) {
  const list = Array.isArray(meals) ? meals : [];
  let sum = 0;
  let hasAny = false;
  for (const meal of list) {
    const n = getMealNutritionDisplay(meal);
    if (n.calories != null) {
      sum += n.calories;
      hasAny = true;
    }
  }
  return hasAny ? Math.round(sum) : null;
}

