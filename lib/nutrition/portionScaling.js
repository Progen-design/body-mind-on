/**
 * lib/nutrition/portionScaling.js
 * Rozložení denního kalorického cíle na sloty a škálování porcí.
 * ARCHITECTURAL RULE: nutrition and ingredients always scale together
 * (via atomicPortionScale) — never patch kcal/macros alone.
 */
import { sortCatalogRowsForSimplePick } from '../recipeSimplicityScore.js';
import { filterCatalogCandidatesForStartPlan, filterCatalogCandidatesForAgentSlot } from '../startSimpleMealFilter.js';
import {
  applyAtomicPortionScaleToMeal,
  scalePortionBundle,
} from './atomicPortionScale.js';

/** @typedef {'snidane'|'obed'|'vecere'|'svacina'} CatalogMealType */

export const MEAL_WEIGHTS = {
  3: { snidane: 0.3, obed: 0.4, vecere: 0.3 },
  4: { snidane: 0.25, obed: 0.35, vecere: 0.3, svacina: 0.1 },
  5: { snidane: 0.2, obed: 0.28, vecere: 0.24, svacina: 0.14 },
  6: { snidane: 0.18, obed: 0.26, vecere: 0.22, svacina: 0.12 },
};

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.0;
/** Honest START band — never invent kcal beyond what the plate can reasonably be. */
export const START_MIN_SCALE = 0.85;
export const START_MAX_SCALE = 1.15;

/** Max odchylka denního součtu kcal od cíle dne (±5 %). */
export const DAY_CALORIE_TOLERANCE = 0.05;
export const DAY_CALORIE_MIN_RATIO = 1 - DAY_CALORIE_TOLERANCE;

/**
 * Deterministický denní cíl s mírným rozptylem (±5 %) v rámci tolerance škálování.
 */
export function jitteredDailyCalorieTarget(baseTarget, dayIndex, bodyMetrics = {}) {
  const base = Number(baseTarget) || 2200;
  const seed = String(bodyMetrics?.email || bodyMetrics?.user_id || 'start')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const pattern = [-0.05, 0.03, -0.02, 0.04, -0.04, 0.02, -0.01];
  const jitter = pattern[(Number(dayIndex) + seed) % pattern.length];
  return Math.round(base * (1 + jitter));
}

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
 * Compute clamped portion multiplier toward target kcal.
 * @param {number} baseKcal
 * @param {number} target
 * @param {{ simpleStartMode?: boolean }} [opts]
 */
export function clampedPortionMultiplier(baseKcal, target, opts = {}) {
  const base = Number(baseKcal);
  if (!Number.isFinite(base) || base <= 0) return 1;
  const minScale = opts.simpleStartMode ? START_MIN_SCALE : MIN_SCALE;
  const maxScale = opts.simpleStartMode ? START_MAX_SCALE : MAX_SCALE;
  const raw = Number(target) / base;
  return Math.round(Math.min(maxScale, Math.max(minScale, raw)) * 100) / 100;
}

/**
 * Scale a recipe/meal-like object toward a kcal target.
 * ALWAYS returns nutrition + ingredients scaled together (atomicPortionScale).
 * @param {object|null|undefined} recipe
 * @param {number} target
 * @returns {object}
 */
