/**
 * lib/nutrition/portionScaling.js
 * Rozložení denního kalorického cíle na sloty a škálování porcí z nominálních kcal receptu.
 */
import { sortCatalogRowsForSimplePick } from '../recipeSimplicityScore.js';
import { filterCatalogCandidatesForStartPlan, filterCatalogCandidatesForAgentSlot } from '../startSimpleMealFilter.js';

/** @typedef {'snidane'|'obed'|'vecere'|'svacina'} CatalogMealType */

export const MEAL_WEIGHTS = {
  3: { snidane: 0.3, obed: 0.4, vecere: 0.3 },
  4: { snidane: 0.25, obed: 0.35, vecere: 0.3, svacina: 0.1 },
};

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.0;

/**
 * @param {number} dailyTarget
 * @param {number} mealsPerDay
 * @param {CatalogMealType|string} mealType
 * @returns {number}
 */
export function slotTargetKcal(dailyTarget, mealsPerDay, mealType) {
  const n = Math.max(2, Math.min(6, Number(mealsPerDay) || 3));
  const weights = MEAL_WEIGHTS[n] || MEAL_WEIGHTS[3];
  const w = weights[mealType] ?? 1 / n;
  return Math.round(Number(dailyTarget) * w);
}

/**
 * @param {object|null|undefined} recipe
 * @param {number} target
 * @returns {object}
 */
export function scaleMealToTarget(recipe, target) {
  if (!recipe?.kcal || Number(recipe.kcal) <= 0) return { ...recipe };
  const raw = Number(target) / Number(recipe.kcal);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
  const r = (n) => Math.round((Number(n) || 0) * scale * 10) / 10;
  return {
    ...recipe,
    portion_multiplier: Math.round(scale * 100) / 100,
    kcal: Math.round(Number(recipe.kcal) * scale),
    protein_g: r(recipe.protein_g),
    carbs_g: r(recipe.carbs_g),
    fat_g: r(recipe.fat_g),
  };
}

/**
 * Plan slot type → catalog meal type pro MEAL_WEIGHTS.
 * @param {string} planMealType
 * @returns {CatalogMealType}
 */
export function planMealTypeToWeightKey(planMealType) {
  const t = String(planMealType || 'lunch').toLowerCase();
  if (t === 'breakfast') return 'snidane';
  if (t === 'dinner') return 'vecere';
  if (t === 'snack') return 'svacina';
  return 'obed';
}

/**
 * Z kandidátů vybere řádek s nominálními kcal nejblíže cíli slotu.
 * @param {object[]} rows
 * @param {number} slotTarget
 * @returns {object|null}
 */
export function pickClosestCatalogRow(rows, slotTarget, opts = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const mealType = opts.mealType || 'lunch';
  let pool = rows;
  if (opts.simpleStartMode && opts.slotMeal) {
    pool = filterCatalogCandidatesForAgentSlot(pool, opts.slotMeal).kept;
  } else if (opts.simpleStartMode) {
    pool = filterCatalogCandidatesForStartPlan(pool, mealType).kept;
  }
  const sorted = sortCatalogRowsForSimplePick(pool, slotTarget, mealType);
  return sorted[0] ?? pool[0] ?? null;
}

/** @param {number} seed */
export function seededPickIndex(seed, salt, max) {
  if (!max || max <= 0) return 0;
  let h = (Number(seed) >>> 0) ^ (Math.imul(Number(salt) >>> 0, 2654435761));
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h >>> 0) % max;
}

/**
 * Vybere z TOP-K kandidátů nejblíže cíli (seedovaná variabilita per uživatel/týden/slot).
 * @param {object[]} rows
 * @param {number} slotTarget
 * @param {number} seed
 * @param {number} slotSalt
 * @param {number} [topK=5]
 * @returns {object|null}
 */
