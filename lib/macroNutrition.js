/**
 * Sdílená logika maker: kcal z 4/4/9, energie % a normalizace polí.
 */

export {
  calculateCaloriesFromMacros,
  getMacroCalorieDelta,
} from './macroKcalConsistency.js';

/**
 * @param {object|null|undefined} source meal, display model, or flat macro object
 * @returns {{ kcal: number, protein_g: number, carbs_g: number, fat_g: number }}
 */
export function normalizeMacroNutritionFields(source = {}) {
  const meal = source?.normalizedMeal && typeof source.normalizedMeal === 'object'
    ? source.normalizedMeal
    : source;
  const recipe = meal?.recipe && typeof meal.recipe === 'object' ? meal.recipe : null;
  const nutrition = meal?.nutrition && typeof meal.nutrition === 'object' ? meal.nutrition : null;
  const macros = meal?.macros && typeof meal.macros === 'object' ? meal.macros : null;

  const pick = (...values) => {
    for (const value of values) {
      if (value == null || value === '') continue;
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return 0;
  };

  const kcal = pick(
    source?.kcal,
    source?.calories,
    meal?.kcal,
    meal?.calories,
    recipe?.kcal,
    recipe?.calories,
    nutrition?.kcal,
    nutrition?.calories,
    macros?.kcal,
    macros?.calories,
  );

  const protein_g = pick(
    source?.protein_g,
    source?.protein,
    meal?.protein_g,
    meal?.protein,
    recipe?.protein_g,
    recipe?.protein,
    nutrition?.protein_g,
    nutrition?.protein,
    macros?.protein_g,
    macros?.protein,
  );

  const carbs_g = pick(
    source?.carbs_g,
    source?.carbs,
    source?.carbohydrates_g,
    meal?.carbs_g,
    meal?.carbs,
    meal?.carbohydrates_g,
    recipe?.carbs_g,
    recipe?.carbs,
    recipe?.carbohydrates_g,
    nutrition?.carbs_g,
    nutrition?.carbs,
    macros?.carbs_g,
    macros?.carbs,
  );

  const fat_g = pick(
    source?.fat_g,
    source?.fat,
    meal?.fat_g,
    meal?.fat,
    recipe?.fat_g,
    recipe?.fat,
    nutrition?.fat_g,
    nutrition?.fat,
    macros?.fat_g,
    macros?.fat,
  );

  return { kcal, protein_g, carbs_g, fat_g };
}

/**
 * @param {{ kcal?: number|null, protein_g?: number|null, carbs_g?: number|null, fat_g?: number|null }} input
 * @returns {{
 *   proteinKcal: number,
 *   carbsKcal: number,
 *   fatKcal: number,
 *   totalMacroKcal: number,
 *   proteinPercent: number,
 *   carbsPercent: number,
 *   fatPercent: number,
 *   hasMacros: boolean,
 *   statedKcal: number|null
 * }}
 */
export function getMacroEnergyBreakdown(input = {}) {
  const normalized = normalizeMacroNutritionFields(input);
  const p = normalized.protein_g;
  const c = normalized.carbs_g;
  const f = normalized.fat_g;

  const proteinKcal = p * 4;
  const carbsKcal = c * 4;
  const fatKcal = f * 9;
  const totalMacroKcal = proteinKcal + carbsKcal + fatKcal;

  const stated = Number(normalized.kcal);
  const statedKcal = Number.isFinite(stated) && stated > 0 ? Math.round(stated) : null;

  if (totalMacroKcal <= 0) {
    return {
      proteinKcal: 0,
      carbsKcal: 0,
      fatKcal: 0,
      totalMacroKcal: 0,
      proteinPercent: 0,
      carbsPercent: 0,
      fatPercent: 0,
      hasMacros: false,
      statedKcal,
    };
  }

  let proteinPercent = Math.round((proteinKcal / totalMacroKcal) * 100);
  let carbsPercent = Math.round((carbsKcal / totalMacroKcal) * 100);
  let fatPercent = Math.round((fatKcal / totalMacroKcal) * 100);
  const sum = proteinPercent + carbsPercent + fatPercent;
  if (sum !== 100) {
    fatPercent = Math.max(0, fatPercent + (100 - sum));
  }

  return {
    proteinKcal,
    carbsKcal,
    fatKcal,
    totalMacroKcal,
    proteinPercent,
    carbsPercent,
    fatPercent,
    hasMacros: p > 0 || c > 0 || f > 0,
    statedKcal,
  };
}
