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

/** @type {Set<string>|null} */
let activePantrySet = null;

/**
 * Inject pantry names loaded from DB for this import run.
 *
 * @param {Set<string>|null} set
 */
export function setActivePantrySet(set) {
  activePantrySet = set;
}

/** @type {string[]} */
const FALLBACK_SEASONINGS_NORMALIZED = [...SEASONINGS, ...SEASONING_EN_ALIASES]
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

  const list = activePantrySet && activePantrySet.size > 0
    ? [...activePantrySet].sort((a, b) => b.length - a.length)
    : FALLBACK_SEASONINGS_NORMALIZED;

  for (const s of list) {
    if (n === s) return true;
    if (s.includes(' ')) {
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
      if (re.test(n)) return true;
    }
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

/** @typedef {'not_a_recipe'|'too_complex'|'missing_nutrition'|'protected'} ImportGateSkipReason */
/** @typedef {{ recipe: Record<string, unknown>, reason: ImportGateSkipReason }} ImportGateSkippedItem */
/** @typedef {{ fetched: number, imported: number, skipped_complex: number, skipped_not_recipe: number, skipped_missing_nutrition: number, skipped_protected: number }} ImportGateBatchSummary */

/**
 * Pure batch gate — no network, no Supabase. Runs evaluateImportGate + protected skip.
 *
 * @param {Record<string, unknown>[]} recipes
 * @param {string} catalogMealType
 * @param {Set<string>|string[]|undefined} protectedSourceIds
 * @returns {{ kept: Record<string, unknown>[], skipped: ImportGateSkippedItem[], summary: ImportGateBatchSummary }}
 */
export function applyImportGateBatch(recipes, catalogMealType, protectedSourceIds = undefined) {
  /** @type {Set<string>} */
  const protectedIds = protectedSourceIds instanceof Set
    ? protectedSourceIds
    : new Set(
      (Array.isArray(protectedSourceIds) ? protectedSourceIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    );

  /** @type {Record<string, unknown>[]} */
  const kept = [];
  /** @type {ImportGateSkippedItem[]} */
  const skipped = [];
  let skippedComplex = 0;
  let skippedNotRecipe = 0;
  let skippedMissingNutrition = 0;
  let skippedProtected = 0;

  const list = Array.isArray(recipes) ? recipes : [];

  for (const recipe of list) {
    const typed = /** @type {Record<string, unknown>} */ (recipe);
    const gate = evaluateImportGate(typed, catalogMealType);
    if (!gate.pass) {
      const reason = gate.reason || 'too_complex';
      skipped.push({ recipe: typed, reason });
      if (reason === 'too_complex') skippedComplex += 1;
      else if (reason === 'not_a_recipe') skippedNotRecipe += 1;
      else if (reason === 'missing_nutrition') skippedMissingNutrition += 1;
      continue;
    }

    const sourceId = String(typed.id ?? '').trim();
    if (sourceId && protectedIds.has(sourceId)) {
      skipped.push({ recipe: typed, reason: 'protected' });
      skippedProtected += 1;
      continue;
    }

    kept.push(typed);
  }

  return {
    kept,
    skipped,
    summary: {
      fetched: list.length,
      imported: kept.length,
      skipped_complex: skippedComplex,
      skipped_not_recipe: skippedNotRecipe,
      skipped_missing_nutrition: skippedMissingNutrition,
      skipped_protected: skippedProtected,
    },
  };
}
