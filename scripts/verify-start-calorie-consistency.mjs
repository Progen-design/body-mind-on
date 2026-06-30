#!/usr/bin/env node
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from '../lib/startSimpleMealFilter.js';
import {
  sumScaledDayKcal,
  planMealTypeToWeightKey,
  slotTargetKcal,
  balanceDayMealsToCalorieTarget,
} from '../lib/nutrition/portionScaling.js';

let failed = 0;
function fail(msg) {
  console.log(`FAIL ${msg}`);
  failed += 1;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

const TOLERANCE = 0.15;

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
    balanceDayMealsToCalorieTarget(dayMeals, dayTarget, TOLERANCE);
    days.push({ day_index: day.day_index, daily_target_kcal: dayTarget, meals: dayMeals });
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
    const minOk = Math.round(dayTarget * (1 - TOLERANCE));
    const maxOk = Math.round(dayTarget * (1 + TOLERANCE));
    if (sum < minOk || sum > maxOk) {
      fail(`${label} day ${day.day_index}: ${sum} kcal outside ${minOk}-${maxOk} (target ${dayTarget})`);
    }
  }
}

console.log('--- START calorie consistency ±15% ---');
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
  weight_kg: 90,
  calories_target: 3300,
  diet_type: 'standard',
  meals_per_day: 4,
  foods_to_avoid: 'sýr',
});

if (!failed) ok('all sample days within ±15% of target');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
