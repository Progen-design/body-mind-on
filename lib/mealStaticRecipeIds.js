/**
 * Jednotná mapa Spoonacular recipe_id podle anglického vyhledávacího řetězce.
 * Použití: rychlý fallback bez HTTP (orchestrátor + mealEnrichment).
 */
export const MEAL_STATIC_RECIPE_IDS = {
  'scrambled eggs': 716429,
  'fried eggs': 665228,
  'boiled eggs': 641975,
  'egg omelette': 664501,
  omelette: 664501,
  oatmeal: 636050,
  'oatmeal banana': 634141,
  'overnight oats': 715543,
  'greek yogurt': 645315,
  'yogurt parfait': 667872,
  'avocado toast': 637876,
  'smoothie bowl': 782601,
  'protein pancakes': 663559,
  'granola yogurt': 645315,
  muesli: 656329,
  'cottage cheese': 644387,
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
};

/**
 * @param {string|null|undefined} rawQuery — anglický dotaz (spoonacular_query), malá písmena
 * @returns {number|null}
 */
export function lookupStaticSpoonacularRecipeId(rawQuery) {
  const q = String(rawQuery || '')
    .toLowerCase()
    .trim();
  if (!q) return null;
  const twoWords = q.split(/\s+/).slice(0, 2).join(' ');
  const firstWord = q.split(/\s+/)[0] || '';
  const fid =
    MEAL_STATIC_RECIPE_IDS[q] ||
    (twoWords && twoWords !== q ? MEAL_STATIC_RECIPE_IDS[twoWords] : undefined) ||
    MEAL_STATIC_RECIPE_IDS[firstWord];
  const n = Number(fid);
  return Number.isFinite(n) ? n : null;
}
