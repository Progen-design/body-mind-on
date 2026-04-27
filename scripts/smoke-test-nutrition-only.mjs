#!/usr/bin/env node

import { formatPlanHtmlForEmail, stripPlanMediaAttrsFromHtml } from '../lib/emailTemplates.js';
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
<h4>Pondělí</h4>
<p data-recipe-id="123"><b>Snídaně:</b> Ovesná kaše</p>
<p class="meal-nutrition-line"><small>B 30 g · S 50 g · T 10 g</small></p>
<p><b>Trénink tento den:</b></p>
<ul><li>Dřepy 4x10</li></ul>
<h3>Tréninkový plán</h3>
<p>Silový trénink</p>
<img src="https://img.spoonacular.com/recipes/1-312x231.jpg" data-image-url="x" data-gif-url="y" />
<p data-image-url="https://img.spoonacular.com/a.jpg" data-gif-url="https://wger.de/x.gif">foo</p>
`;

const stripped = stripPlanMediaAttrsFromHtml(sampleHtml);
const formatted = formatPlanHtmlForEmail(sampleHtml);

const forbiddenMedia = [
  '<img',
  'data-image-url',
  'data-gif-url',
  '.gif',
];

const forbiddenNutrition = [
  ...forbiddenMedia,
  'Trénink tento den',
  'Tréninkový plán',
  'wger',
  'exercise_media',
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
assertNoForbiddenToken(formatted, 'formatPlanHtmlForEmail output', forbiddenNutrition);

if (!/Ovesná kaše/i.test(formatted)) {
  console.error('Nutrition-only smoke test failed: jídla zmizela z výstupu.');
  process.exit(1);
}
if (!/Denní cíle|Kalorie|Bílkoviny/i.test(formatted)) {
  console.error('Nutrition-only smoke test failed: makra zmizela z výstupu.');
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

assertNoForbiddenToken(JSON.stringify(mealFromRecipe), 'buildShoppingItemsForMeal output', forbiddenNutrition);

console.log('Nutrition-only smoke test passed.');
