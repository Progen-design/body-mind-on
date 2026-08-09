/**
 * Kalorické pásmo, které se posílá do fronty generátoru receptů.
 *
 * TŘI RŮZNÁ PÁSMA, KTERÁ SE DŘÍV SLILA DO JEDNOHO:
 *   1) minKcal/maxKcal            cíl slotu ±15 % = co chci NASERVÍROVAT
 *   2) SQL okno                   po naškálování dosažitelné = co má smysl NAČÍST
 *   3) calorieRangeForMealType    slotové pásmo = co má smysl VYROBIT
 *
 * Do fronty patří (3). Dřív tam šlo (1), takže si systém objednával recepty do
 * mikropásem: 9. 8. 2026 odešla objednávka na snídani 439–459 kcal, tedy pásmo
 * široké 20 kcal. Generátor by na to pálil tokeny a vyrobil recepty, které se
 * nedají použít nikde jinde.
 *
 * Vlastní modul bez závislostí schválně: recipesCatalog.js táhne supabaseServer
 * a další Next-only importy, takže by se tahle logika nedala unit-testovat.
 */

/**
 * @param {{slotKcalMin?:number|null, slotKcalMax?:number|null,
 *          minKcal?:number|null, maxKcal?:number|null}} p
 * @returns {{kcalMin:number, kcalMax:number}}
 */
export function demandBandForSlot(p) {
  const slotMin = Number(p?.slotKcalMin);
  const slotMax = Number(p?.slotKcalMax);
  const maSlotovePasmo = Number.isFinite(slotMin) && Number.isFinite(slotMax) && slotMin < slotMax;

  // Bez slotového pásma se chováme jako dřív — volající, který ho nezná
  // (havarijní dotaz, honesty-fill pool), nemá kvůli téhle změně přestat logovat.
  const lo = maSlotovePasmo ? slotMin : Number(p?.minKcal);
  const hi = maSlotovePasmo ? slotMax : Number(p?.maxKcal);

  return {
    kcalMin: Math.max(80, Math.floor(lo)),
    kcalMax: Math.ceil(hi),
  };
}

export default demandBandForSlot;
