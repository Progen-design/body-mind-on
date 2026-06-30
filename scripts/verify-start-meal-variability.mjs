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
function fail(msg) { console.log(`FAIL ${msg}`); failed += 1; }
function ok(msg) { console.log(`OK ${msg}`); }

const TOLERANCE = 0.15;
const bodyMetrics = {
  goal: 'udrzovani',
  weight_kg: 80,
  calories_target: 2700,
  diet_type: 'standard',
  meals_per_day: 4,
  email: 'variability-test@example.com',
};

function resolveDays(skeleton) {
  const mealsPerDay = skeleton.meal_plan.meals_per_day || 4;
  const days = [];
  for (const day of skeleton.meal_plan.days || []) {
    const dailyTarget = Number(day.daily_target_kcal) || Number(skeleton.targets.calories_per_day);
    const dayMeals = [];
    for (let mi = 0; mi < (day.meals || []).length; mi += 1) {
      const slotMeal = day.meals[mi];
      const slotTarget = slotTargetKcal(dailyTarget, mealsPerDay, planMealTypeToWeightKey(slotMeal.type || 'lunch'));
      const { meal } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mi, bodyMetrics);
      dayMeals.push(meal);
    }
    balanceDayMealsToCalorieTarget(dayMeals, dailyTarget, TOLERANCE);
    days.push({ day_index: day.day_index, daily_target_kcal: dailyTarget, meals: dayMeals });
  }
  return days;
}

console.log('--- START meal variability ---');
const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics });
const baseTarget = Number(skeleton.targets.calories_per_day);
const resolved = resolveDays(skeleton);

const dailyKcals = resolved.map((d) => sumScaledDayKcal(d.meals));
const uniqueDaily = new Set(dailyKcals);
if (uniqueDaily.size < 2) fail(`all daily kcal identical: ${[...uniqueDaily].join(', ')}`);
else ok(`daily kcal vary across week (${uniqueDaily.size} distinct sums)`);

for (const day of resolved) {
  const target = Number(day.daily_target_kcal) || baseTarget;
  const sum = sumScaledDayKcal(day.meals);
  const minOk = Math.round(target * (1 - TOLERANCE));
  const maxOk = Math.round(target * (1 + TOLERANCE));
  if (sum < minOk || sum > maxOk) fail(`day ${day.day_index}: ${sum} outside ${minOk}-${maxOk}`);
}
ok('each day within ±15% of its jittered target');

const countByType = (type) => {
  const names = resolved.flatMap((d) => d.meals.filter((m) => m.type === type).map((m) => m.display_name_cs || m.name_cs));
  return { names, unique: new Set(names).size, maxRepeat: Math.max(...[...new Set(names)].map((n) => names.filter((x) => x === n).length), 0) };
};

const breakfast = countByType('breakfast');
const lunch = countByType('lunch');
const dinner = countByType('dinner');
const snack = countByType('snack');

if (breakfast.unique < 3) fail(`breakfast types ${breakfast.unique} < 3`);
else ok(`breakfast variety: ${breakfast.unique} types`);
if (lunch.unique < 4) fail(`lunch types ${lunch.unique} < 4`);
else ok(`lunch variety: ${lunch.unique} types`);
if (dinner.unique < 4) fail(`dinner types ${dinner.unique} < 4`);
else ok(`dinner variety: ${dinner.unique} types`);
if (snack.unique < 2) fail(`snack types ${snack.unique} < 2`);
else ok(`snack variety: ${snack.unique} types`);

for (const [label, data] of [['breakfast', breakfast], ['lunch', lunch], ['dinner', dinner], ['snack', snack]]) {
  if (data.maxRepeat > 2) fail(`${label} meal repeated ${data.maxRepeat}x`);
}
ok('no meal repeated more than 2x per type');

const sources = resolved.flatMap((d) => d.meals.map((m) => m.catalog_source || m.recipe?.source || ''));
if (sources.some((s) => /spoonacular|meal_cache|catalog_id/i.test(String(s)))) fail('non-START source detected');
else ok('START meals use local library/fallback only');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
