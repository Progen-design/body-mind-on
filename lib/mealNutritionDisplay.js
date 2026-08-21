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

function structMealTypeKey(type) {
  const t = String(type || '').toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (t === 'breakfast' || t.includes('snidan')) return 'breakfast';
  if (t === 'lunch' || t.includes('obed')) return 'lunch';
  if (t === 'dinner' || t.includes('vecere')) return 'dinner';
  if (t === 'snack' || t.includes('svacina')) return 'snack';
  return t;
}

/**
 * Pair HTML/viewer meal row with structured meal (index, then meal type).
 * @param {object[]} structMeals
 * @param {object|null|undefined} meal
 * @param {number} index
 */
export function pairStructMeal(structMeals, meal, index) {
  const list = Array.isArray(structMeals) ? structMeals : [];
  if (list[index]) return list[index];
  const key = structMealTypeKey(meal?.type);
  if (!key) return null;
  return list.find((m) => structMealTypeKey(m?.type) === key) || null;
}

/**
 * Sum day nutrition — prefers structured_plan_json meals (scaled kcal), falls back to viewer meals.
 * @param {object[]|null|undefined} meals
 * @param {object|null|undefined} structDay
 */
export function sumDayNutrition(meals, structDay) {
  const structMeals = Array.isArray(structDay?.meals) ? structDay.meals : [];
  const viewerMeals = Array.isArray(meals) ? meals : [];
  const sourceMeals = structMeals.length
    ? structMeals
    : viewerMeals;

  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let hasKcal = false;

  sourceMeals.forEach((meal, mi) => {
    const structMeal = structMeals.length ? meal : pairStructMeal(structMeals, meal, mi);
    const n = getMealNutritionDisplay(structMeal || meal);
    if (n.calories != null) {
      kcal += Number(n.calories) || 0;
      hasKcal = true;
    }
    if (n.protein_g != null) protein += Number(n.protein_g) || 0;
    if (n.carbs_g != null) carbs += Number(n.carbs_g) || 0;
    if (n.fat_g != null) fat += Number(n.fat_g) || 0;
  });

  return {
    kcal: hasKcal ? Math.round(kcal) : null,
    protein: Math.round(protein) || 0,
    carbs: Math.round(carbs) || 0,
    fat: Math.round(fat) || 0,
  };
}

/**
 * Daily calorie target for profile display — always plan-wide canonical target.
 * Per-day jitter (daily_target_kcal) is internal only and must not differ in UI.
 * @param {object|null|undefined} structDay
 * @param {object|null|undefined} planTargets
 */
export function resolveDayCalorieTarget(structDay, planTargets) {
  const planTarget = Number(planTargets?.calories_per_day);
  if (Number.isFinite(planTarget) && planTarget > 0) return Math.round(planTarget);
  const dayTarget = Number(structDay?.daily_target_kcal);
  if (Number.isFinite(dayTarget) && dayTarget > 0) return Math.round(dayTarget);
  return null;
}

