/**
 * Kontrola konzistence zobrazených kcal vs makra (4/4/9).
 */

/**
 * @param {number|null|undefined} protein_g
 * @param {number|null|undefined} carbs_g
 * @param {number|null|undefined} fat_g
 * @returns {number}
 */
export function calculateCaloriesFromMacros(protein_g, carbs_g, fat_g) {
  const p = Number(protein_g);
  const c = Number(carbs_g);
  const f = Number(fat_g);
  const protein = Number.isFinite(p) ? p : 0;
  const carbs = Number.isFinite(c) ? c : 0;
  const fat = Number.isFinite(f) ? f : 0;
  return Math.round(protein * 4 + carbs * 4 + fat * 9);
}

/**
 * @param {number|null|undefined} displayedKcal
 * @param {number|null|undefined} protein_g
 * @param {number|null|undefined} carbs_g
 * @param {number|null|undefined} fat_g
 * @returns {{
 *   kcalFromMacros: number,
 *   statedKcal: number|null,
 *   deltaKcal: number|null,
 *   deltaPercent: number|null,
 *   status: 'OK'|'WARNING'|'ERROR'|'UNKNOWN'
 * }}
 */
export function getMacroCalorieDelta(displayedKcal, protein_g, carbs_g, fat_g) {
  const kcalFromMacros = calculateCaloriesFromMacros(protein_g, carbs_g, fat_g);
  const stated = Number(displayedKcal);
  const statedKcal = Number.isFinite(stated) && stated > 0 ? Math.round(stated) : null;

  if (!statedKcal || kcalFromMacros <= 0) {
    return {
      kcalFromMacros,
      statedKcal,
      deltaKcal: null,
      deltaPercent: null,
      status: 'UNKNOWN',
    };
  }

  const deltaKcal = statedKcal - kcalFromMacros;
  const deltaPercent = Math.abs((deltaKcal / statedKcal) * 100);
  let status = 'OK';
  if (deltaPercent > 15) status = 'ERROR';
  else if (deltaPercent > 8) status = 'WARNING';

  return {
    kcalFromMacros,
    statedKcal,
    deltaKcal,
    deltaPercent: Math.round(deltaPercent * 10) / 10,
    status,
  };
}

export default getMacroCalorieDelta;
