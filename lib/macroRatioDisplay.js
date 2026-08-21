/**
 * Poměr maker z gramů (B×4 + S×4 + T×9) pro přehledný graf v UI.
 */

/**
 * @param {{ protein_g?: number|null, carbs_g?: number|null, fat_g?: number|null, calories?: number|null }} input
 * @returns {{ proteinPct: number, carbsPct: number, fatPct: number, computedKcal: number, statedKcal: number|null }|null}
 */
export function computeMacroRatio(input = {}) {
  const protein = Number(input.protein_g);
  const carbs = Number(input.carbs_g);
  const fat = Number(input.fat_g);
  const p = Number.isFinite(protein) ? protein : 0;
  const c = Number.isFinite(carbs) ? carbs : 0;
  const f = Number.isFinite(fat) ? fat : 0;

  const computedKcal = Math.round(p * 4 + c * 4 + f * 9);
  if (computedKcal <= 0) return null;

  let proteinPct = Math.round((p * 4 / computedKcal) * 100);
  let carbsPct = Math.round((c * 4 / computedKcal) * 100);
  let fatPct = Math.round((f * 9 / computedKcal) * 100);
  const sum = proteinPct + carbsPct + fatPct;
  if (sum !== 100) {
    fatPct = Math.max(0, fatPct + (100 - sum));
  }

  const stated = Number(input.calories);
  return {
    proteinPct,
    carbsPct,
    fatPct,
    computedKcal,
    statedKcal: Number.isFinite(stated) ? Math.round(stated) : null,
  };
}

/**
 * @param {object|null|undefined} meal
 */
export function macroRatioFromMeal(meal) {
  if (!meal) return null;
  return computeMacroRatio({
    protein_g: meal.protein_g ?? meal.protein ?? meal.macros?.protein_g,
    carbs_g: meal.carbs_g ?? meal.carbs ?? meal.macros?.carbs_g,
    fat_g: meal.fat_g ?? meal.fat ?? meal.macros?.fat_g,
    calories: meal.calories ?? meal.kcal ?? meal.macros?.calories,
  });
}
