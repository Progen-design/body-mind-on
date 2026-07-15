#!/usr/bin/env node
/**
 * START calorie honesty: multipliers stay in 0.85–1.15; deficit may leave underrun
 * (never invent kcal). Day sum must equal sum of meal.kcal.
 */
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from '../lib/startSimpleMealFilter.js';
import {
  sumScaledDayKcal,
  planMealTypeToWeightKey,
  slotTargetKcal,
  START_MAX_SCALE,
  START_MIN_SCALE,
} from '../lib/nutrition/portionScaling.js';
import { fillDayCaloriesByAddingLibraryMeals } from '../lib/nutrition/calorieHonesty.js';

let failed = 0;
function fail(msg) {
  console.log(`FAIL ${msg}`);
  failed += 1;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

function resolveSkeletonDays(skeleton, bodyMetrics) {
  const baseTarget = Number(skeleton.targets.calories_per_day);
  const mealsPerDay = skeleton.meal_plan.meals_per_day || 3;
  const days = [];
  for (const day of skeleton.meal_plan.days || []) {
    const dayTarget = Number(day.daily_target_kcal) || baseTarget;
    const dayMeals = [];
    for (let mi = 0; mi < (day.meals || []).length; mi += 1) {
      const slotMeal = day.meals[mi];
      const slotTarget = slotTargetKcal(
        dayTarget,
        mealsPerDay,
        planMealTypeToWeightKey(slotMeal.type || 'lunch')
      );
      const { meal } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mi, bodyMetrics);
      dayMeals.push(meal);
    }
    const honesty = fillDayCaloriesByAddingLibraryMeals(dayMeals, dayTarget);
    days.push({
      day_index: day.day_index,
      daily_target_kcal: dayTarget,
      meals: dayMeals,
      honesty,
    });
  }
  return days;
}

function checkPlan(label, bodyMetrics) {
  const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics });
  const baseTarget = Number(skeleton.targets.calories_per_day);
  const resolved = resolveSkeletonDays(skeleton, bodyMetrics);

  for (const day of resolved) {
    const dayTarget = Number(day.daily_target_kcal) || baseTarget;
    const sum = sumScaledDayKcal(day.meals);
    if (sum !== day.honesty.achieved_kcal) {
      fail(`${label} day ${day.day_index}: sum ${sum} != honesty ${day.honesty.achieved_kcal}`);
    }
    for (const m of day.meals) {
      const mult = Number(m.portion_multiplier) || 1;
      if (mult < START_MIN_SCALE - 0.001 || mult > START_MAX_SCALE + 0.001) {
        fail(`${label} day ${day.day_index}: mult ${mult} outside ${START_MIN_SCALE}-${START_MAX_SCALE}`);
      }
    }
    const maxInvented = Math.round(dayTarget * 0.95);
    // Achieved may be under target — that is honest. Must never exceed max via invented scale.
    if (sum > Math.round(dayTarget * 1.15) + 50) {
      fail(`${label} day ${day.day_index}: sum ${sum} far above target ${dayTarget}`);
    }
    if (day.honesty.under_target && sum >= maxInvented) {
      fail(`${label} day ${day.day_index}: marked under but sum ${sum} >= ${maxInvented}`);
    }
  }
  ok(`${label}: honest multipliers + real day sums (target ${baseTarget})`);
}

console.log(`--- START calorie honesty (cap ${START_MIN_SCALE}–${START_MAX_SCALE}) ---`);
checkPlan('3300 kcal', {
  goal: 'nabirani_svaly',
  weight_kg: 95,
  calories_target: 3300,
  diet_type: 'standard',
  meals_per_day: 4,
});
checkPlan('2200 kcal', {
  goal: 'udrzovani',
  weight_kg: 75,
  calories_target: 2200,
  diet_type: 'standard',
  meals_per_day: 3,
});
checkPlan('cheese excluded 3300', {
  goal: 'nabirani_svaly',
  weight_kg: 95,
  calories_target: 3300,
  diet_type: 'standard',
  meals_per_day: 4,
  foods_to_avoid: 'sýr',
});

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll START calorie honesty checks passed.');
