#!/usr/bin/env node

import {
  formatPlanHtmlForEmail,
  stripPlanMediaAttrsFromHtml,
  stripNutritionOnlyTrainingFromPlanHtml,
} from '../lib/emailTemplates.js';
import { buildPlanPromptProfileJson } from '../lib/compactPlanPrompt.js';
import {
  compactMemoryItemsForPlan,
  isPlanRelevantMemoryType,
} from '../lib/services/planMemoryCompact.js';
import {
  buildShoppingItemsForMeal,
  buildShoppingSectionsForWeek,
  flattenShoppingSections,
} from '../lib/shoppingListBuilder.js';

const sampleHtml = `
<h3>Tvoje čísla</h3>
<ul><li><strong>Váha:</strong> 80 kg</li></ul>
<h3>Denní cíle (makra)</h3>
<ul><li><strong>Kalorie:</strong> 2200 kcal</li><li><strong>Bílkoviny:</strong> 140 g</li></ul>
<h3>Jídelníček (celý týden)</h3>
<h3>Pondělí</h3>
<p data-recipe-id="123"><b>Snídaně:</b> Ovesná kaše</p>
<p class="meal-nutrition-line"><small>B 30 g · S 50 g · T 10 g</small></p>
<p><small><em>Součet dne (orientačně): 186 kcal, B 10 g, S 8 g, T 13 g</em></small></p>
<p><b>Trénink tento den:</b></p>
<ul><li>Dřepy 4x10</li></ul>
<h3>Tréninkový plán</h3>
<p>Silový trénink</p>
<img src="https://img.spoonacular.com/recipes/1-312x231.jpg" data-image-url="x" data-gif-url="y" />
<p data-image-url="https://img.spoonacular.com/a.jpg" data-gif-url="https://wger.de/x.gif">foo</p>
`;

const stripped = stripPlanMediaAttrsFromHtml(sampleHtml);
const strippedTrain = stripNutritionOnlyTrainingFromPlanHtml(sampleHtml);
const formatted = formatPlanHtmlForEmail(sampleHtml);

const forbiddenMedia = ['<img', 'data-image-url', 'data-gif-url', '.gif', 'exercise_media'];

const forbiddenTrainingInEmail = [
  ...forbiddenMedia,
  'Trénink tento den',
  'Tréninkový plán',
  'wger',
  'wger.de',
];

function assertNoForbiddenToken(value, label, tokens) {
  for (const token of tokens) {
    if (String(value).toLowerCase().includes(token.toLowerCase())) {
      console.error(`Nutrition-only smoke test failed: token "${token}" nalezen v ${label}.`);
      process.exit(1);
    }
  }
}

assertNoForbiddenToken(stripped, 'stripPlanMediaAttrsFromHtml output', forbiddenMedia);
assertNoForbiddenToken(strippedTrain, 'stripNutritionOnlyTrainingFromPlanHtml output', [
  ...forbiddenMedia,
  'Trénink tento den',
  'Tréninkový plán',
]);
assertNoForbiddenToken(formatted, 'formatPlanHtmlForEmail output', forbiddenTrainingInEmail);

if (!/Ovesná kaše/i.test(formatted)) {
  console.error('Nutrition-only smoke test failed: jídla zmizela z výstupu.');
  process.exit(1);
}
if (!/Denní cíle|Kalorie|Bílkoviny/i.test(formatted)) {
  console.error('Nutrition-only smoke test failed: makra zmizela z výstupu.');
  process.exit(1);
}
if (!/Co dnes jíst/i.test(formatted)) {
  console.error('Nutrition-only smoke test failed: denní karta se nevykreslila.');
  process.exit(1);
}
if (!/Součet dne \(orientačně\)/i.test(formatted)) {
  console.error('Nutrition-only smoke test failed: součet dne se nezobrazil.');
  process.exit(1);
}

const profileJson = buildPlanPromptProfileJson({
  goal: 'hubnuti',
  user_id: 'must-not-appear',
  email: 'secret@example.com',
  meals_per_day: 3,
  allergies: 'kešu',
});
if (/user_id|secret@|must-not-appear/i.test(profileJson)) {
  console.error('Nutrition-only smoke test failed: buildPlanPromptProfileJson obsahuje identifikátory.');
  process.exit(1);
}

const memEmpty = compactMemoryItemsForPlan([]);
if (memEmpty.summary !== '' || memEmpty.itemsUsed !== 0 || memEmpty.truncated !== false) {
  console.error('Nutrition-only smoke test failed: compactMemoryItemsForPlan prázdný vstup.');
  process.exit(1);
}

