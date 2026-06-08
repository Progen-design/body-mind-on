/**
 * lib/nutrition/portionScaling.js
 * Rozložení denního kalorického cíle na sloty a škálování porcí z nominálních kcal receptu.
 */

/** @typedef {'snidane'|'obed'|'vecere'|'svacina'} CatalogMealType */

export const MEAL_WEIGHTS = {
  3: { snidane: 0.3, obed: 0.4, vecere: 0.3 },
  4: { snidane: 0.25, obed: 0.35, vecere: 0.3, svacina: 0.1 },
};

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.0;

/**
 * @param {number} dailyTarget
 * @param {number} mealsPerDay
 * @param {CatalogMealType|string} mealType
 * @returns {number}
 */
export function slotTargetKcal(dailyTarget, mealsPerDay, mealType) {
  const n = Math.max(2, Math.min(6, Number(mealsPerDay) || 3));
  const weights = MEAL_WEIGHTS[n] || MEAL_WEIGHTS[3];
  const w = weights[mealType] ?? 1 / n;
  return Math.round(Number(dailyTarget) * w);
}

/**
 * @param {object|null|undefined} recipe
 * @param {number} target
 * @returns {object}
 */
export function scaleMealToTarget(recipe, target) {
  if (!recipe?.kcal || Number(recipe.kcal) <= 0) return { ...recipe };
  const raw = Number(target) / Number(recipe.kcal);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
  const r = (n) => Math.round((Number(n) || 0) * scale * 10) / 10;
  return {
    ...recipe,
    portion_multiplier: Math.round(scale * 100) / 100,
    kcal: Math.round(Number(recipe.kcal) * scale),
    protein_g: r(recipe.protein_g),
    carbs_g: r(recipe.carbs_g),
    fat_g: r(recipe.fat_g),
  };
}

/**
 * Plan slot type → catalog meal type pro MEAL_WEIGHTS.
 * @param {string} planMealType
 * @returns {CatalogMealType}
 */
export function planMealTypeToWeightKey(planMealType) {
  const t = String(planMealType || 'lunch').toLowerCase();
  if (t === 'breakfast') return 'snidane';
  if (t === 'dinner') return 'vecere';
  if (t === 'snack') return 'svacina';
  return 'obed';
}

/**
 * Z kandidátů vybere řádek s nominálními kcal nejblíže cíli slotu.
 * @param {object[]} rows
 * @param {number} slotTarget
 * @returns {object|null}
 */
export function pickClosestCatalogRow(rows, slotTarget) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let best = rows[0];
  let bestDiff = Math.abs(Number(best.kcal) - slotTarget);
  for (let i = 1; i < rows.length; i++) {
    const diff = Math.abs(Number(rows[i].kcal) - slotTarget);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = rows[i];
    }
  }
  return best;
}

/**
 * Součet škálovaných kcal z pole meal objektů.
 * @param {object[]} meals
 * @returns {number}
 */
export function sumScaledDayKcal(meals) {
  return (meals || []).reduce((s, m) => s + (Number(m?.kcal) || 0), 0);
}
