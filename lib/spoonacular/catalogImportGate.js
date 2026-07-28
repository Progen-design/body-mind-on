/**
 * Pure import gate helpers (no Supabase) — shared with catalogImport and unit tests.
 * Ingredient gate uses English Spoonacular names before translation (approach a).
 */

/**
 * @typedef {{ maxMainIngredients: number, maxReadyTime: number, maxSteps: number, noCooking?: boolean }} MealSimplicityRules
 * @type {Record<string, MealSimplicityRules>}
 */
export const MEAL_SIMPLICITY_RULES = Object.freeze({
  snidane: { maxMainIngredients: 4, maxReadyTime: 10, maxSteps: 4 },
  svacina: { maxMainIngredients: 3, maxReadyTime: 5, maxSteps: 99, noCooking: true },
  obed: { maxMainIngredients: 6, maxReadyTime: 20, maxSteps: 5 },
  vecere: { maxMainIngredients: 6, maxReadyTime: 20, maxSteps: 5 },
});

/** Seasonings excluded from main-ingredient count (Czech catalog / DB parity). */
export const SEASONINGS = Object.freeze([
  'sůl',
  'pepř',
  'olej',
  'olivový olej',
  'voda',
  'cukr',
  'mletý pepř',
  'mořská sůl',
  'bazalka',
  'oregano',
  'tymián',
  'kmín',
  'skořice',
  'kurkuma',
  'koriandr',
  'petržel',
  'česnek',
  'jedlá soda',
  'prášek do pečiva',
  'vanilkový extrakt',
  'ocet',
]);

/** English spice allowlist for Spoonacular ingredient names (gate runs pre-translation). */
const SEASONING_EN_ALIASES = Object.freeze([
  'salt',
  'pepper',
  'black pepper',
  'ground pepper',
  'oil',
  'olive oil',
  'water',
  'sugar',
  'sea salt',
  'basil',
  'oregano',
  'thyme',
  'cumin',
  'cinnamon',
  'turmeric',
  'coriander',
  'parsley',
  'garlic',
  'baking soda',
  'baking powder',
  'vanilla extract',
  'vinegar',
]);

/**
 * @param {string} catalogMealType
 * @returns {MealSimplicityRules}
 */
export function getMealSimplicityRules(catalogMealType) {
  const key = String(catalogMealType || 'obed').trim().toLowerCase();
  return MEAL_SIMPLICITY_RULES[key] || MEAL_SIMPLICITY_RULES.obed;
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeIngredientName(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @type {string[]} */
const SEASONINGS_NORMALIZED = [...SEASONINGS, ...SEASONING_EN_ALIASES]
  .map((s) => normalizeIngredientName(s))
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

/**
 * @param {string} ingredientName
 * @returns {boolean}
 */
export function isSeasoningIngredient(ingredientName) {
  const n = normalizeIngredientName(ingredientName);
  if (!n) return false;
  for (const s of SEASONINGS_NORMALIZED) {
    if (n === s) return true;
    if (n.startsWith(`${s} `) || n.endsWith(` ${s}`)) return true;
    if (s.includes(' ') && n.includes(s)) return true;
  }
  return false;
}

/**
 * @param {unknown[]|Record<string, unknown>} ingredientsOrRecipe
 * @returns {number}
 */
export function countMainIngredients(ingredientsOrRecipe) {
  /** @type {unknown[]} */
  let ings = [];
  if (Array.isArray(ingredientsOrRecipe)) {
    ings = ingredientsOrRecipe;
  } else if (
    ingredientsOrRecipe
    && typeof ingredientsOrRecipe === 'object'
    && Array.isArray(/** @type {{ extendedIngredients?: unknown[] }} */ (ingredientsOrRecipe).extendedIngredients)
  ) {
    ings = /** @type {{ extendedIngredients: unknown[] }} */ (ingredientsOrRecipe).extendedIngredients;
  }

  let count = 0;
  for (const ing of ings) {
    const name = String(/** @type {{ nameClean?: string, name?: string, name_en?: string }} */ (ing)?.nameClean
      || /** @type {{ name?: string }} */ (ing)?.name
      || /** @type {{ name_en?: string }} */ (ing)?.name_en
      || '').trim();
    if (!isSeasoningIngredient(name)) count += 1;
  }
  return count;
}

/**
 * @param {string} catalogMealType
 * @returns {number}
 */
export function getMainIngredientLimit(catalogMealType) {
  return getMealSimplicityRules(catalogMealType).maxMainIngredients;
}

/**
 * @param {string} title
 * @returns {boolean}
 */
export function isNotARecipeTitle(title) {
  const t = String(title || '').trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  if (/^how to\b/.test(lower)) return true;
  if (/^how\s/.test(lower)) return true;
  if (/\bways to\b/.test(lower)) return true;
  if (/\bbest ways\b/.test(lower)) return true;
  if (/\bthings to\b/.test(lower)) return true;
  if (/\bhacks\b/.test(lower)) return true;
  if (/\btips\b/.test(lower)) return true;
  if (/\bguide\b/.test(lower)) return true;
  if (t.includes('?')) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string|null|undefined} name
 * @returns {number|null}
 */
export function nutrientAmount(recipe, name) {
  const nutrients = recipe?.nutrition?.nutrients;
  if (!Array.isArray(nutrients)) return null;
  const hit = nutrients.find((n) => n && n.name === name);
  if (hit?.amount == null) return null;
  const val = Number(hit.amount);
  return Number.isFinite(val) ? val : null;
}

/**
 * @param {Record<string, unknown>} recipe
 * @returns {boolean}
 */
export function hasCompleteNutrition(recipe) {
  const kcalRaw = nutrientAmount(recipe, 'Calories') ?? Number(recipe.calories);
  const kcal = Number(kcalRaw);
  if (!Number.isFinite(kcal) || kcal <= 0) return false;
  return nutrientAmount(recipe, 'Protein') != null
    && nutrientAmount(recipe, 'Carbohydrates') != null
    && nutrientAmount(recipe, 'Fat') != null;
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} catalogMealType
 * @returns {{ pass: boolean, reason: 'not_a_recipe'|'too_complex'|'missing_nutrition'|null }}
 */
export function evaluateImportGate(recipe, catalogMealType) {
  if (isNotARecipeTitle(String(recipe.title || ''))) {
    return { pass: false, reason: 'not_a_recipe' };
  }

  const mainCount = countMainIngredients(recipe);
  const limit = getMainIngredientLimit(catalogMealType);
  if (mainCount > limit) {
    return { pass: false, reason: 'too_complex' };
  }

  if (!hasCompleteNutrition(recipe)) {
    return { pass: false, reason: 'missing_nutrition' };
  }

  return { pass: true, reason: null };
}
