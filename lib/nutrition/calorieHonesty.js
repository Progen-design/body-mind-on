/**
 * Calorie honesty for START meal plans.
 * Nutrition numbers must match what is on the plate — never invent kcal via portion_multiplier.
 */
import { SIMPLE_START_RECIPES, buildSimpleStartLibraryMeal } from '../simpleStartRecipeLibrary.js';
import { SIMPLE_START_CATALOG_SNAPSHOT } from '../generated/simpleStartCatalogSnapshot.js';
import { mealContainsExcludedFood } from '../dietaryExclusions.js';
import {
  applyPortionScaleToStructuredMeal,
  sumScaledDayKcal,
} from './portionScaling.js';

export const HONEST_MIN_SCALE = 0.85;
export const HONEST_MAX_SCALE = 1.15;
/** Existing plans above this are invalid and should be regenerated. */
export const INFLATION_INVALID_THRESHOLD = 1.2;

export const CALORIE_UNDERRUN_BANNER_CS =
  'Plán zatím nepokryje tvůj kalorický cíl — ukazujeme reálný součet z jídel. Pracujeme na rozšíření nabídky.';

export const CALORIE_INFLATED_BANNER_CS =
  'Tento plán má neplatné porce (kalorické hodnoty neodpovídají surovinám). Přegeneruj plán, ať sedí čísla s tím, co opravdu sníš.';

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mealTypeToEn(value) {
  const t = normalizeTitle(value);
  if (t === 'snidane' || t === 'breakfast') return 'breakfast';
  if (t === 'obed' || t === 'lunch') return 'lunch';
  if (t === 'vecere' || t === 'dinner') return 'dinner';
  if (t === 'svacina' || t === 'snack') return 'snack';
  return 'snack';
}

/**
 * Clamp every meal multiplier into the honest band (mutates meals).
 * @param {object[]} dayMeals
 */
export function clampDayMealsToHonestScale(dayMeals) {
  for (const m of dayMeals || []) {
    if (!Number(m?.kcal)) continue;
    const mult = Number(m.portion_multiplier) || 1;
    if (mult >= HONEST_MIN_SCALE && mult <= HONEST_MAX_SCALE) continue;
    const clamped = Math.min(HONEST_MAX_SCALE, Math.max(HONEST_MIN_SCALE, mult));
    applyPortionScaleToStructuredMeal(m, clamped, {
      allowUnverified: true,
      simpleStartMode: true,
    });
  }
  return dayMeals;
}

/**
 * Mild rebalance within honest caps only — never invent calories beyond 1.15× base.
 * @param {object[]} dayMeals
 * @param {number} dailyTarget
 */
export function balanceDayMealsHonestly(dayMeals, dailyTarget) {
  const target = Number(dailyTarget);
  if (!Number.isFinite(target) || target <= 0 || !dayMeals?.length) return dayMeals;

  clampDayMealsToHonestScale(dayMeals);

  const minSum = Math.round(target * 0.95);
  const maxSum = Math.round(target * 1.05);
  let sum = sumScaledDayKcal(dayMeals);
  if (sum >= minSum && sum <= maxSum) return dayMeals;
  if (sum <= 0) return dayMeals;

  // Cap achievable by max honest scale on each meal
  let maxAchievable = 0;
  let minAchievable = 0;
  for (const m of dayMeals) {
    if (!Number(m?.kcal)) continue;
    const mult = Number(m.portion_multiplier) || 1;
    const base = Number(m.kcal) / mult;
    maxAchievable += base * HONEST_MAX_SCALE;
    minAchievable += base * HONEST_MIN_SCALE;
  }

  let goalSum = Math.round(target);
  if (sum < minSum) goalSum = Math.min(minSum, Math.round(maxAchievable));
  if (sum > maxSum) goalSum = Math.max(maxSum, Math.round(minAchievable));
  if (goalSum === sum) return dayMeals;

  const factor = goalSum / sum;
  for (const m of dayMeals) {
    if (!Number(m?.kcal)) continue;
    const mult = Number(m.portion_multiplier) || 1;
    applyPortionScaleToStructuredMeal(m, mult * factor, {
      allowUnverified: true,
      simpleStartMode: true,
    });
  }
  clampDayMealsToHonestScale(dayMeals);
  return dayMeals;
}