export function scaleMealToTarget(recipe, target, opts = {}) {
  if (!recipe?.kcal || Number(recipe.kcal) <= 0) return { ...recipe };
  const fromMult = Number(recipe.portion_multiplier) || 1;
  const baseKcal = Number(recipe.kcal) / fromMult;
  const toMult = clampedPortionMultiplier(baseKcal, target, opts);
  return scalePortionBundle(
    {
      ...recipe,
      kcal: recipe.kcal,
      protein_g: recipe.protein_g,
      carbs_g: recipe.carbs_g,
      fat_g: recipe.fat_g,
      ingredients: recipe.ingredients,
      shopping_ingredient_lines: recipe.shopping_ingredient_lines,
    },
    fromMult,
    toMult
  );
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
 * Apply a new portion multiplier to a structured meal.
 * Nutrition + ingredients scale together — there is no nutrition-only path.
 * @param {object} meal
 * @param {number} newMultiplier
 */
export function applyPortionScaleToStructuredMeal(meal, newMultiplier, opts = {}) {
  const isSimpleStart = meal?.catalog_source === 'simple_start_library'
    || meal?.catalog_source === 'simple_start_fallback'
    || meal?.catalog_source === 'simple_start'
    || meal?.catalog_source === 'meal_cache'
    || meal?.recipe?.source === 'simple_start_library'
    || meal?.recipe?.source === 'simple_start_fallback'
    || meal?.recipe?.source === 'simple_start'
    || meal?.calorie_honesty_added === true;
  if (!Number(meal?.kcal) && !Number(meal?.recipe?.calories)) return meal;
  if (!meal?.recipe_verified && !isSimpleStart && !opts.allowUnverified) return meal;

  const useStartBand = opts.simpleStartMode || isSimpleStart;
  const minScale = useStartBand ? START_MIN_SCALE : MIN_SCALE;
  const maxScale = useStartBand ? START_MAX_SCALE : MAX_SCALE;
  const scale = Math.min(maxScale, Math.max(minScale, Number(newMultiplier) || 1));
  return applyAtomicPortionScaleToMeal(meal, scale);
}

function isSimpleStartMeal(m) {
  return m?.catalog_source === 'simple_start_library'
    || m?.catalog_source === 'simple_start_fallback'
    || m?.catalog_source === 'simple_start'
    || m?.catalog_source === 'meal_cache'
    || m?.recipe?.source === 'simple_start_library'
    || m?.recipe?.source === 'simple_start_fallback'
    || m?.recipe?.source === 'simple_start'
    || m?.calorie_honesty_added === true;
}

/**
 * Po resolve z katalogu zvedne porce dne v rámci povoleného bandu (START max 1.15×).
 * Pro START deficit řeš add-meal (calorieHonesty) — tato funkce kcal nevymýšlí.
 * @param {object[]} dayMeals
 * @param {number} dailyTarget
 * @param {number} [minRatio=DAY_CALORIE_MIN_RATIO]
 */
export function boostDayMealsToCalorieTarget(dayMeals, dailyTarget, minRatio = DAY_CALORIE_MIN_RATIO) {
  const targetSum = Math.round(Number(dailyTarget) * minRatio);
  let sum = sumScaledDayKcal(dayMeals);
  if (sum >= targetSum) return dayMeals;

  const boostable = (dayMeals || []).filter((m) => Number(m?.kcal) > 0);
  if (!boostable.length) return dayMeals;

  let maxAchievable = 0;
  for (const m of boostable) {
    const mult = Number(m.portion_multiplier) || 1;
    const base = Number(m.kcal) / mult;
    maxAchievable += base * (isSimpleStartMeal(m) ? START_MAX_SCALE : MAX_SCALE);
  }
  const goalSum = Math.min(targetSum, maxAchievable);
  if (goalSum <= sum || sum <= 0) return dayMeals;

  const factor = goalSum / sum;
  for (const m of boostable) {
    const mult = Number(m.portion_multiplier) || 1;
    applyPortionScaleToStructuredMeal(m, mult * factor, {
      allowUnverified: true,
      simpleStartMode: isSimpleStartMeal(m),
    });
  }
  return dayMeals;
}

/**
 * Vyrovná denní součet kcal do tolerance okolo cíle (START plán).
 * @param {object[]} dayMeals
 * @param {number} dailyTarget
 * @param {number} [tolerance=DAY_CALORIE_TOLERANCE]
 */
export function balanceDayMealsToCalorieTarget(dayMeals, dailyTarget, tolerance = DAY_CALORIE_TOLERANCE) {
  const target = Number(dailyTarget);
  if (!Number.isFinite(target) || target <= 0 || !dayMeals?.length) return dayMeals;

  const minSum = Math.round(target * (1 - tolerance));
  const maxSum = Math.round(target * (1 + tolerance));
  let sum = sumScaledDayKcal(dayMeals);
  if (sum >= minSum && sum <= maxSum) return dayMeals;

  let goalSum = Math.round(target);
  if (sum < minSum) goalSum = Math.max(minSum, goalSum);
  if (sum > maxSum) goalSum = Math.min(maxSum, goalSum);
  if (sum <= 0) return dayMeals;

  const factor = goalSum / sum;
  for (const m of dayMeals) {
    if (Number(m?.kcal) <= 0) continue;
    const mult = Number(m.portion_multiplier) || 1;
    applyPortionScaleToStructuredMeal(m, mult * factor, {
      allowUnverified: true,
      simpleStartMode: isSimpleStartMeal(m),
    });
  }

  sum = sumScaledDayKcal(dayMeals);
  if (sum < minSum || sum > maxSum) {
    // Never invent past max band — only clamp down when over; leave honest underrun as-is.
    if (sum <= maxSum) return dayMeals;
    const clampFactor = maxSum / (sum || 1);
    for (const m of dayMeals) {
      if (Number(m?.kcal) <= 0) continue;
      const mult = Number(m.portion_multiplier) || 1;
      applyPortionScaleToStructuredMeal(m, mult * clampFactor, {
        allowUnverified: true,
        simpleStartMode: isSimpleStartMeal(m),
      });
    }
  }
  return dayMeals;
}