export function pickFromTopKCatalogRow(rows, slotTarget, seed, slotSalt, topK = 5, opts = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const mealType = opts.mealType || 'lunch';
  let pool = rows;
  if (opts.simpleStartMode && opts.slotMeal) {
    const filtered = filterCatalogCandidatesForAgentSlot(pool, opts.slotMeal);
    if (filtered.excluded.length) {
      console.log('[catalog-simple-start] excluded reason (agent slot)', {
        mealType,
        agent_name: opts.slotMeal?.name_cs ?? null,
        count: filtered.excluded.length,
        sample: filtered.excluded.slice(0, 4),
      });
    }
    pool = filtered.kept;
  } else if (opts.simpleStartMode) {
    pool = filterCatalogCandidatesForStartPlan(pool, mealType).kept;
  }
  if (!pool.length) return null;
  const sorted = sortCatalogRowsForSimplePick(pool, slotTarget, mealType);
  const k = Math.min(Math.max(1, topK), sorted.length);
  const topPool = sorted.slice(0, k);
  const idx = seededPickIndex(seed, slotSalt, topPool.length);
  return topPool[idx] ?? topPool[0];
}

/**
 * Součet škálovaných kcal z pole meal objektů.
 * @param {object[]} meals
 * @returns {number}
 */
export function sumScaledDayKcal(meals) {
  return (meals || []).reduce((s, m) => s + (Number(m?.kcal) || 0), 0);
}

/**
 * @param {object} meal
 * @param {number} newMultiplier
 */
export function applyPortionScaleToStructuredMeal(meal, newMultiplier) {
  if (!meal?.recipe_verified || !Number(meal?.kcal)) return meal;
  const oldMult = Number(meal.portion_multiplier) || 1;
  const baseKcal = Number(meal.kcal) / oldMult;
  if (!Number.isFinite(baseKcal) || baseKcal <= 0) return meal;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(newMultiplier) || 1));
  meal.portion_multiplier = Math.round(scale * 100) / 100;
  meal.kcal = Math.round(baseKcal * scale);
  const scaleMacroFromBase = (val) => Math.round(((Number(val) || 0) / oldMult) * scale * 10) / 10;
  meal.protein_g = scaleMacroFromBase(meal.protein_g);
  meal.carbs_g = scaleMacroFromBase(meal.carbs_g);
  meal.fat_g = scaleMacroFromBase(meal.fat_g);
  if (meal.recipe && typeof meal.recipe === 'object') {
    meal.recipe.portion_multiplier = meal.portion_multiplier;
    meal.recipe.calories = meal.kcal;
    meal.recipe.protein_g = meal.protein_g;
    meal.recipe.carbs_g = meal.carbs_g;
    meal.recipe.fat_g = meal.fat_g;
  }
  return meal;
}

/**
 * Po resolve z katalogu zvedne porce dne, aby součet kcal dosáhl minRatio × denní cíl (do MAX_SCALE).
 * @param {object[]} dayMeals
 * @param {number} dailyTarget
 * @param {number} [minRatio=0.85]
 */
export function boostDayMealsToCalorieTarget(dayMeals, dailyTarget, minRatio = 0.85) {
  const targetSum = Math.round(Number(dailyTarget) * minRatio);
  let sum = sumScaledDayKcal(dayMeals);
  if (sum >= targetSum) return dayMeals;

  const verified = (dayMeals || []).filter(
    (m) => m?.recipe_verified
      && Number(m.kcal) > 0
      && m?.catalog_source !== 'simple_start_library'
      && m?.recipe?.source !== 'simple_start_library'
  );
  if (!verified.length) return dayMeals;

  let maxAchievable = 0;
  for (const m of verified) {
    const mult = Number(m.portion_multiplier) || 1;
    const base = Number(m.kcal) / mult;
    maxAchievable += base * MAX_SCALE;
  }
  const goalSum = Math.min(targetSum, maxAchievable);
  if (goalSum <= sum || sum <= 0) return dayMeals;

  const factor = goalSum / sum;
  for (const m of verified) {
    const mult = Number(m.portion_multiplier) || 1;
    applyPortionScaleToStructuredMeal(m, mult * factor);
  }
  return dayMeals;
}
