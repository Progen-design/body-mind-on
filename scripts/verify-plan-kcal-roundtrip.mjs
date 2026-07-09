#!/usr/bin/env node
/**
 * Roundtrip: generování START plánu → škálovaná kcal v JSON → zobrazení profilu + modal.
 *   node scripts/verify-plan-kcal-roundtrip.mjs
 */
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from '../lib/startSimpleMealFilter.js';
import {
  balanceDayMealsToCalorieTarget,
  planMealTypeToWeightKey,
  slotTargetKcal,
  sumScaledDayKcal,
} from '../lib/nutrition/portionScaling.js';
import { createMealDisplayModel } from '../lib/mealDisplayModel.js';
import { buildMealRecipeModalHtml } from '../lib/mealRecipeDisplay.js';
import {
  getMealNutritionDisplay,
  sumDayNutrition,
} from '../lib/mealNutritionDisplay.js';
import { getMacroCalorieDelta } from '../lib/macroKcalConsistency.js';

let failed = 0;
const TOLERANCE = 0.15;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
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
        planMealTypeToWeightKey(slotMeal.type || 'lunch'),
      );
      const { meal } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mi, bodyMetrics);
      dayMeals.push(meal);
    }
    balanceDayMealsToCalorieTarget(dayMeals, dayTarget, TOLERANCE);
    days.push({
      day_index: day.day_index,
      day_name: day.day_name,
      daily_target_kcal: dayTarget,
      meals: dayMeals,
    });
  }
  return { baseTarget, days };
}

const bodyMetrics = {
  email: 'verify-roundtrip@bodyandmindon.cz',
  goal: 'redukce',
  weight_kg: 82,
  height_cm: 178,
  calories_target: 2508,
  diet_type: 'standard',
  meals_per_day: 3,
};

const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics });
check(
  'skeleton target matches registration calories_target',
  Number(skeleton.targets.calories_per_day) === 2508,
  `got ${skeleton.targets.calories_per_day}`,
);

const { baseTarget, days } = resolveSkeletonDays(skeleton, bodyMetrics);

for (const day of days) {
  const dayTarget = Number(day.daily_target_kcal) || baseTarget;
  const structSum = sumScaledDayKcal(day.meals);
  const minOk = Math.round(dayTarget * (1 - TOLERANCE));
  const maxOk = Math.round(dayTarget * (1 + TOLERANCE));
  check(
    `day ${day.day_index} struct sum within ±15%`,
    structSum >= minOk && structSum <= maxOk,
    `sum=${structSum}, target=${dayTarget}, range=${minOk}-${maxOk}`,
  );

  const viewerMeals = (day.meals || []).map((m) => ({
    type: m.type === 'breakfast' ? 'Snídaně' : m.type === 'lunch' ? 'Oběd' : 'Večeře',
    text: m.name_cs || m.display_name_cs || '',
  }));
  const displaySum = sumDayNutrition(viewerMeals, day);
  check(
    `day ${day.day_index} profile display sum matches struct`,
    displaySum.kcal === structSum,
    `display=${displaySum.kcal}, struct=${structSum}`,
  );

  for (const meal of day.meals) {
    const model = createMealDisplayModel(meal);
    const displayKcal = getMealNutritionDisplay(meal).calories;
    check(
      `meal "${meal.name_cs}" display kcal matches struct`,
      model.calories === displayKcal && displayKcal === Math.round(Number(meal.kcal) || 0),
      `model=${model.calories}, struct=${meal.kcal}`,
    );

    const delta = getMacroCalorieDelta(model.calories, model.protein_g, model.carbs_g, model.fat_g);
    check(
      `meal "${meal.name_cs}" macro/kcal delta not ERROR`,
      delta.status !== 'ERROR',
      `status=${delta.status}, delta=${delta.deltaPercent}%`,
    );

    const modalHtml = buildMealRecipeModalHtml(model);
    check(
      `meal "${meal.name_cs}" modal has stacked macro bar`,
      modalHtml.includes('recipe-macro-energy-bar') && modalHtml.includes('background:#f472b6'),
    );
    check(
      `meal "${meal.name_cs}" modal has per-macro bar inline styles`,
      modalHtml.includes('recipe-nutrient-bar-wrap') && modalHtml.includes('background:#60a5fa'),
    );
    check(
      `meal "${meal.name_cs}" modal kcal matches scaled struct`,
      modalHtml.includes(`${Math.round(Number(meal.kcal) || 0)} kcal`),
      `expected ${meal.kcal} kcal in HTML`,
    );
  }
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