const longDummy = 'x'.repeat(500);
const memBounded = compactMemoryItemsForPlan(
  Array.from({ length: 20 }, (_, i) => ({ type: `shared_food_${i}`, content: longDummy })),
  { maxItems: 8, maxTotalChars: 1200, maxItemChars: 220 }
);
if (memBounded.summary.length > 1200) {
  console.error('Nutrition-only smoke test failed: memory summary překročil maxTotalChars.');
  process.exit(1);
}
if (memBounded.itemsUsed > 8) {
  console.error('Nutrition-only smoke test failed: memory itemsUsed překročil maxItems.');
  process.exit(1);
}

if (!isPlanRelevantMemoryType('shared_food_preference') || isPlanRelevantMemoryType('random_chat')) {
  console.error('Nutrition-only smoke test failed: isPlanRelevantMemoryType neočekávaná logika.');
  process.exit(1);
}

const profileWithCoach = buildPlanPromptProfileJson({
  goal: 'hubnuti',
  user_id: 'must-not-appear',
  email: 'secret@example.com',
  meals_per_day: 3,
  allergies: 'kešu',
  _coach_memory_summary: 'Uživatel chce rychlé snídaně.'.repeat(200),
});
if (profileWithCoach.length > 8000) {
  console.error('Nutrition-only smoke test failed: coach summary nebyl omezen v profilu.');
  process.exit(1);
}
if (!/coach_memory_summary/i.test(profileWithCoach)) {
  console.error('Nutrition-only smoke test failed: coach_memory_summary chybí v profilu.');
  process.exit(1);
}
if (/must-not-appear|secret@/i.test(profileWithCoach)) {
  console.error('Nutrition-only smoke test failed: profil s pamětí stále leakuje ID.');
  process.exit(1);
}
const coachMatch = profileWithCoach.match(/"coach_memory_summary"\s*:\s*"([^"]*)"/);
if (!coachMatch || coachMatch[1].length > 1200) {
  console.error('Nutrition-only smoke test failed: coach_memory_summary value delší než 1200.');
  process.exit(1);
}

const twoDaysNoExplicitWorkout = `
<h3>Jídelníček</h3>
<h3>Pondělí</h3>
<p><b>Snídaně:</b> Ovesná kaše</p>
<h3>Úterý</h3>
<p><b>Oběd:</b> Polévka</p>
<h3>Suplementace</h3>
<p>Vitamín D</p>
`;
const formattedTwo = formatPlanHtmlForEmail(twoDaysNoExplicitWorkout);
const trainHeadings = formattedTwo.match(/Trénink tento den/gi) || [];
if (trainHeadings.length > 0) {
  console.error('Nutrition-only smoke test failed: neočekávaný trénink v e-mailu u dní bez tréninku.');
  process.exit(1);
}

const sections = buildShoppingSectionsForWeek({
  planWeekDays: [
    {
      dayName: 'Sobota',
      dateStr: '25. 4.',
      originalIndex: 0,
      meals: [
        { type: 'Snídaně', text: 'Míchaná vejce na ghí (3 vejce, 1 lžíce ghí)' },
        { type: 'Oběd', text: 'Kuřecí salát' },
      ],
    },
  ],
  recipes: [],
  structuredPlan: null,
  mealOverrides: {},
});

if (!Array.isArray(sections) || sections.length !== 1) {
  console.error('Nutrition-only smoke test failed: shopping sections nejsou validní.');
  process.exit(1);
}
if (!Array.isArray(sections[0].items) || sections[0].items.length === 0) {
  console.error('Nutrition-only smoke test failed: shopping section je prázdná.');
  process.exit(1);
}
const flattened = flattenShoppingSections(sections);
if (!Array.isArray(flattened) || flattened.length === 0) {
  console.error('Nutrition-only smoke test failed: flattenShoppingSections vrátil prázdný seznam.');
  process.exit(1);
}

const mealFromRecipe = buildShoppingItemsForMeal({
  mealText: 'Míchaná vejce',
  recipeHtml: '<p><b>Suroviny:</b></p><ul><li>3 vejce</li><li>10 g másla</li></ul>',
});
if (!Array.isArray(mealFromRecipe.items) || mealFromRecipe.items.length === 0 || mealFromRecipe.source !== 'recipe') {
  console.error('Nutrition-only smoke test failed: buildShoppingItemsForMeal (recipe) nevrátil validní data.');
  process.exit(1);
}

const mealEstimated = buildShoppingItemsForMeal({
  mealText: 'Ovesná kaše',
  recipeHtml: '',
});
if (!mealEstimated.isEstimated || mealEstimated.source !== 'estimated' || !mealEstimated.note) {
  console.error('Nutrition-only smoke test failed: buildShoppingItemsForMeal fallback estimated nefunguje.');
  process.exit(1);
}

assertNoForbiddenToken(JSON.stringify(mealFromRecipe), 'buildShoppingItemsForMeal output', forbiddenMedia);

console.log('Nutrition-only smoke test passed.');
