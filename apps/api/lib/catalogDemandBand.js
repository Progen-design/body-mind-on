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

/**
 * Tolerance pásma (1) kolem cíle slotu. Číselně stejné jako START_MIN_SCALE /
 * START_MAX_SCALE, ale je to JINÁ VĚC: tohle je „co jsem ochoten naservírovat“,
 * tamto je „jak moc smím hnout porcí“. Neimportuje se schválně — modul má
 * zůstat bez závislostí (viz hlavička).
 */
export const SERVE_BAND_LO = 0.85;
export const SERVE_BAND_HI = 1.15;

/**
 * Pásmo (1) — co chci NASERVÍROVAT — srovnané tak, aby bylo splnitelné.
 *
 * PROČ TOHLE MUSÍ EXISTOVAT. Porce se škáluje na cíl slotu, a teprve výsledek
 * se poměřuje s pásmem [minKcal, maxKcal]. Když cíl leží MIMO to pásmo, je
 * pásmo nesplnitelné pro každý recept, který cíl trefí — projdou jen ty, které
 * ho minou o clamp škálování. Filtr se tím obrátí naruby: čím líp recept sedí
 * na cíl, tím jistěji se zahodí.
 *
 * Přesně to se stalo 9. 8. 2026 u snídaně. MEAL_WEIGHTS dává při 5 jídlech
 * snídani 0,20 dne (1996 kcal → cíl 399), ale calorieRangeForMealType má u
 * snídaně dolní hranici 0,22 dne (439). Průnik v kcalBandForMealSlot vyrobil
 * pásmo 439–459 při cíli 399. Ze 43 načtených snídaní jich 36 naservírovalo
 * 397–405 kcal (cíl trefen) a všech 36 se zahodilo; prošlo 7 receptů
 * naservírovaných na 439–459 kcal, tedy těch, které cíl minuly nejvíc.
 *
 * Řešení NENÍ rozšířit škálování — to by servírovalo porce mimo cíl. Řešení je
 * srovnat pásmo s cílem: ±15 % kolem cíle, tedy přesně to, co se do něj dá
 * naškálovat.
 *
 * Vrací `opraveno: true`, jen když pásmo cíl opravdu neobsahovalo. Konzistentní
 * pásmo projde beze změny — tohle nic neuvolňuje na zdravých slotech.
 *
 * @param {{minKcal?:number|null, maxKcal?:number|null, slotTargetKcal?:number|null}} p
 * @returns {{minKcal:number, maxKcal:number, opraveno:boolean}}
 */
export function serveBandForSlot(p) {
  const min = Number(p?.minKcal);
  const max = Number(p?.maxKcal);
  const cil = Number(p?.slotTargetKcal);

  // Bez cíle se pásmo nedá s čím srovnat — volající dostane, co poslal.
  if (!Number.isFinite(cil) || cil <= 0) {
    return { minKcal: min, maxKcal: max, opraveno: false };
  }

  const cilMimoPasmo =
    (Number.isFinite(min) && cil < min) || (Number.isFinite(max) && cil > max);
  if (!cilMimoPasmo) {
    return { minKcal: min, maxKcal: max, opraveno: false };
  }

  return {
    minKcal: Math.max(80, Math.round(cil * SERVE_BAND_LO)),
    maxKcal: Math.round(cil * SERVE_BAND_HI),
    opraveno: true,
  };
}

export default demandBandForSlot;
