#!/usr/bin/env node
/**
 * Ověří, že START plán používá jen simple_start_library / simple_start_fallback.
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

function mealHasExternalIds(meal) {
  return Boolean(
    meal?.catalog_id
    || meal?.recipe_id
    || meal?.spoonacular_id
    || meal?.meal_cache_id
    || meal?.recipe?.id
    || meal?.recipe?.source_url
    || meal?.recipe?.sourceUrl
    || meal?.spoonacular_url
    || meal?.external_url
    || (meal?.recipe?.source === 'catalog')
  );
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
      `bez externích ID (${meal.display_name_cs || meal.name_cs})`,
      !mealHasExternalIds(meal),
      JSON.stringify({
        catalog_id: meal.catalog_id,
        recipe_id: meal.recipe_id,
        source: meal?.recipe?.source,
      })
    );
    const steps = Array.isArray(meal.simple_instructions_cs) ? meal.simple_instructions_cs.length : 0;
    check(
      `≥4 instrukční kroky (${meal.display_name_cs || meal.name_cs})`,
      steps >= 4,
      `${steps} kroků`
    );
  }
}

check('vygenerováno alespoň 20 jídel', mealCount >= 20, `${mealCount} jídel`);
check('povolené zdroje definované', ALLOWED_SIMPLE_START_CATALOG_SOURCES.length === 2);

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
