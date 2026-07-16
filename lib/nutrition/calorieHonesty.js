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
import { boostMealWithFlexibleCatchUp } from './atomicPortionScale.js';

export const HONEST_MIN_SCALE = 0.85;
export const HONEST_MAX_SCALE = 1.15;
/** Flexible staples may push a meal slightly above 1.15× base (real grams, not invented). */
export const FLEX_CATCHUP_MAX_SCALE = 1.32;
/** Extra headroom for weakest-day top-up after normal fill. */
export const FLEX_WEAK_DAY_MAX_SCALE = 1.4;
/** Soft UX cap — enough room to fill the day with real meals. */
export const MAX_MEALS_PER_DAY_CAP = 7;
/** Very high TDEE (≥3400). */
export const MAX_MEALS_PER_DAY_CAP_HIGH = 8;
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
 * Extra meals allowed when filling a day deficit.
 * Caps total meals near MAX_MEALS_PER_DAY_CAP — denser snacks close the rest.
 * @param {number} dailyTarget
 * @param {number} [currentMealCount]
 */
export function maxExtraMealsForTarget(dailyTarget, currentMealCount = 0) {
  const t = Number(dailyTarget) || 0;
  const current = Math.max(0, Number(currentMealCount) || 0);
  const cap = t >= 3400 ? MAX_MEALS_PER_DAY_CAP_HIGH : MAX_MEALS_PER_DAY_CAP;
  const room = Math.max(0, cap - current);
  // Prefer filling with real meals (dense snacks) — flex staples only finish the gap
  let want = 2;
  if (t >= 3400) want = 4;
  else if (t >= 3000) want = 3;
  else if (t >= 2600) want = 3;
  else if (t >= 2200) want = 2;
  return Math.min(room, want);
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
    // Flex catch-up may legitimately sit between 1.15 and FLEX_CATCHUP_MAX_SCALE
    if (mult <= FLEX_CATCHUP_MAX_SCALE && (m.flex_catchup_kcal > 0 || mult <= HONEST_MAX_SCALE + 0.15)) {
      continue;
    }
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
 * Push flexible staples on each meal to close remaining day deficit (cookable, honest).
 * @param {object[]} dayMeals
 * @param {number} dailyTarget
 * @param {{ flexMaxScale?: number }} [opts]
 */
export function boostDayMealsWithFlexibleCatchUp(dayMeals, dailyTarget, opts = {}) {
  const target = Number(dailyTarget);
  const flexMax = Number(opts.flexMaxScale) || FLEX_CATCHUP_MAX_SCALE;
  if (!Number.isFinite(target) || target <= 0 || !dayMeals?.length) return dayMeals;

  const minGoal = Math.round(target * 0.95);
  let sum = sumScaledDayKcal(dayMeals);
  if (sum >= minGoal) return dayMeals;

  for (const m of dayMeals) {
    if (!Number(m?.kcal)) continue;
    const mult = Number(m.portion_multiplier) || 1;
    const base = Number(m.kcal) / mult;
    const mealTarget = Math.round(base * flexMax);
    if (Number(m.kcal) < mealTarget - 12) {
      boostMealWithFlexibleCatchUp(m, mealTarget);
    }
  }

  sum = sumScaledDayKcal(dayMeals);
  if (sum >= minGoal) return dayMeals;

  let remaining = minGoal - sum;
  const ranked = [...dayMeals]
    .filter((m) => Number(m?.kcal) > 0)
    .sort((a, b) => Number(b.kcal) - Number(a.kcal));
  for (const m of ranked) {
    if (remaining < 12) break;
    const before = Number(m.kcal) || 0;
    const mult = Number(m.portion_multiplier) || 1;
    const base = before / mult;
    const hardCap = Math.round(base * flexMax);
    const want = Math.min(hardCap, before + remaining);
    boostMealWithFlexibleCatchUp(m, want);
    remaining -= (Number(m.kcal) || 0) - before;
  }
  return dayMeals;
}

/**
 * After per-day fill: push the weakest days harder via flex staples (no new meals).
 * Mutates resolved day objects from resolveMealsFromCatalog.
 * @param {object[]} resolvedDays
 */
export function topUpWeakestDays(resolvedDays) {
  if (!Array.isArray(resolvedDays) || !resolvedDays.length) return resolvedDays;

  for (const day of resolvedDays) {
    const target = Number(day.daily_target_kcal) || Number(day._calorie_honesty?.target_kcal) || 0;
    if (!(target > 0) || !Array.isArray(day.meals)) continue;

    let sum = sumScaledDayKcal(day.meals);
    const minGoal = Math.round(target * 0.95);
    if (sum >= minGoal) continue;

    boostDayMealsWithFlexibleCatchUp(day.meals, target, { flexMaxScale: FLEX_WEAK_DAY_MAX_SCALE });
    sum = sumScaledDayKcal(day.meals);

    // Still short: one last pass on the two largest meals
    if (sum < minGoal) {
      let remaining = minGoal - sum;
      const top = [...day.meals]
        .filter((m) => Number(m?.kcal) > 0)
        .sort((a, b) => Number(b.kcal) - Number(a.kcal))
        .slice(0, 2);
      for (const m of top) {
        if (remaining < 12) break;
        const before = Number(m.kcal) || 0;
        boostMealWithFlexibleCatchUp(m, before + remaining);
        remaining -= (Number(m.kcal) || 0) - before;
      }
      sum = sumScaledDayKcal(day.meals);
    }

    const shortfall = Math.max(0, Math.round(target - sum));
    const under = sum < minGoal;
    day._day_kcal = Math.round(sum);
    day.daily_achieved_kcal = Math.round(sum);
    day.calorie_under_target = under;
    day.calorie_shortfall_kcal = shortfall;
    if (day._calorie_honesty) {
      day._calorie_honesty.achieved_kcal = Math.round(sum);
      day._calorie_honesty.under_target = under;
      day._calorie_honesty.shortfall_kcal = shortfall;
      day._calorie_honesty.weak_day_topup = true;
    }
  }
  return resolvedDays;
}

/**
 * Pick next meal to add (prefer snacks), avoiding titles already on the day.
 * @param {Set<string>} usedTitles
 * @param {number} deficitKcal
 * @param {object[]} [catalogCandidates]
 */
function pickMealToAdd(usedTitles, deficitKcal, catalogCandidates) {
  const preferDense = deficitKcal >= 250;

  if (Array.isArray(catalogCandidates) && catalogCandidates.length) {
    const pool = catalogCandidates
      .filter((r) => {
        const title = normalizeTitle(r.name_cs || r.title || r.name_en);
        const kcal = Number(r.kcal) || 0;
        return title && kcal > 0 && !usedTitles.has(title);
      })
      .sort((a, b) => {
        const typeA = mealTypeToEn(a.meal_type || a.type);
        const typeB = mealTypeToEn(b.meal_type || b.type);
        const snackBoost = (t) => (t === 'snack' || t === 'svacina' ? 0 : 1);
        const kcalA = Number(a.kcal) || 0;
        const kcalB = Number(b.kcal) || 0;
        const denseA = preferDense && kcalA >= 350 ? 0 : 1;
        const denseB = preferDense && kcalB >= 350 ? 0 : 1;
        const proteinA = Number(a.protein_g) || 0;
        const proteinB = Number(b.protein_g) || 0;
        const da = Math.abs(kcalA - deficitKcal);
        const db = Math.abs(kcalB - deficitKcal);
        return snackBoost(typeA) - snackBoost(typeB)
          || denseA - denseB
          || (preferDense ? proteinB - proteinA : 0)
          || (preferDense ? kcalB - kcalA : da - db)
          || da - db;
      });
    if (pool[0]) return { kind: 'catalog', row: pool[0] };
  }

  const byKey = new Map(SIMPLE_START_CATALOG_SNAPSHOT.map((s) => [s.key, s]));
  const pool = [...SIMPLE_START_RECIPES]
    .map((r) => {
      const snap = byKey.get(r.key);
      return {
        ...r,
        meal_type_en: mealTypeToEn(r.meal_type),
        calories: Number(snap?.kcal ?? r.calories) || 0,
        protein_g: Number(snap?.protein_g ?? r.protein_g) || 0,
        catalog_id: snap?.id ?? null,
        snap,
      };
    })
    .filter((r) => r.calories > 0 && !usedTitles.has(normalizeTitle(r.title)))
    .sort((a, b) => {
      const snackBoost = (x) => (x.meal_type_en === 'snack' ? 0 : 1);
      const denseA = preferDense && a.calories >= 350 ? 0 : 1;
      const denseB = preferDense && b.calories >= 350 ? 0 : 1;
      const da = Math.abs(a.calories - deficitKcal);
      const db = Math.abs(b.calories - deficitKcal);
      return snackBoost(a) - snackBoost(b)
        || denseA - denseB
        || (preferDense ? b.protein_g - a.protein_g : 0)
        || (preferDense ? b.calories - a.calories : da - db)
        || da - db;
    });
  return pool[0] ? { kind: 'library', recipe: pool[0] } : null;
}

/**
 * Build a fill meal from a recipes_catalog row without importing recipesCatalog
 * (avoids circular dependency with resolveMealsFromCatalog).
 * @param {object} row
 * @param {string} mealTypeEn
 */
function buildCatalogFillMeal(row, mealTypeEn) {
  const name = String(row.name_cs || row.name_en || 'Svačina').trim();
  const kcal = Math.round(Number(row.kcal) || 0);
  const protein_g = row.protein_g != null ? Number(row.protein_g) : null;
  const carbs_g = row.carbs_g != null ? Number(row.carbs_g) : null;
  const fat_g = row.fat_g != null ? Number(row.fat_g) : null;
  const ingredients = Array.isArray(row.ingredients)
    ? JSON.parse(JSON.stringify(row.ingredients))
    : [];
  const shopping = ingredients.map((i) => {
    if (typeof i === 'string') return i;
    if (i && typeof i === 'object') {
      return String(i.original || `${i.amount ?? ''} ${i.unit || ''} ${i.name || ''}`.trim()).trim();
    }
    return '';
  }).filter(Boolean);

  return {
    type: mealTypeEn || 'snack',
    name_cs: name,
    display_name_cs: name,
    display_name: name,
    recipe_verified: true,
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    portion_multiplier: 1,
    recipe_id: row.id,
    catalog_id: row.id,
    catalog_source: row.source || 'catalog',
    calorie_honesty_added: true,
    planner_source: 'calorie_honesty_fill',
    shopping_ingredient_lines: shopping,
    image_url: row.image_url || null,
    image_trust_level: row.image_url ? 'exact' : 'none',
    recipe: {
      id: row.id,
      title: row.name_en || name,
      title_cs: name,
      image: row.image_url || null,
      calories: kcal,
      protein_g,
      carbs_g,
      fat_g,
      source: row.source || 'catalog',
      portion_multiplier: 1,
      ingredients,
      servings: 1,
    },
  };
}

/**
 * Fill calorie deficit by ADDING catalog meals (not inventing via multiplier).
 * Mutates dayMeals. Returns honesty summary for the day.
 * @param {object[]} dayMeals
 * @param {number} dailyTarget
 * @param {{ maxExtraMeals?: number, exclusions?: object|null, catalogFillCandidates?: object[] }} [opts]
 */
export function fillDayCaloriesByAddingLibraryMeals(dayMeals, dailyTarget, opts = {}) {
  const target = Number(dailyTarget) || 0;
  const maxExtra = opts.maxExtraMeals ?? maxExtraMealsForTarget(target, (dayMeals || []).length);
  const exclusions = opts.exclusions || null;
  const catalogCandidates = opts.catalogFillCandidates || null;

  clampDayMealsToHonestScale(dayMeals);
  balanceDayMealsHonestly(dayMeals, target);
  // Add real meals BEFORE flex catch-up — otherwise staples close the deficit
  // and high-calorie days end up with too few eating occasions.

  const usedTitles = new Set(
    (dayMeals || []).map((m) => normalizeTitle(m.display_name_cs || m.name_cs))
  );
  const usedCatalogIds = new Set(
    (dayMeals || []).map((m) => m.catalog_id).filter((id) => id != null)
  );

  let added = 0;
  let sum = sumScaledDayKcal(dayMeals);
  const minGoal = Math.round(target * 0.95);

  while (target > 0 && sum < minGoal && added < maxExtra) {
    const deficit = minGoal - sum;
    const pick = pickMealToAdd(usedTitles, deficit, catalogCandidates);
    if (!pick) break;

    let meal = null;
    if (pick.kind === 'catalog') {
      const row = pick.row;
      if (row.id != null && usedCatalogIds.has(row.id)) {
        usedTitles.add(normalizeTitle(row.name_cs || row.title));
        continue;
      }
      const typeEn = mealTypeToEn(row.meal_type || row.type || 'snack');
      try {
        meal = buildCatalogFillMeal(row, typeEn === 'svacina' ? 'snack' : typeEn);
      } catch {
        meal = null;
      }
      if (!meal) {
        usedTitles.add(normalizeTitle(row.name_cs || row.title));
        continue;
      }
      if (row.id != null) usedCatalogIds.add(row.id);
    } else {
      const lib = pick.recipe;
      meal = buildSimpleStartLibraryMeal(lib.title, lib.meal_type_en || lib.meal_type, {
        planner_source: 'calorie_honesty_fill',
      });
      if (!meal) break;

      if (lib.snap) {
        meal.kcal = lib.snap.kcal;
        meal.protein_g = lib.snap.protein_g;
        meal.carbs_g = lib.snap.carbs_g;
        meal.fat_g = lib.snap.fat_g;
        meal.catalog_id = lib.snap.id;
        meal.catalog_source = 'simple_start';
        meal.recipe_id = lib.snap.id;
        if (meal.recipe) {
          meal.recipe.id = lib.snap.id;
          meal.recipe.calories = lib.snap.kcal;
          meal.recipe.protein_g = lib.snap.protein_g;
          meal.recipe.carbs_g = lib.snap.carbs_g;
          meal.recipe.fat_g = lib.snap.fat_g;
          meal.recipe.source = 'simple_start';
        }
      }
      meal.portion_multiplier = 1;
      if (meal.recipe) meal.recipe.portion_multiplier = 1;
      meal.type = lib.meal_type_en || 'snack';
      meal.calorie_honesty_added = true;
    }

    if (exclusions && mealContainsExcludedFood(meal, exclusions)) {
      usedTitles.add(normalizeTitle(meal.display_name_cs || meal.name_cs));
      continue;
    }

    dayMeals.push(meal);
    usedTitles.add(normalizeTitle(meal.display_name_cs || meal.name_cs));
    added += 1;
    sum = sumScaledDayKcal(dayMeals);
  }

  boostDayMealsWithFlexibleCatchUp(dayMeals, target);

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
 * Flex catch-up may legitimately reach ~1.28 — only flag classic inflation above that.
 * @param {object|null|undefined} structuredPlan
 */
export function planHasInflatedPortions(structuredPlan) {
  return maxPortionMultiplierInPlan(structuredPlan)
    > Math.max(INFLATION_INVALID_THRESHOLD, FLEX_WEAK_DAY_MAX_SCALE + 0.05);
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
    version: 2,
    max_portion_multiplier_allowed: HONEST_MAX_SCALE,
    min_portion_multiplier_allowed: HONEST_MIN_SCALE,
    flex_catchup_max_scale: FLEX_CATCHUP_MAX_SCALE,
    flex_weak_day_max_scale: FLEX_WEAK_DAY_MAX_SCALE,
    max_meals_per_day_cap: MAX_MEALS_PER_DAY_CAP,
    max_meals_per_day_cap_high: MAX_MEALS_PER_DAY_CAP_HIGH,
    plan_under_target: underAny,
    avg_achieved_kcal: avgAchieved,
    target_kcal: target != null ? Math.round(Number(target)) : null,
    days: daySummaries,
    banner_cs: underAny ? CALORIE_UNDERRUN_BANNER_CS : null,
  };

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
