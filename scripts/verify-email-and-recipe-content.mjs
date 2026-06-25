#!/usr/bin/env node
/**
 * Ověření praktického weekly e-mailu a rozšířených START postupů.
 *   node scripts/verify-email-and-recipe-content.mjs
 */
import { readFileSync } from 'fs';
import { buildWeeklyPlanEmailV8Document } from '../lib/weeklyPlanEmailV8.js';
import { buildMealRecipeModalHtml } from '../lib/mealRecipeDisplay.js';
import { createMealDisplayModel } from '../lib/mealDisplayModel.js';
import { buildSimpleStartLibraryMeal, SIMPLE_START_RECIPES } from '../lib/simpleStartRecipeLibrary.js';
import { buildSimpleFallbackInstructions } from '../lib/startSimpleMealFilter.js';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function normText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function countSteps(instructions) {
  const arr = Array.isArray(instructions) ? instructions : String(instructions || '').split(/\n+/);
  return arr.map((s) => String(s || '').trim()).filter(Boolean).length;
}

const forbiddenEmailPhrases = [
  'Pravidlo týdne',
  'nezačneš, se nikdy nedokončí',
  'Tři věci, na kterých záleží',
  'Drž se plánu',
  'Odpočívej mezi tréninky',
  'Dodržuj pitný režim',
  'Žádné drama. Konzistence rozhoduje',
];

const samplePlan = {
  days: [
    {
      day_name: 'Pondělí',
      date: '2026-06-30',
      meals: [
        buildSimpleStartLibraryMeal('Cottage s pečivem', 'snack'),
        buildSimpleStartLibraryMeal('Rýže s vejcem a zeleninou', 'lunch'),
      ],
      workout: { exercises: [] },
    },
  ],
  targets: { calories_per_day: 2000, protein_g: 140, carbs_g: 200, fat_g: 70 },
};

const emailHtml = buildWeeklyPlanEmailV8Document({
  structuredPlanJson: samplePlan,
  bodyMetrics: { name: 'Jan', goal: 'hubnuti', activity: 'stredni' },
  firstName: 'Jan',
  appBaseUrl: 'https://app.bodyandmindon.cz',
});

for (const phrase of forbiddenEmailPhrases) {
  check(`e-mail neobsahuje „${phrase}“`, !emailHtml.includes(phrase), phrase);
}

check('e-mail obsahuje praktický plán (jídla)', /Cottage s pečivem/i.test(emailHtml));
check('e-mail obsahuje CTA do aplikace', /Otevřít plán v aplikaci/i.test(emailHtml));

for (const recipe of SIMPLE_START_RECIPES) {
  const steps = countSteps(recipe.instructions);
  check(`library „${recipe.title}“ má ≥4 kroky`, steps >= 4, `${steps} kroků`);
}

const genericForbidden = [
  'připrav maso nebo vejce',
  'podávej s přílohou',
  'vše dej na talíř a dochutíš solí a pepřem',
];

for (const phrase of genericForbidden) {
  const hit = SIMPLE_START_RECIPES.some((r) => normText(r.instructions.join(' ')).includes(normText(phrase)));
  check(`library neobsahuje generický text „${phrase}“`, !hit, phrase);
}

const fallbackGeneric = buildSimpleFallbackInstructions('Losos s bramborami', ['losos 150 g', 'brambory 250 g', 'zelenina 100 g'], 'dinner');
check('fallback pro neznámé jídlo má ≥4 kroky', countSteps(fallbackGeneric) >= 4, `${countSteps(fallbackGeneric)} kroků`);
check('fallback neobsahuje „připrav maso nebo vejce“', !normText(fallbackGeneric.join(' ')).includes('priprav maso nebo vejce'));

const modalTargets = [
  { title: 'Cottage s pečivem', type: 'snack' },
  { title: 'Rýže s vejcem a zeleninou', type: 'lunch' },
  { title: 'Těstoviny s kuřetem', type: 'lunch' },
  { title: 'Jogurt s ovocem', type: 'snack' },
  { title: 'Ovesná kaše s proteinem', type: 'breakfast' },
];

for (const target of modalTargets) {
  const meal = buildSimpleStartLibraryMeal(target.title, target.type, { planner_source: 'simple_meal_planner_agent' });
  const model = createMealDisplayModel(meal);
  const html = buildMealRecipeModalHtml(model);
  const text = normText(html);
  const steps = countSteps(model.instructions);
  check(`modal „${target.title}“ má ≥4 kroky`, steps >= 4, `${steps} kroků`);
  check(`modal „${target.title}“ bez rate-limit`, !/prekrocen limit|rate limit/.test(text));
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
