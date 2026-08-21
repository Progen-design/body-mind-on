/**
 * Reconstruct Spoonacular-shaped recipe payload from recipes_catalog row (offline replay).
 */
import { extractInstructionStepsEn } from './instructionSteps.js';

/**
 * @typedef {{
 *   id: string|number,
 *   source_id: string,
 *   name_cs: string|null,
 *   name_en: string|null,
 *   meal_type: string,
 *   active: boolean,
 *   prep_type: string|null,
 *   servings: number|null,
 *   kcal: number|null,
 *   protein_g: number|null,
 *   carbs_g: number|null,
 *   fat_g: number|null,
 *   ingredients: unknown,
 *   instructions: unknown,
 * }} CatalogRow

/**
 * @param {CatalogRow} row
 * @returns {{ recipe: Record<string, unknown>, issues: string[], stepCount: number, mainIngredientCount: number|null }}
 */
export function catalogRowToFilterInput(row) {
  /** @type {string[]} */
  const issues = [];

  const sourceId = String(row.source_id ?? row.id ?? '').trim();
  if (!sourceId) issues.push('missing_source_id');

  const title = String(row.name_en || row.name_cs || '').trim();
  if (!title) issues.push('missing_title');

  const mealType = String(row.meal_type || '').trim();
  if (!mealType) issues.push('missing_meal_type');

  /** @type {Array<Record<string, unknown>>} */
  let extendedIngredients = [];
  if (!Array.isArray(row.ingredients)) {
    issues.push('missing_ingredients');
  } else if (row.ingredients.length === 0) {
    issues.push('empty_ingredients');
  } else {
    extendedIngredients = row.ingredients.map((ing) => {
      if (!ing || typeof ing !== 'object') {
        issues.push('invalid_ingredient_element');
        return { name: '', name_en: '', nameClean: '' };
      }
      const nameCs = String(ing.name || '').trim();
      const nameEn = String(ing.name_en || ing.nameClean || nameCs || '').trim();
      if (!nameEn && !nameCs) issues.push('ingredient_missing_name');
      return {
        name: nameCs || nameEn,
        name_en: nameEn || nameCs,
        nameClean: nameEn || nameCs,
      };
    });
  }

  let analyzedInstructions = null;
  if (row.instructions == null) {
    issues.push('missing_instructions');
  } else if (!Array.isArray(row.instructions)) {
    issues.push('invalid_instructions_type');
  } else if (row.instructions.length === 0) {
    issues.push('empty_instructions');
    analyzedInstructions = [];
  } else {
    analyzedInstructions = row.instructions;
  }

  /** @type {Array<{ name: string, amount: number }>} */
  const nutrients = [];
  if (row.kcal == null || Number(row.kcal) <= 0) {
    issues.push('missing_kcal');
  } else {
    nutrients.push({ name: 'Calories', amount: Number(row.kcal) });
  }
  if (row.protein_g == null) {
    issues.push('missing_protein_g');
  } else {
    nutrients.push({ name: 'Protein', amount: Number(row.protein_g) });
  }
  if (row.carbs_g == null) {
    issues.push('missing_carbs_g');
  } else {
    nutrients.push({ name: 'Carbohydrates', amount: Number(row.carbs_g) });
  }
  if (row.fat_g == null) {
    issues.push('missing_fat_g');
  } else {
    nutrients.push({ name: 'Fat', amount: Number(row.fat_g) });
  }

  if (row.servings == null) {
    issues.push('missing_servings_defaulted_1');
  }

  // readyInMinutes is not stored in recipes_catalog — explicit gap, no silent default.
  issues.push('missing_ready_in_minutes');

  const recipe = {
    id: sourceId || row.id,
    title,
    extendedIngredients,
    analyzedInstructions,
    nutrition: { nutrients },
    readyInMinutes: undefined,
    servings: row.servings != null ? Number(row.servings) : 1,
    prep_type: row.prep_type ?? null,
    _catalog_id: row.id,
    _catalog_active: row.active,
    _mapping_issues: [...new Set(issues)],
  };

  return {
    recipe,
    issues: [...new Set(issues)],
    stepCount: analyzedInstructions != null
      ? extractInstructionStepsEn(analyzedInstructions).length
      : 0,
    mainIngredientCount: null,
  };
}
