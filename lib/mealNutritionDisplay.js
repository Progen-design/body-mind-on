/**
 * Shared meal nutrition display mapping for web + email.
 */

function toMacroNumber(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] != null && Number.isFinite(Number(obj[key]))) return Number(obj[key]);
  }
  return null;
}

/**
 * Returns normalized nutrition values from meal/recipe/macros/nutrition.
 * @param {object|null|undefined} meal
 */
export function getMealNutritionDisplay(meal) {
  const recipe = meal?.recipe && typeof meal.recipe === 'object' ? meal.recipe : null;
  const nutrition = meal?.nutrition && typeof meal.nutrition === 'object' ? meal.nutrition : null;
  const macros = meal?.macros && typeof meal.macros === 'object' ? meal.macros : null;

  const calories = toMacroNumber(
    pick(recipe, ['calories', 'kcal'])
    ?? pick(nutrition, ['calories', 'kcal'])
    ?? pick(macros, ['calories', 'kcal'])
    ?? pick(meal, ['calories', 'kcal'])
  );

  const protein_g = toMacroNumber(
    pick(recipe, ['protein_g', 'protein'])
    ?? pick(nutrition, ['protein_g', 'protein'])
    ?? pick(macros, ['protein_g', 'protein'])
    ?? pick(meal, ['protein_g', 'protein'])
  );

  const carbs_g = toMacroNumber(
    pick(recipe, ['carbs_g', 'carbohydrates_g', 'carbs'])
    ?? pick(nutrition, ['carbs_g', 'carbohydrates_g', 'carbs'])
    ?? pick(macros, ['carbs_g', 'carbohydrates_g', 'carbs'])
    ?? pick(meal, ['carbs_g', 'carbohydrates_g', 'carbs'])
  );

  const fat_g = toMacroNumber(
    pick(recipe, ['fat_g', 'fat'])
    ?? pick(nutrition, ['fat_g', 'fat'])
    ?? pick(macros, ['fat_g', 'fat'])
    ?? pick(meal, ['fat_g', 'fat'])
  );

  const fiber_g = toMacroNumber(
    pick(recipe, ['fiber_g', 'fiber'])
    ?? pick(nutrition, ['fiber_g', 'fiber'])
    ?? pick(macros, ['fiber_g', 'fiber'])
    ?? pick(meal, ['fiber_g', 'fiber'])
  );

  return { calories, protein_g, carbs_g, fat_g, fiber_g };
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

