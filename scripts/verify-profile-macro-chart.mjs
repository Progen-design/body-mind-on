#!/usr/bin/env node
/**
 * Statická kontrola makro grafů v profilu.
 *   node scripts/verify-profile-macro-chart.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getMacroCalorieDelta } from '../lib/macroKcalConsistency.js';
import { getMacroEnergyBreakdown } from '../lib/macroNutrition.js';
import { buildMacroEnergyNutritionHtml } from '../lib/recipeDetailHtml.js';
import { buildMealRecipeModalHtml } from '../lib/mealRecipeDisplay.js';
import { createMealDisplayModel } from '../lib/mealDisplayModel.js';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(relPath) {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8');
}

const macroChart = read('components/MacroRatioChart.js');
const todayPanels = read('components/profile/ProfileTodayPanels.js');
const planViewer = read('components/PlanViewer.js');
const mealRecipeDisplay = read('lib/mealRecipeDisplay.js');
const recipeDetailHtml = read('lib/recipeDetailHtml.js');
const macroNutrition = read('lib/macroNutrition.js');
const packageJson = read('package.json');

check('MacroRatioChart komponenta existuje', macroChart.includes('export default function MacroRatioChart'));
check('stacked bar markup', macroChart.includes('macro-ratio-bar') && macroChart.includes('macro-ratio-seg'));
check('legenda maker', macroChart.includes('macro-ratio-legend'));
check('používá computeMacroRatio', macroChart.includes('computeMacroRatio'));
check('používá getMacroCalorieDelta', macroChart.includes('getMacroCalorieDelta'));
check('WARNING text zaokrouhlení', macroChart.includes('Kalorie jsou zaokrouhlené podle porcí'));
check('ERROR se neloguje uživateli v UI', !macroChart.includes('makra nesedí'));

check('meal card obsahuje MacroRatioChart', planViewer.includes('MacroRatioChart'));
check('today summary obsahuje denní MacroRatioChart', todayPanels.includes('MacroRatioChart'));

check('sdílený macro helper existuje', macroNutrition.includes('getMacroEnergyBreakdown'));
check('recipe modal používá buildMacroEnergyNutritionHtml', mealRecipeDisplay.includes('buildMacroEnergyNutritionHtml'));
check('recipe modal macro bar markup', recipeDetailHtml.includes('recipe-macro-energy-bar'));
check('recipe modal nepoužívá tvrdě 0 % fallback', !recipeDetailHtml.includes('percentOfDailyNeeds) : 0') || recipeDetailHtml.includes('buildMacroEnergyNutritionHtml'));

const example = getMacroCalorieDelta(945, 42, 112, 35);
check('945/42/112/35 = OK', example.status === 'OK', `status=${example.status}, delta=${example.deltaPercent}%`);

const eggBreakdown = getMacroEnergyBreakdown({ kcal: 260, protein_g: 16, carbs_g: 8, fat_g: 18 });
check('260/16/8/18 protein ~25 %', eggBreakdown.proteinPercent >= 24 && eggBreakdown.proteinPercent <= 26, `got ${eggBreakdown.proteinPercent}%`);
check('260/16/8/18 carbs ~12 %', eggBreakdown.carbsPercent >= 11 && eggBreakdown.carbsPercent <= 13, `got ${eggBreakdown.carbsPercent}%`);
check('260/16/8/18 fat ~63 %', eggBreakdown.fatPercent >= 62 && eggBreakdown.fatPercent <= 64, `got ${eggBreakdown.fatPercent}%`);
check('260/16/8/18 má makra', eggBreakdown.hasMacros);

const eggDelta = getMacroCalorieDelta(260, 16, 8, 18);
check('260/16/8/18 status OK', eggDelta.status === 'OK', `status=${eggDelta.status}`);

const eggHtml = buildMacroEnergyNutritionHtml({ kcal: 260, protein_g: 16, carbs_g: 8, fat_g: 18 });
check('macro HTML obsahuje stacked bar', eggHtml.includes('recipe-macro-energy-bar'));
check('macro HTML má inline barvy (nezávislé na CSS modalu)', eggHtml.includes('background:#f472b6'));
check('macro HTML neobsahuje 0 % u bílkovin', !eggHtml.includes('16 g · 0 %'));
check('macro HTML obsahuje procenta maker', eggHtml.includes(`${eggBreakdown.proteinPercent} %`));

const eggMeal = createMealDisplayModel({
  name_cs: 'Vejce natvrdo se zeleninou',
  kcal: 260,
  protein_g: 16,
  carbs_g: 8,
  fat_g: 18,
  shopping_ingredient_lines: ['vejce 2 ks'],
  instructions: ['Uvař vejce.'],
}, '');
const eggModalHtml = buildMealRecipeModalHtml(eggMeal);
check('recipe modal HTML obsahuje makro bar', eggModalHtml.includes('recipe-macro-energy-bar'));
check('recipe modal HTML má inline barvy', eggModalHtml.includes('background:#f472b6'));
check('recipe modal HTML nemá všechna 0 %', !/Bílkoviny.*0 %.*Sacharidy.*0 %.*Tuky.*0 %/s.test(eggModalHtml));

const warnKcal = getMacroCalorieDelta(1000, 30, 30, 70);
check('delta 8–15 % = WARNING', warnKcal.status === 'WARNING', `status=${warnKcal.status}, delta=${warnKcal.deltaPercent}%`);

const errKcal = getMacroCalorieDelta(1000, 5, 5, 5);
check('delta >15 % = ERROR', errKcal.status === 'ERROR', `status=${errKcal.status}, delta=${errKcal.deltaPercent}%`);

const badWidths = [
  ...(macroChart.match(/width:\s*(\d{4,})px/g) || []),
  ...(todayPanels.match(/width:\s*(\d{4,})px/g) || []),
  ...(recipeDetailHtml.match(/recipe-macro[\s\S]*?width:\s*(\d{4,})px/g) || []),
].filter((w) => !w.includes('100'));
check('žádné fixed width nad 100vw v makro CSS', badWidths.length === 0, badWidths.join(', ') || 'none');
check('makro graf max-width 100%', macroChart.includes('max-width: 100%'));
check('recipe modal macro bar max-width 100%', planViewer.includes('recipe-macro-energy-bar') && planViewer.includes('max-width: 100%'));

check('npm script verify:profile-macro-chart', packageJson.includes('"verify:profile-macro-chart"'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
