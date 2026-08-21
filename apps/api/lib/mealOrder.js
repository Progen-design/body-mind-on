/**
 * lib/mealOrder.js
 * Chronologické pořadí jídel v rámci dne: snídaně → oběd → svačina → večeře.
 * Jediný zdroj pravdy pro pořadí ve structured_plan_json (profil, e-mail i PDF
 * pak jen iterují pole v uloženém pořadí).
 */

const MEAL_TYPE_CHRONOLOGY = {
  breakfast: 1,
  snidane: 1,
  lunch: 2,
  obed: 2,
  snack: 3,
  svacina: 3,
  dinner: 4,
  vecere: 4,
};

/** Pořadí typu jídla v rámci dne (1=snídaně … 4=večeře); neznámý typ jde na konec. */
export function mealChronologyRank(type) {
  const t = String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return MEAL_TYPE_CHRONOLOGY[t] ?? 99;
}

/**
 * Stabilně seřadí jídla dne podle denní doby (svačina PŘED večeří).
 * Jídla stejného typu zůstávají v původním pořadí.
 * @param {Array<object>} meals
 * @returns {Array<object>} nové pole (vstup nemutuje)
 */
export function sortMealsChronologically(meals) {
  if (!Array.isArray(meals) || meals.length < 2) return Array.isArray(meals) ? meals : [];
  return [...meals].sort((a, b) => mealChronologyRank(a?.type) - mealChronologyRank(b?.type));
}
