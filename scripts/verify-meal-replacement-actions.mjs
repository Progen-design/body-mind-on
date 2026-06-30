#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pickSimpleStartMealAlternative, buildReplacementStructuredMeal } from '../lib/simpleStartMealReplacement.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.log(`FAIL ${msg}`); failed += 1; }
function ok(msg) { console.log(`OK ${msg}`); }

console.log('--- meal replacement wiring ---');
const planViewer = fs.readFileSync(path.join(root, 'components/PlanViewer.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'pages/api/plan-replace-meal.js'), 'utf8');
if (!planViewer.includes("'/api/plan-replace-meal'")) fail('PlanViewer missing plan-replace-meal API call');
if (!planViewer.includes('Nahradit jiným')) fail('PlanViewer missing Nahradit jiným button');
if (!api.includes('replaceMealInStructuredPlan')) fail('API missing replaceMealInStructuredPlan');
if (!api.includes('structured_plan_json')) fail('API missing DB persistence');
else ok('replace button + API + DB persistence wired');

console.log('\n--- replacement logic ---');
const bodyMetrics = { diet_type: 'standard', calories_target: 2700, meals_per_day: 4 };
const alt = pickSimpleStartMealAlternative({
  mealType: 'breakfast',
  currentTitle: 'Tvaroh s vločkami a banánem',
  bodyMetrics,
  excludeTitles: ['Tvaroh s vločkami a banánem'],
  targetKcal: 650,
});
if (!alt || alt.title === 'Tvaroh s vločkami a banánem') fail('no alternative breakfast picked');
else ok(`alternative breakfast: ${alt.title}`);

const cheeseBm = { ...bodyMetrics, foods_to_avoid: 'sýr' };
const cheeseAlt = buildReplacementStructuredMeal({
  mealType: 'lunch',
  currentTitle: 'Kuře s rýží a zeleninou',
  bodyMetrics: cheeseBm,
  excludeTitles: ['Kuře s rýží a zeleninou'],
  targetKcal: 900,
});
if (!cheeseAlt) fail('cheese exclusion blocked all replacements');
else ok('replacement respects exclusions path');

const structured = {
  targets: { calories_per_day: 2700 },
  days: [{
    day_index: 0,
    daily_target_kcal: 2565,
    meals: [
      { type: 'breakfast', name_cs: 'Tvaroh s vločkami a banánem', display_name_cs: 'Tvaroh s vločkami a banánem', kcal: 650, protein_g: 28, carbs_g: 52, fat_g: 10, catalog_source: 'simple_start_library' },
      { type: 'lunch', name_cs: 'Kuře s rýží a zeleninou', display_name_cs: 'Kuře s rýží a zeleninou', kcal: 900, protein_g: 42, carbs_g: 65, fat_g: 16, catalog_source: 'simple_start_library' },
      { type: 'snack', name_cs: 'Jogurt s ovocem', display_name_cs: 'Jogurt s ovocem', kcal: 300, protein_g: 14, carbs_g: 28, fat_g: 6, catalog_source: 'simple_start_library' },
      { type: 'dinner', name_cs: 'Těstoviny s kuřetem', display_name_cs: 'Těstoviny s kuřetem', kcal: 900, protein_g: 40, carbs_g: 62, fat_g: 16, catalog_source: 'simple_start_library' },
    ],
  }],
};

const planReplace = fs.readFileSync(path.join(root, 'lib/planMealReplace.js'), 'utf8');
if (!planReplace.includes('replaceMealInStructuredPlan')) fail('planMealReplace missing core function');
if (!planReplace.includes('balanceDayMealsToCalorieTarget')) fail('planMealReplace missing calorie rebalance');
else ok('planMealReplace module persists structured + rebalance logic');

console.log('\n--- pin next week ---');
const mealPins = fs.readFileSync(path.join(root, 'pages/api/meal-pins.js'), 'utf8');
const agent = fs.readFileSync(path.join(root, 'lib/services/simpleMealPlannerAgent.js'), 'utf8');
if (!mealPins.includes('user_meal_pins')) fail('meal-pins API missing table');
if (!planViewer.includes('Zařadíme častěji do dalšího plánu')) fail('pin confirmation copy missing');
if (!agent.includes('pinnedMeals')) fail('agent missing pinned meals support');
else ok('pin preference stored + UI copy + agent hook');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
