/**
 * Parametry Spoonacular complexSearch – dieta, kalorie podle typu jídla, intolerance.
 * Dokumentace: https://spoonacular.com/food-api/docs#Search-Recipes-Complex
 */

/** @param {'breakfast'|'lunch'|'dinner'|'snack'} mealType */
export function calorieRangeForMealType(mealType, caloriesPerDay, mealsPerDay) {
  const day = Number(caloriesPerDay) || 2000;
  const n = Math.max(1, Number(mealsPerDay) || 3);
  const per = Math.round(day / n);
  const ranges = {
    breakfast: { min: Math.max(120, Math.round(per * 0.22)), max: Math.min(900, Math.round(per * 0.38)) },
    lunch: { min: Math.max(250, Math.round(per * 0.28)), max: Math.min(1100, Math.round(per * 0.48)) },
    dinner: { min: Math.max(250, Math.round(per * 0.28)), max: Math.min(1100, Math.round(per * 0.48)) },
    snack: { min: 80, max: Math.min(450, Math.round(per * 0.22)) },
  };
  return ranges[mealType] || { min: 200, max: 900 };
}

/** Spoonacular: gluten, dairy, egg, seafood, peanut, sesame, sulfite, soy, tree nut, wheat */
const INTOLERANCE_ALIASES = [
  ['gluten', 'gluten'],
  ['bez lepku', 'gluten'],
  ['mléko', 'dairy'],
  ['mleč', 'dairy'],
  ['dairy', 'dairy'],
  ['vejce', 'egg'],
  ['egg', 'egg'],
  ['arašíd', 'peanut'],
  ['peanut', 'peanut'],
  ['soj', 'soy'],
  ['soy', 'soy'],
  ['ryb', 'seafood'],
  ['seafood', 'seafood'],
  ['korýš', 'shellfish'],
  ['shellfish', 'shellfish'],
  ['sezam', 'sesame'],
  ['sesame', 'sesame'],
  ['ořech', 'tree nut'],
  ['tree nut', 'tree nut'],
  ['psenic', 'wheat'],
  ['wheat', 'wheat'],
];

/**
 * @param {object|null|undefined} bm - body_metrics
 * @returns {string[]} unikátní Spoonacular intolerance kódy
 */
export function parseIntolerancesFromBodyMetrics(bm) {
  const raw = [bm?.allergies, bm?.dietary_restrictions, bm?.foods_to_avoid].filter(Boolean).join(' ').toLowerCase();
  if (!raw.trim()) return [];
  const out = new Set();
  for (const [needle, code] of INTOLERANCE_ALIASES) {
    if (raw.includes(needle)) out.add(code);
  }
  return [...out];
}

/**
 * Jednoduchý seznam vyloučených ingrediencí (max 5 pro URL).
 * @param {object|null|undefined} bm
 */
export function parseExcludeIngredientsFromBodyMetrics(bm) {
  const raw = (bm?.foods_to_avoid || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * @param {object} ctx
 * @param {string} ctx.query
 * @param {number} ctx.number - počet výsledků (shortlist; výchozí 3, max 25)
 * @param {'breakfast'|'lunch'|'dinner'|'snack'} [ctx.mealType]
 * @param {string} [ctx.diet] - standard | vegetarian | vegan
 * @param {number} [ctx.caloriesPerDay]
 * @param {number} [ctx.mealsPerDay]
 * @param {string[]} [ctx.intolerances]
 * @param {string[]} [ctx.excludeIngredients]
 * @param {number} [ctx.maxReadyTime]
 * @param {string} apiKey
 * @returns {string} query string (bez domény)
 */
/**
 * Kontext pro complexSearch z profilu (stejné jako při generování plánu).
 * @param {object|null} bodyMetrics
 * @param {object} [targets]
 * @param {'breakfast'|'lunch'|'dinner'|'snack'} [mealType]
 */
export function buildSpoonacularContext(bodyMetrics, targets, mealType) {
  const mt = mealType || 'lunch';
  const diet = bodyMetrics?.diet_type || 'standard';
  const caloriesPerDay = Number(targets?.calories_per_day) || 2000;
  const mealsPerDay = Number(bodyMetrics?.meals_per_day) || 3;
  return {
    mealType: mt,
    diet,
    caloriesPerDay,
    mealsPerDay,
    intolerances: parseIntolerancesFromBodyMetrics(bodyMetrics),
    excludeIngredients: parseExcludeIngredientsFromBodyMetrics(bodyMetrics),
    maxReadyTime: 60,
  };
}

export function buildComplexSearchQueryString(ctx, apiKey) {
  const {
    query,
    number = 3,
    mealType = 'lunch',
    diet = 'standard',
    caloriesPerDay = 2000,
    mealsPerDay = 3,
    intolerances = [],
    excludeIngredients = [],
    maxReadyTime = 60,
    /** @type {boolean|undefined} */
    instructionsRequired,
    /** @type {number|null|undefined} */
    minCalories: minCaloriesOverride,
    /** @type {number|null|undefined} */
    maxCalories: maxCaloriesOverride,
    /** @type {string|number|undefined} */
    minProtein,
  } = ctx;

  const params = new URLSearchParams();
  params.set('apiKey', apiKey);
  params.set('query', query);
  params.set('number', String(Math.max(1, Math.min(Number(number) || 3, 25))));
  /** Bez addRecipeInformation API často nevrací results[].image (jen id). */
  params.set('addRecipeInformation', 'true');
  params.set('addRecipeNutrition', 'true');
  params.set('fillIngredients', 'true');
  const instr =
    instructionsRequired === true ? 'true' : instructionsRequired === false ? 'false' : 'false';
  params.set('instructionsRequired', instr);

  if (
    minCaloriesOverride != null &&
    maxCaloriesOverride != null &&
    Number.isFinite(Number(minCaloriesOverride)) &&
    Number.isFinite(Number(maxCaloriesOverride))
  ) {
    params.set('minCalories', String(Math.round(Number(minCaloriesOverride))));
    params.set('maxCalories', String(Math.round(Number(maxCaloriesOverride))));
  } else {
    const range = calorieRangeForMealType(mealType, caloriesPerDay, mealsPerDay);
    params.set('minCalories', String(range.min));
    params.set('maxCalories', String(range.max));
  }
  const minP = minProtein != null && minProtein !== '' ? String(minProtein) : '5';
  params.set('minProtein', minP);
  params.set('maxReadyTime', String(maxReadyTime));

  const typeMap = {
    breakfast: 'breakfast',
    lunch: 'main course',
    dinner: 'main course',
    snack: 'snack',
  };
  const st = typeMap[mealType];
  if (st) params.set('type', st);

  if (diet === 'vegetarian') params.set('diet', 'vegetarian');
  if (diet === 'vegan') params.set('diet', 'vegan');

  if (intolerances.length) params.set('intolerances', intolerances.join(','));
  if (excludeIngredients.length) params.set('excludeIngredients', excludeIngredients.join(','));

  return params.toString();
}
