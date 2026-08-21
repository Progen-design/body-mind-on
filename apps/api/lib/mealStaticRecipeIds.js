import { removeDiacritics } from './mealNormalization';

/**
 * Jednotná mapa Spoonacular recipe_id — anglické dotazy + krátké klíče + česká první slova.
 * Použití: rychlý fallback bez HTTP (orchestrátor + mealEnrichment).
 */
export const MEAL_STATIC_RECIPE_IDS = {
  'scrambled eggs': 716429,
  'fried eggs': 665228,
  'boiled eggs': 641975,
  'egg omelette': 664501,
  omelette: 664501,
  omeleta: 664501,
  oatmeal: 636050,
  'oatmeal banana': 634141,
  'overnight oats': 715543,
  'greek yogurt': 645315,
  'greek salad': 636589,
  'yogurt parfait': 667872,
  'avocado toast': 637876,
  'smoothie bowl': 782601,
  'protein pancakes': 663559,
  'granola yogurt': 645315,
  granola: 645315,
  muesli: 656329,
  'cottage cheese': 644387,
  cottage: 644387,
  tvaroh: 644387,
  'grilled chicken': 641975,
  'chicken rice': 636589,
  'baked salmon': 648279,
  salmon: 648279,
  'beef stew': 638047,
  'lentil soup': 649931,
  lentils: 649931,
  'lentil curry': 716627,
  'pasta chicken': 716429,
  'tuna pasta': 716389,
  'turkey burger': 660306,
  'pork chops': 659306,
  shrimp: 634006,
  'quinoa salad': 660306,
  'ground beef rice': 633741,
  'tuna salad': 660306,
  'chicken salad': 636589,
  'caesar salad': 716408,
  'greek salad chicken': 636589,
  'salmon salad': 648279,
  'tofu stir fry': 716426,
  cod: 634006,
  toast: 637876,
  smoothie: 782601,
  pancakes: 663559,
  eggs: 716429,
  míchanice: 716429,
  jogurt: 645315,
  palačinky: 663559,
  řecký: 636589,
  'vaječná': 716429,
  'avokádový': 637876,
};

function normalizeLookupPhrase(phrase) {
  return removeDiacritics(String(phrase || '').toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupByPhraseLoose(phrase) {
  const p = normalizeLookupPhrase(phrase);
  if (!p) return null;
  const words = p.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const exact = MEAL_STATIC_RECIPE_IDS[p];
  if (exact != null && Number.isFinite(Number(exact))) return Number(exact);
  for (let len = Math.min(4, words.length); len >= 2; len--) {
    const prefix = words.slice(0, len).join(' ');
    const hit = MEAL_STATIC_RECIPE_IDS[prefix];
    if (hit != null && Number.isFinite(Number(hit))) return Number(hit);
  }
  if (words.length === 1) {
    const one = MEAL_STATIC_RECIPE_IDS[words[0]];
    if (one != null && Number.isFinite(Number(one))) return Number(one);
  }
  return null;
}

/**
 * @param {string|null|undefined} rawQuery — spoonacular / anglický dotaz
 * @param {string|null|undefined} nameCz — name_cs z plánu (česky); má přednost při stejném EN dotazu pro více jídel
 * @returns {number|null}
 */
export function lookupStaticSpoonacularRecipeId(rawQuery, nameCz) {
  const cz = typeof nameCz === 'string' ? nameCz.trim() : '';
  if (cz) {
    const fromCz = lookupByPhraseLoose(cz);
    if (fromCz != null) return fromCz;
  }
  const q = normalizeLookupPhrase(rawQuery);
  if (!q) return null;
  return lookupByPhraseLoose(q);
}
