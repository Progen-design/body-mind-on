#!/usr/bin/env node
/**
 * Ověření konzistence kcal v profilu: škálované jídlo z plánu vs. knihovna START.
 *   node scripts/verify-profile-kcal-consistency.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createMealDisplayModel } from '../lib/mealDisplayModel.js';
import {
  getMealNutritionDisplay,
  resolveDayCalorieTarget,
  sumDayNutrition,
} from '../lib/mealNutritionDisplay.js';
import { DAY_CALORIE_TOLERANCE } from '../lib/nutrition/portionScaling.js';
import { buildMealRecipeModalHtml } from '../lib/mealRecipeDisplay.js';
import { buildMacroEnergyNutritionHtml } from '../lib/recipeDetailHtml.js';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const scaledLibraryMeal = {
  type: 'breakfast',
  name_cs: 'Vejce s pečivem a zeleninou',
  display_name_cs: 'Vejce s pečivem a zeleninou',
  catalog_source: 'simple_start_library',
  planner_source: 'simple_meal_planner_agent',
  portion_multiplier: 1.67,
  kcal: 752,
  protein_g: 40,
  carbs_g: 63,
  fat_g: 37,
};

const scaledModel = createMealDisplayModel(scaledLibraryMeal);
check(
  'library meal keeps scaled kcal from plan (not template 450)',
  scaledModel.calories === 752,
  `got ${scaledModel.calories}`,
);
check(
  'library meal keeps scaled protein',
  scaledModel.protein_g === 40,
  `got ${scaledModel.protein_g}`,
);

const structDay = {
  daily_target_kcal: 2382,
  meals: [
    { type: 'breakfast', kcal: 752, protein_g: 40, carbs_g: 63, fat_g: 37, catalog_source: 'simple_start_library', name_cs: 'Vejce s pečivem a zeleninou' },
    { type: 'lunch', kcal: 798, protein_g: 42, carbs_g: 88, fat_g: 28, catalog_source: 'simple_start_library', name_cs: 'Čočka s vejcem' },
    { type: 'dinner', kcal: 832, protein_g: 44, carbs_g: 72, fat_g: 36, catalog_source: 'simple_start_library', name_cs: 'Omeleta se zeleninou' },
  ],
};
const viewerMeals = [
  { type: 'Snídaně', text: 'Vejce s pečivem a zeleninou' },
  { type: 'Oběd', text: 'Čočka s vejcem' },
  { type: 'Večeře', text: 'Omeleta se zeleninou' },
];

const daySum = sumDayNutrition(viewerMeals, structDay);
check(
  'day sum matches structured meals',
  daySum.kcal === 2382,
  `got ${daySum.kcal}`,
);

const dayTarget = resolveDayCalorieTarget(structDay, { calories_per_day: 2508 });
check(
  'day target prefers daily_target_kcal',
  dayTarget === 2382,
  `got ${dayTarget}`,
);

const planTarget = resolveDayCalorieTarget(null, { calories_per_day: 2508 });
check(
  'plan target fallback to calories_per_day',
  planTarget === 2508,
  `got ${planTarget}`,
);

const withinTolerance = daySum.kcal != null && dayTarget != null
  && Math.abs(daySum.kcal - dayTarget) / dayTarget <= DAY_CALORIE_TOLERANCE;
check(
  `day sum within ±${Math.round(DAY_CALORIE_TOLERANCE * 100)} % of day target`,
  withinTolerance,
  `sum=${daySum.kcal}, target=${dayTarget}`,
);

const breakfastDisplay = getMealNutritionDisplay(structDay.meals[0]);
check(
  'getMealNutritionDisplay uses scaled kcal on struct meal',
  breakfastDisplay.calories === 752,
  `got ${breakfastDisplay.calories}`,
);

const todayPanels = readFileSync(resolve(process.cwd(), 'components/profile/ProfileTodayPanels.js'), 'utf8');
const mealDisplayModel = readFileSync(resolve(process.cwd(), 'lib/mealDisplayModel.js'), 'utf8');
check('ProfileTodayPanels uses resolveDayCalorieTarget', todayPanels.includes('resolveDayCalorieTarget'));
check('ProfileTodayPanels uses shared sumDayNutrition', todayPanels.includes('sumDayNutrition'));
check('mealDisplayModel preserves planned nutrition for library', mealDisplayModel.includes('plannedNutrition'));

const modalHtml = buildMealRecipeModalHtml(scaledModel);
check(
  'recipe modal HTML contains visible stacked bar (inline background)',
  modalHtml.includes('recipe-macro-energy-bar') && modalHtml.includes('background:#f472b6'),
);
check(
  'recipe modal HTML contains per-macro progress bars',
  modalHtml.includes('recipe-nutrient-bar-wrap') && modalHtml.includes('background:#fbbf24'),
);
check(
  'recipe modal shows scaled 752 kcal not template 450',
  modalHtml.includes('752 kcal') && !modalHtml.includes('450 kcal'),
);

const macroBlock = buildMacroEnergyNutritionHtml({ kcal: 752, protein_g: 40, carbs_g: 63, fat_g: 37 });
check(
  'macro HTML block has inline bar colors',
  macroBlock.includes('background:#f472b6') && macroBlock.includes('background:#60a5fa'),
);

const packageJson = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
check('npm script verify:profile-kcal-consistency', packageJson.includes('"verify:profile-kcal-consistency"'));
check('npm script verify:plan-kcal-roundtrip', packageJson.includes('"verify:plan-kcal-roundtrip"'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
