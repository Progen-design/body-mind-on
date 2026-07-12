#!/usr/bin/env node
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from '../lib/startSimpleMealFilter.js';
import { planMealTypeToWeightKey, slotTargetKcal, balanceDayMealsToCalorieTarget } from '../lib/nutrition/portionScaling.js';
import {
  parseDietaryExclusions,
  mealContainsExcludedFood,
  textContainsExcludedFood,
} from '../lib/dietaryExclusions.js';
import {
  buildDietaryPublishRules,
  mealDietaryViolation,
  findDietaryViolations,
  enforceDietaryPublishGate,
} from '../lib/dietaryPublishGate.js';

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

console.log('\n--- vegetarian hard gate ---');
const vegRules = buildDietaryPublishRules({ diet_type: 'vegetarian' });
if (mealDietaryViolation({ display_name_cs: 'Kuřecí prsa s rýží' }, vegRules) !== 'vegetarian_meat_fish') {
  fail('vegetarian should block chicken');
} else ok('vegetarian blocks chicken');

console.log('\n--- vegan hard gate ---');
const veganRules = buildDietaryPublishRules({ diet_type: 'vegan' });
if (mealDietaryViolation({ display_name_cs: 'Vejce na oko' }, veganRules) !== 'vegan_animal_product') {
  fail('vegan should block eggs');
} else ok('vegan blocks eggs');

console.log('\n--- gluten_free hard gate ---');
const gfRules = buildDietaryPublishRules({ diet_type: 'gluten_free' });
if (mealDietaryViolation({ display_name_cs: 'Špagety carbonara' }, gfRules) !== 'gluten_free') {
  fail('gluten_free should block pasta');
} else ok('gluten_free blocks pasta');
if (mealDietaryViolation({ display_name_cs: 'Bezlepkové těstoviny s omáčkou' }, gfRules) !== null) {
  fail('explicit gluten-free variant should pass');
} else ok('gluten_free allows labeled variant');

console.log('\n--- lactose_free hard gate ---');
const lfRules = buildDietaryPublishRules({ diet_type: 'lactose_free' });
if (mealDietaryViolation({ display_name_cs: 'Jogurt s ovocem' }, lfRules) !== 'lactose_free') {
  fail('lactose_free should block jogurt');
} else ok('lactose_free blocks jogurt');

console.log('\n--- enforceDietaryPublishGate on vegetarian plan ---');
const vegBm = { diet_type: 'vegetarian', goal: 'udrzovani', calories_target: 2200, meals_per_day: 3 };
const skeletonVeg = buildSimpleStartMealSkeleton({ bodyMetrics: vegBm });
const vegDays = resolveSkeletonDays(skeletonVeg, vegBm);
const vegPlan = { days: vegDays, targets: skeletonVeg.targets };
const vegGate = enforceDietaryPublishGate(vegPlan, vegBm);
const vegViolations = findDietaryViolations(vegGate.planJson, buildDietaryPublishRules(vegBm));
if (!vegGate.ok || vegViolations.length) fail(`vegetarian plan still has violations: ${vegViolations.length}`);
else ok('vegetarian plan passes publish gate');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
