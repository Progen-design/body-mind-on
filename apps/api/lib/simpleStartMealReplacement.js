/**
 * START náhrada jídla z lokální knihovny (bez Spoonacular).
 */
import { START_MEAL_TEMPLATES } from './services/simpleMealPlannerAgent.js';
import { resolveSimpleStartTitle, SIMPLE_START_RECIPES } from './simpleStartRecipeLibrary.js';
import {
  parseDietaryExclusions,
  isTemplateAllowedForExclusions,
  mealContainsExcludedFood,
} from './dietaryExclusions.js';
import { buildSimpleStartLibraryMeal } from './simpleStartRecipeLibrary.js';

function dietKey(bodyMetrics) {
  const d = String(bodyMetrics?.diet_type || 'standard').toLowerCase();
  if (d === 'vegan') return 'vegan';
  if (d === 'vegetarian') return 'vegetarian';
  return 'standard';
}

function normalizeTitle(value) {
  return resolveSimpleStartTitle(String(value || '').trim()) || String(value || '').trim();
}

/**
 * @param {object} params
 * @param {string} params.mealType
 * @param {string} params.currentTitle
 * @param {object} params.bodyMetrics
 * @param {string[]} [params.excludeTitles]
 * @param {number} [params.targetKcal]
 */
export function pickSimpleStartMealAlternative({
  mealType,
  currentTitle,
  bodyMetrics = {},
  excludeTitles = [],
  targetKcal = null,
}) {
  const type = String(mealType || 'lunch').toLowerCase();
  const dk = dietKey(bodyMetrics);
  const pool = START_MEAL_TEMPLATES[dk]?.[type] || START_MEAL_TEMPLATES.standard[type] || [];
  const exclusions = parseDietaryExclusions(bodyMetrics);
  const currentNorm = normalizeTitle(currentTitle).toLowerCase();
  const excluded = new Set(
    [currentNorm, ...excludeTitles.map((t) => normalizeTitle(t).toLowerCase())].filter(Boolean)
  );

  const candidates = [];
  for (const tpl of pool) {
    const title = normalizeTitle(tpl.name_cs);
    if (!title || excluded.has(title.toLowerCase())) continue;
    if (!isTemplateAllowedForExclusions(tpl, exclusions)) continue;
    const lib = SIMPLE_START_RECIPES.find(
      (r) => r.meal_type === type && normalizeTitle(r.title).toLowerCase() === title.toLowerCase()
    );
    const baseKcal = lib?.calories ?? tpl.fallback_meal_template?.kcal ?? 500;
    candidates.push({ tpl, title, baseKcal, lib });
  }

  if (!targetKcal) {
    if (candidates.length) return candidates[0];
    return null;
  }

  candidates.sort((a, b) => Math.abs(a.baseKcal - targetKcal) - Math.abs(b.baseKcal - targetKcal));
  const within = candidates.filter((c) => Math.abs(c.baseKcal - targetKcal) <= targetKcal * 0.2);
  return (within[0] || candidates[0]) ?? null;
}

/**
 * @param {object} params
 */
export function buildReplacementStructuredMeal({
  mealType,
  currentTitle,
  bodyMetrics,
  excludeTitles,
  targetKcal,
}) {
  const picked = pickSimpleStartMealAlternative({
    mealType,
    currentTitle,
    bodyMetrics,
    excludeTitles,
    targetKcal,
  });
  if (!picked) return null;

  const { tpl, title, lib } = picked;
  if (lib) {
    const meal = buildSimpleStartLibraryMeal(title, mealType);
    if (meal && !mealContainsExcludedFood(meal, parseDietaryExclusions(bodyMetrics))) return meal;
  }

  const fb = tpl.fallback_meal_template || {};
  return {
    type: mealType,
    name_cs: title,
    display_name_cs: title,
    display_name: title,
    calories: fb.kcal ?? targetKcal,
    protein_g: fb.protein_g,
    carbs_g: fb.carbs_g,
    fat_g: fb.fat_g,
    kcal: fb.kcal ?? targetKcal,
    catalog_source: 'simple_start_fallback',
    recipe: { source: 'simple_start_fallback', title },
    recipe_verified: true,
    shopping_ingredient_lines: fb.shopping_ingredient_lines || [],
    simple_start_mode: true,
    planner_source: 'meal_replacement',
  };
}
