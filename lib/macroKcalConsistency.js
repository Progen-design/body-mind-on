/**
 * Kontrola konzistence zobrazených kcal vs makra (4/4/9).
 * Permanent arithmetic gate: |kcal − (P×4 + C×4 + F×9)| / kcal ≤ 10 %.
 */

/** @type {number} Relative tolerance for the permanent macro/kcal gate. */
export const MACRO_KCAL_GATE_TOLERANCE = 0.10;

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
  // Permanent gate at ±10 %; soft WARNING from 5 % for UI.
  if (deltaPercent > MACRO_KCAL_GATE_TOLERANCE * 100) status = 'ERROR';
  else if (deltaPercent > 5) status = 'WARNING';

  return {
    kcalFromMacros,
    statedKcal,
    deltaKcal,
    deltaPercent: Math.round(deltaPercent * 10) / 10,
    status,
  };
}

/**
 * Hard arithmetic gate used by catalog pick + validators.
 * @param {number|null|undefined} kcal
 * @param {number|null|undefined} protein_g
 * @param {number|null|undefined} carbs_g
 * @param {number|null|undefined} fat_g
 * @param {number} [tolerance=MACRO_KCAL_GATE_TOLERANCE]
 * @returns {boolean}
 */
export function passesMacroKcalGate(kcal, protein_g, carbs_g, fat_g, tolerance = MACRO_KCAL_GATE_TOLERANCE) {
  const delta = getMacroCalorieDelta(kcal, protein_g, carbs_g, fat_g);
  if (delta.status === 'UNKNOWN') return false;
  return (delta.deltaPercent ?? 999) <= tolerance * 100 + 1e-9;
}

/**
 * High-fiber / vegetable meals may legitimately miss Atwater 4/4/9 (±10 %).
 * Soft pass when tagged — never auto-delete these rows.
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function rowHasHighFiberTag(row) {
  const tags = Array.isArray(row?.diet_tags) ? row.diet_tags : [];
  return tags.map((t) => String(t || '').toLowerCase()).includes('high_fiber');
}

/**
 * Gate for a catalog row / meal-like object.
 * Soft: high_fiber tag bypasses ±10 % (fiber undercounted by Atwater).
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function rowPassesMacroKcalGate(row) {
  if (!row || typeof row !== 'object') return false;
  if (rowHasHighFiberTag(row)) return true;
  return passesMacroKcalGate(
    row.kcal ?? row.calories,
    row.protein_g,
    row.carbs_g,
    row.fat_g
  );
}

export default getMacroCalorieDelta;