/**
 * Pick next catalog-backed meal to add (prefer snacks), avoiding titles already on the day.
 * Uses computed snapshot macros (same as recipes_catalog), never hand-authored library kcal.
 * @param {Set<string>} usedTitles
 * @param {number} deficitKcal
 */
function pickLibraryMealToAdd(usedTitles, deficitKcal) {
  const byKey = new Map(SIMPLE_START_CATALOG_SNAPSHOT.map((s) => [s.key, s]));
  const pool = [...SIMPLE_START_RECIPES]
    .map((r) => {
      const snap = byKey.get(r.key);
      return {
        ...r,
        meal_type_en: mealTypeToEn(r.meal_type),
        calories: Number(snap?.kcal ?? r.calories) || 0,
        catalog_id: snap?.id ?? null,
        snap,
      };
    })
    .filter((r) => r.calories > 0 && !usedTitles.has(normalizeTitle(r.title)))
    .sort((a, b) => {
      const snackBoost = (x) => (x.meal_type_en === 'snack' ? 0 : 1);
      const da = Math.abs(a.calories - deficitKcal);
      const db = Math.abs(b.calories - deficitKcal);
      return snackBoost(a) - snackBoost(b) || da - db;
    });
  return pool[0] || null;
}

/**
 * Fill calorie deficit by ADDING catalog meals (not inflating portions).
 * Mutates dayMeals. Returns honesty summary for the day.
 * @param {object[]} dayMeals
 * @param {number} dailyTarget
 * @param {{ maxExtraMeals?: number }} [opts]
 */
export function fillDayCaloriesByAddingLibraryMeals(dayMeals, dailyTarget, opts = {}) {
  const target = Number(dailyTarget) || 0;
  const maxExtra = opts.maxExtraMeals ?? 4;
  const exclusions = opts.exclusions || null;
  clampDayMealsToHonestScale(dayMeals);
  balanceDayMealsHonestly(dayMeals, target);

  const usedTitles = new Set(
    (dayMeals || []).map((m) => normalizeTitle(m.display_name_cs || m.name_cs))
  );

  let added = 0;
  let sum = sumScaledDayKcal(dayMeals);
  const minGoal = Math.round(target * 0.95);

  while (target > 0 && sum < minGoal && added < maxExtra) {
    const deficit = minGoal - sum;
    const pick = pickLibraryMealToAdd(usedTitles, deficit);
    if (!pick) break;

    const meal = buildSimpleStartLibraryMeal(pick.title, pick.meal_type_en || pick.meal_type, {
      planner_source: 'calorie_honesty_fill',
    });
    if (!meal) break;

    // Overlay computed catalog nutrition + catalog_id (single source of truth).
    if (pick.snap) {
      meal.kcal = pick.snap.kcal;
      meal.protein_g = pick.snap.protein_g;
      meal.carbs_g = pick.snap.carbs_g;
      meal.fat_g = pick.snap.fat_g;
      meal.catalog_id = pick.snap.id;
      meal.catalog_source = 'simple_start';
      meal.recipe_id = pick.snap.id;
      if (meal.recipe) {
        meal.recipe.id = pick.snap.id;
        meal.recipe.calories = pick.snap.kcal;
        meal.recipe.protein_g = pick.snap.protein_g;
        meal.recipe.carbs_g = pick.snap.carbs_g;
        meal.recipe.fat_g = pick.snap.fat_g;
        meal.recipe.source = 'simple_start';
      }
    }

    if (exclusions && mealContainsExcludedFood(meal, exclusions)) {
      usedTitles.add(normalizeTitle(pick.title));
      continue;
    }

    meal.portion_multiplier = 1;
    if (meal.recipe) meal.recipe.portion_multiplier = 1;
    meal.type = pick.meal_type_en || 'snack';
    meal.calorie_honesty_added = true;

    dayMeals.push(meal);
    usedTitles.add(normalizeTitle(meal.display_name_cs || meal.name_cs));
    added += 1;
    sum = sumScaledDayKcal(dayMeals);
  }

  clampDayMealsToHonestScale(dayMeals);
  sum = sumScaledDayKcal(dayMeals);
  const shortfall = target > 0 ? Math.max(0, Math.round(target - sum)) : 0;
  const underTarget = target > 0 && sum < Math.round(target * 0.95);

  return {
    achieved_kcal: Math.round(sum),
    target_kcal: Math.round(target) || null,
    under_target: underTarget,
    shortfall_kcal: shortfall,
    meals_added: added,
  };
}

