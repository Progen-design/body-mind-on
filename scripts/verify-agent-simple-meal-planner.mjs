#!/usr/bin/env node
/**
 * Ověření SimpleMealPlannerAgent + agent-first START meal flow.
 *   node scripts/verify-agent-simple-meal-planner.mjs
 */
import {
  buildSimpleStartMealSkeleton,
  SIMPLE_MEAL_PLANNER_AGENT_INSTRUCTIONS,
} from '../lib/services/simpleMealPlannerAgent.js';
import {
  isAllowedForSimpleStartPlan,
  getSimpleStartBlockReason,
  buildStartSafeFallbackMeal,
} from '../lib/startSimpleMealFilter.js';

const sampleBm = {
  goal: 'udrzovani',
  weight_kg: 80,
  calories_target: 2400,
  diet_type: 'standard',
  meals_per_day: 4,
  workouts_per_week: 3,
};

let failed = 0;
function fail(msg) {
  console.log(`FAIL ${msg}`);
  failed += 1;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

console.log('--- SimpleMealPlannerAgent: skeleton ---');
const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics: sampleBm });
const days = skeleton?.meal_plan?.days || [];
if (days.length !== 7) fail(`expected 7 days, got ${days.length}`);
else ok('7 days generated');

const mealsPerDay = skeleton?.meal_plan?.meals_per_day;
if (mealsPerDay !== 4) fail(`expected 4 meals/day, got ${mealsPerDay}`);
else ok('meals_per_day=4');

const forbiddenInAgent = [
  'burrito',
  'pomerančové kuře',
  'kokosové kari',
  'frittata',
  'lasagne',
  'krab',
];
for (const day of days) {
  for (const meal of day.meals || []) {
    const name = String(meal.name_cs || '').toLowerCase();
    for (const bad of forbiddenInAgent) {
      if (name.includes(bad)) fail(`agent generated forbidden "${bad}" in "${meal.name_cs}"`);
    }
    if (!meal.allowed_catalog_match_terms?.length) fail(`missing allowed terms for "${meal.name_cs}"`);
    if (!meal.fallback_meal_template?.name_cs) fail(`missing fallback for "${meal.name_cs}"`);
    if (meal.simplicity_level !== 'very_simple') fail(`simplicity_level not very_simple for "${meal.name_cs}"`);
  }
}
if (!failed) ok('agent meals are simple and have match/fallback metadata');

console.log('\n--- Agent instructions block present ---');
if (SIMPLE_MEAL_PLANNER_AGENT_INSTRUCTIONS.includes('jednoduchost > originalita')) ok('instruction block');
else fail('instruction block missing');

console.log('\n--- Hard filter vs catalog rows ---');
function row(name, ingredients = []) {
  return { name_cs: name, kcal: 600, ingredients };
}

const slot = days[1]?.meals?.find((m) => m.type === 'lunch') || {
  type: 'lunch',
  name_cs: 'Kuře s rýží a zeleninou',
  allowed_catalog_match_terms: ['kuře', 'rýž', 'zelenin'],
  forbidden_catalog_terms: ['pomeranč', 'kari', 'burrito'],
  fallback_meal_template: { name_cs: 'Kuře s rýží a zeleninou', kcal: 620, protein_g: 42, carbs_g: 65, fat_g: 16, shopping_ingredient_lines: ['kuře'] },
};

const mustBlockCatalog = [
  'Snídaňový burrito se slaninou a vejcem',
  'Pomerančové kuře s hnědou rýží',
  'Kokosové kari s ramenovými nudlemi',
  'Předkrmy: Muffiny z frittaty',
  'Lasagne s mletým masem',
];
for (const name of mustBlockCatalog) {
  if (isAllowedForSimpleStartPlan(row(name), slot)) fail(`catalog should block "${name}"`);
  else ok(`block catalog "${name}" reason=${getSimpleStartBlockReason(row(name), slot)}`);
}

const mustAllowCatalog = [
  { name: 'Kuře s rýží a zeleninou', terms: ['kuře', 'rýž', 'zelenin'] },
  { name: 'Kuřecí prsa s rýží', terms: ['kuře', 'rýž', 'kuřec'] },
  { name: 'Těstoviny s tuňákem', terms: ['těstovin', 'tuňák'] },
  { name: 'Tvaroh s vločkami a banánem', terms: ['tvaroh', 'vločk', 'banán'] },
];
for (const { name, terms } of mustAllowCatalog) {
  const testSlot = {
    type: 'lunch',
    name_cs: name,
    allowed_catalog_match_terms: terms,
    forbidden_catalog_terms: ['pomeranč', 'kari', 'burrito'],
  };
  if (!isAllowedForSimpleStartPlan(row(name), testSlot)) {
    fail(`catalog should allow "${name}" reason=${getSimpleStartBlockReason(row(name), testSlot)}`);
  } else ok(`allow catalog "${name}"`);
}

console.log('\n--- Fallback from agent skeleton ---');
const lunchMeal = days[2]?.meals?.find((m) => m.type === 'lunch');
const fallback = buildStartSafeFallbackMeal(lunchMeal, lunchMeal?.target_kcal || 650, 1);
const expectedVerified = fallback.catalog_source === 'simple_start_library' ? true : false;
const fbOk =
  (fallback.catalog_source === 'simple_start_fallback' || fallback.catalog_source === 'simple_start_library') &&
  fallback.display_name_cs === lunchMeal?.name_cs &&
  fallback.recipe_verified === expectedVerified &&
  fallback.shopping_ingredient_lines?.length > 0;
if (fbOk) ok(`fallback "${fallback.display_name_cs}" source=${fallback.catalog_source}`);
else fail('agent skeleton fallback');

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
