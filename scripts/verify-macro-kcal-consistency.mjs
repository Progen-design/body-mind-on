#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calculateCaloriesFromMacros,
  getMacroCalorieDelta,
} from '../lib/macroKcalConsistency.js';
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from '../lib/startSimpleMealFilter.js';
import { planMealTypeToWeightKey, slotTargetKcal } from '../lib/nutrition/portionScaling.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.log(`FAIL ${msg}`); failed += 1; }
function ok(msg) { console.log(`OK ${msg}`); }

console.log('--- macro/kcal helpers ---');
if (typeof calculateCaloriesFromMacros !== 'function') fail('calculateCaloriesFromMacros missing');
if (typeof getMacroCalorieDelta !== 'function') fail('getMacroCalorieDelta missing');
else ok('helpers exported');

const sample = getMacroCalorieDelta(945, 42, 112, 35);
if (sample.kcalFromMacros !== 931) fail(`expected 931 kcal from macros, got ${sample.kcalFromMacros}`);
if (sample.status !== 'OK') fail(`945/42/112/35 should be OK, got ${sample.status}`);
else ok('945/42/112/35 = OK');

const warn = getMacroCalorieDelta(1000, 42, 112, 35);
if (warn.status !== 'WARNING' && warn.status !== 'OK') fail(`borderline delta status ${warn.status}`);
else ok(`delta ${warn.deltaPercent}% -> ${warn.status}`);

const err = getMacroCalorieDelta(1200, 42, 112, 35);
if (err.status !== 'ERROR') fail(`large delta should be ERROR, got ${err.status}`);
else ok('large delta = ERROR');

const macroChart = fs.readFileSync(path.join(root, 'components/MacroRatioChart.js'), 'utf8');
if (!macroChart.includes('getMacroCalorieDelta')) fail('MacroRatioChart missing delta integration');
else ok('MacroRatioChart shows macro/kcal status');

console.log('\n--- START meals no ERROR delta ---');
const skeleton = buildSimpleStartMealSkeleton({
  bodyMetrics: { calories_target: 2700, meals_per_day: 4, diet_type: 'standard' },
});
let errorMeals = 0;
for (const day of skeleton.meal_plan.days || []) {
  const daily = Number(day.daily_target_kcal) || Number(skeleton.targets.calories_per_day);
  for (let mi = 0; mi < (day.meals || []).length; mi += 1) {
    const slot = day.meals[mi];
    const slotTarget = slotTargetKcal(daily, 4, planMealTypeToWeightKey(slot.type));
    const { meal } = resolveSimpleStartLocalSlot(slot, slotTarget, mi, { diet_type: 'standard' });
    const delta = getMacroCalorieDelta(meal?.kcal || meal?.calories, meal?.protein_g, meal?.carbs_g, meal?.fat_g);
    if (delta.status === 'ERROR') errorMeals += 1;
  }
}
if (errorMeals > 0) fail(`${errorMeals} START meals with ERROR macro/kcal delta`);
else ok('no START skeleton meal has ERROR macro/kcal delta');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