/**
 * Max portion_multiplier across plan meals.
 * @param {object|null|undefined} structuredPlan
 */
export function maxPortionMultiplierInPlan(structuredPlan) {
  let max = 0;
  for (const day of structuredPlan?.days || []) {
    for (const m of day.meals || []) {
      const mult = Number(m?.portion_multiplier ?? m?.recipe?.portion_multiplier) || 1;
      if (mult > max) max = mult;
    }
  }
  return max;
}

/**
 * True if any meal uses inflated portion multiplier (legacy lie).
 * @param {object|null|undefined} structuredPlan
 */
export function planHasInflatedPortions(structuredPlan) {
  return maxPortionMultiplierInPlan(structuredPlan) > INFLATION_INVALID_THRESHOLD;
}

/**
 * Attach calorie_honesty metadata to structured plan (mutates).
 * @param {object} structuredPlan
 * @param {object[]} daySummaries — from fillDayCaloriesByAddingLibraryMeals
 */
export function attachCalorieHonestyToPlan(structuredPlan, daySummaries = []) {
  if (!structuredPlan || typeof structuredPlan !== 'object') return structuredPlan;
  const underAny = daySummaries.some((d) => d?.under_target);
  const avgAchieved = daySummaries.length
    ? Math.round(daySummaries.reduce((s, d) => s + (Number(d.achieved_kcal) || 0), 0) / daySummaries.length)
    : null;
  const target = Number(structuredPlan?.targets?.calories_per_day)
    || (daySummaries[0]?.target_kcal ?? null);

  structuredPlan.calorie_honesty = {
    version: 1,
    max_portion_multiplier_allowed: HONEST_MAX_SCALE,
    min_portion_multiplier_allowed: HONEST_MIN_SCALE,
    plan_under_target: underAny,
    avg_achieved_kcal: avgAchieved,
    target_kcal: target != null ? Math.round(Number(target)) : null,
    days: daySummaries,
    banner_cs: underAny ? CALORIE_UNDERRUN_BANNER_CS : null,
  };

  // Persist per-day achieved totals for UI/email consistency
  for (let i = 0; i < (structuredPlan.days || []).length; i++) {
    const day = structuredPlan.days[i];
    const summary = daySummaries[i];
    if (!day || !summary) continue;
    day.daily_achieved_kcal = summary.achieved_kcal;
    day.calorie_under_target = summary.under_target === true;
    day.calorie_shortfall_kcal = summary.shortfall_kcal;
  }

  return structuredPlan;
}

/**
 * UI/API helper: honesty status for an existing stored plan.
 * @param {object|null|undefined} structuredPlan
 */
export function getPlanCalorieHonestyStatus(structuredPlan) {
  const inflated = planHasInflatedPortions(structuredPlan);
  const meta = structuredPlan?.calorie_honesty || null;
  const underTarget = meta?.plan_under_target === true
    || (structuredPlan?.days || []).some((d) => d?.calorie_under_target === true);

  let avgAchieved = meta?.avg_achieved_kcal ?? null;
  if (avgAchieved == null && structuredPlan?.days?.length) {
    const daySums = structuredPlan.days.map((d) => sumScaledDayKcal(d.meals || [])).filter((n) => n > 0);
    if (daySums.length) {
      avgAchieved = Math.round(daySums.reduce((a, b) => a + b, 0) / daySums.length);
    }
  }

  const target = Number(meta?.target_kcal ?? structuredPlan?.targets?.calories_per_day) || null;

  return {
    invalid_inflated: inflated,
    under_target: !inflated && underTarget,
    max_multiplier: maxPortionMultiplierInPlan(structuredPlan),
    avg_achieved_kcal: avgAchieved,
    target_kcal: target,
    banner_cs: inflated
      ? CALORIE_INFLATED_BANNER_CS
      : (underTarget ? CALORIE_UNDERRUN_BANNER_CS : null),
  };
}
