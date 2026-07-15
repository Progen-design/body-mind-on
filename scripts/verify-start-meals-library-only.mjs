#!/usr/bin/env node
/**
 * Ověří, že START skeleton + legacy local resolve používá povolené zdroje
 * a že aliasy titulů sedí. Catalog_id je OK (B1/B2).
 */
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartTitle } from '../lib/simpleStartRecipeLibrary.js';
import {
  ALLOWED_SIMPLE_START_CATALOG_SOURCES,
  isAllowedSimpleStartCatalogSource,
  resolveSimpleStartLocalSlot,
} from '../lib/startSimpleMealFilter.js';
import { slotTargetKcal, planMealTypeToWeightKey } from '../lib/nutrition/portionScaling.js';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const bodyMetrics = {
  user_id: 'verify-start-library-only',
  calories_target: 2100,
  meals_per_day: 4,
  diet_type: 'standard',
  goal: 'redukce',
  weight_kg: 80,
};

const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics, days: 7 });
const dailyTarget = Number(skeleton.targets.calories_per_day) || 2100;
const mealsPerDay = skeleton.meal_plan.meals_per_day || 4;

let mealCount = 0;
for (const day of skeleton.meal_plan.days || []) {
  for (let mi = 0; mi < (day.meals || []).length; mi += 1) {
    const slotMeal = day.meals[mi];
    const weightKey = planMealTypeToWeightKey(slotMeal.type || 'lunch');
    const slotTarget = slotTargetKcal(dailyTarget, mealsPerDay, weightKey);
    const { meal } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mi);
    mealCount += 1;
    check(
      `catalog_source povolený (${meal.display_name_cs || meal.name_cs})`,
      isAllowedSimpleStartCatalogSource(meal.catalog_source),
      meal.catalog_source || 'missing'
    );
    check(
      `má kcal (${meal.display_name_cs || meal.name_cs})`,
      Number(meal.kcal) > 0,
      String(meal.kcal)
    );
  }
}

check('vygenerováno alespoň 20 jídel', mealCount >= 20, `${mealCount} jídel`);
check('povolené zdroje zahrnují katalog', ALLOWED_SIMPLE_START_CATALOG_SOURCES.includes('simple_start'));

const aliasCases = [
  ['Řecký jogurt s ovocem', 'Jogurt s ovocem'],
  ['Krůtí maso s bramborem', 'Kuře s rýží a zeleninou'],
  ['Cottage talíř', 'Cottage s pečivem'],
  ['Rýže s vejcem', 'Rýže s vejcem a zeleninou'],
];

for (const [input, expected] of aliasCases) {
  check(`alias „${input}“`, resolveSimpleStartTitle(input) === expected, resolveSimpleStartTitle(input));
}

if (failed > 0) process.exit(1);
console.log('ALL CHECKS PASS');
