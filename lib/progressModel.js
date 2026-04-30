/**
 * Konzervativní model odhadu z uživatelských vstupů (tréninky + souhrn návyků).
 * Nejde o klinický výstup – jen orientační metrika v přehledu profilu.
 */

/** Literatura: řádově ~7700 kcal na 1 kg tělesného tuku (orientační převod výdeje). */
export const KCAL_PER_KG_BODY_FAT = 7700;

/**
 * Heuristická úprava odhadu váhy z počtu splněných návyků za sledované období (profil API).
 * Zdravý návyk: −20 g na záznam; zlozvyk (splněný = uživatel uznal výskyt): +50 g na záznam.
 */
export const HABIT_ADJ_KG_PER_POSITIVE = 0.02;
export const HABIT_ADJ_KG_PER_NEGATIVE = 0.05;

export function habitWeightCorrectionKg(positiveDone, negativeDone) {
  const p = Number(positiveDone) || 0;
  const n = Number(negativeDone) || 0;
  return n * HABIT_ADJ_KG_PER_NEGATIVE - p * HABIT_ADJ_KG_PER_POSITIVE;
}

/** Souhrnná zátěž týdne – stejné zaokrouhlení jako u sloupců podle typu/dne (1 des. místo). */
export function roundLoadTotal(raw) {
  return Math.round(Number(raw) * 10) / 10;
}
