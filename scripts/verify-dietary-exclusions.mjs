#!/usr/bin/env node
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from '../lib/startSimpleMealFilter.js';
import { planMealTypeToWeightKey, slotTargetKcal, balanceDayMealsToCalorieTarget } from '../lib/nutrition/portionScaling.js';
import {
  parseDietaryExclusions,
  mealContainsExcludedFood,
  textContainsExcludedFood,
} from '../lib/dietaryExclusions.js';

let failed = 0;
function fail(msg) {
  console.log(`FAIL ${msg}`);
  failed += 1;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

function resolveSkeletonDays(skeleton, bodyMetrics) {
  const dailyTarget = Number(skeleton.targets.calories_per_day);
  const mealsPerDay = skeleton.meal_plan.meals_per_day || 3;
  const days = [];
  for (const day of skeleton.meal_plan.days || []) {
    const dayMeals = [];
    for (let mi = 0; mi < (day.meals || []).length; mi += 1) {
      const slotMeal = day.meals[mi];
      const slotTarget = slotTargetKcal(
        dailyTarget,
        mealsPerDay,
        planMealTypeToWeightKey(slotMeal.type || 'lunch')
      );
      const { meal } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mi, bodyMetrics);
      dayMeals.push(meal);
    }
    balanceDayMealsToCalorieTarget(dayMeals, dailyTarget, 0.15);
    days.push({ day_index: day.day_index, meals: dayMeals });
  }
  return days;
}

const cheeseBm = {
  goal: 'nabirani_svaly',
  weight_kg: 90,
  calories_target: 3300,
  diet_type: 'standard',
  meals_per_day: 4,
  foods_to_avoid: 'sýr',
};

console.log('--- parseDietaryExclusions ---');
const ex = parseDietaryExclusions(cheeseBm);
if (!ex.cheeseExcluded) fail('cheeseExcluded should be true');
else ok('cheese excluded detected');
if (textContainsExcludedFood('Šunka, sýr, pečivo a zelenina', ex)) ok('cheese meal blocked');
else fail('cheese meal should be blocked');

console.log('\n--- agent skeleton without cheese meals ---');
const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics: cheeseBm });
for (const day of skeleton.meal_plan.days) {
  for (const meal of day.meals) {
    const name = meal.name_cs || '';
    if (mealContainsExcludedFood(meal, ex)) fail(`agent picked excluded meal "${name}"`);
    if (/sýr|syr|eidam|gouda|mozzarella/i.test(name)) fail(`agent picked cheese in name "${name}"`);
  }
}
if (!failed) ok('agent skeleton respects cheese exclusion');

console.log('\n--- resolved START plan without cheese ---');
const resolved = resolveSkeletonDays(skeleton, cheeseBm);
for (const day of resolved) {
  for (const meal of day.meals) {
    const label = meal.display_name_cs || meal.name_cs || '';
    if (mealContainsExcludedFood(meal, ex)) fail(`resolved meal contains cheese: "${label}"`);
    if (/šunka,\s*sýr|sunka,\s*syr/i.test(label)) fail(`forbidden ham+cheese meal present: "${label}"`);
  }
}
if (!failed) ok('resolved START meals respect cheese exclusion');

console.log('\n--- dairy exclusion blocks jogurt/cottage ---');
const dairyEx = parseDietaryExclusions({ dietary_restrictions: 'mléčné výrobky' });
if (!dairyEx.dairyExcluded) fail('dairyExcluded should be true');
else ok('dairy exclusion detected');
for (const sample of ['Jogurt s ovocem', 'Cottage s pečivem', 'Tvaroh s vločkami']) {
  if (!mealContainsExcludedFood({ name_cs: sample }, dairyEx)) fail(`${sample} should be blocked for dairy`);
}
ok('dairy samples blocked');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
