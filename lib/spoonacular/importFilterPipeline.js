/**
 * Unified import filter pipeline with per-reason accounting (offline-replayable).
 */
import {
  evaluateImportGate,
  nutrientAmount,
} from './catalogImportGate.js';
import { evaluateRecipeSimplicity } from './catalogSimplicity.js';
import { hasTruncatedSource } from './truncatedSource.js';

/**
 * @param {Record<string, unknown>} recipe
 * @param {{ minProtein?: number, maxSugar?: number, maxCalories?: number }} filters
 * @returns {{ pass: boolean, reason: string|null }}
 */
export function evaluateLocalNutritionFilters(recipe, filters = {}) {
  if (filters.minProtein != null) {
    const protein = nutrientAmount(recipe, 'Protein');
    if (protein == null || protein < filters.minProtein) {
      return { pass: false, reason: 'min_protein' };
    }
  }

  if (filters.maxSugar != null) {
    const sugar = nutrientAmount(recipe, 'Sugar');
    if (sugar != null && sugar > filters.maxSugar) {
      return { pass: false, reason: 'max_sugar' };
    }
  }

  if (filters.maxCalories != null) {
    const kcal = nutrientAmount(recipe, 'Calories') ?? Number(recipe.calories);
    if (Number.isFinite(Number(kcal)) && Number(kcal) > filters.maxCalories) {
      return { pass: false, reason: 'max_calories' };
    }
  }

  return { pass: true, reason: null };
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} catalogMealType
 * @param {{ filters?: object, protectedSourceIds?: Set<string>|string[] }} [options]
 * @returns {{ pass: boolean, reason: string|null }}
 */
export function evaluateRecipeForImport(recipe, catalogMealType, options = {}) {
  const gate = evaluateImportGate(recipe, catalogMealType);
  if (!gate.pass) {
    return { pass: false, reason: gate.reason || 'too_complex' };
  }

  const sourceId = String(recipe.id ?? '').trim();
  const protectedIds = options.protectedSourceIds instanceof Set
    ? options.protectedSourceIds
    : new Set((Array.isArray(options.protectedSourceIds) ? options.protectedSourceIds : [])
      .map((id) => String(id || '').trim()).filter(Boolean));
  if (sourceId && protectedIds.has(sourceId)) {
    return { pass: false, reason: 'protected' };
  }

  const local = evaluateLocalNutritionFilters(recipe, options.filters || {});
  if (!local.pass) {
    return { pass: false, reason: local.reason };
  }

  const simplicity = evaluateRecipeSimplicity(recipe, catalogMealType);
  if (!simplicity.pass) {
    return { pass: false, reason: simplicity.reason || 'simplicity_rejected' };
  }

  // Useknutý zdroj se nedá správně přeložit — model chybějící konec dopíše nebo
  // okomentuje a uživatel to uvidí jako fakt. Radši ho dovnitř nepustit.
  if (hasTruncatedSource(recipe)) {
    return { pass: false, reason: 'truncated_source' };
  }

  return { pass: true, reason: null };
}

/**
 * @param {Record<string, unknown>[]} recipes
 * @param {string} catalogMealType
 * @param {{ filters?: object, protectedSourceIds?: Set<string>|string[] }} [options]
 * @returns {{
 *   kept: Record<string, unknown>[],
 *   skipped: Array<{ recipe: Record<string, unknown>, reason: string }>,
 *   reasonCounts: Record<string, number>,
 * }}
 */
export function filterRecipesForImport(recipes, catalogMealType, options = {}) {
  /** @type {Record<string, unknown>[]} */
  const kept = [];
  /** @type {Array<{ recipe: Record<string, unknown>, reason: string }>} */
  const skipped = [];
  /** @type {Record<string, number>} */
  const reasonCounts = {};

  for (const recipe of recipes || []) {
    const evaluation = evaluateRecipeForImport(recipe, catalogMealType, options);
    if (evaluation.pass) {
      kept.push(recipe);
    } else {
      const reason = evaluation.reason || 'unknown';
      skipped.push({ recipe, reason });
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }

  return { kept, skipped, reasonCounts };
}

/**
 * Merge reason count maps.
 *
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 * @returns {Record<string, number>}
 */
export function mergeReasonCounts(a, b) {
  /** @type {Record<string, number>} */
  const out = { ...a };
  for (const [key, val] of Object.entries(b || {})) {
    out[key] = (out[key] || 0) + val;
  }
  return out;
}
