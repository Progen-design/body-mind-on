/**
 * Shopping list aggregation — sums same ingredient + unit + qualifier across meals/days.
 *   node lib/nutrition/__tests__/shoppingListAggregate.test.mjs
 */
import assert from 'node:assert/strict';
import {
  aggregateShoppingIngredientLines,
  collectShoppingLinesFromMeals,
  sumMealIngredientAmounts,
  getAggregatedIngredientAmount,
} from '../../shoppingListAggregate.js';
import {
  aggregateShoppingIngredientLinesForDayIndex,
  aggregateShoppingIngredientLinesFromStructuredPlan,
} from '../../spoonacularShopping.js';
import { flattenShoppingSections, buildShoppingSectionsForWeek } from '../../shoppingListBuilder.js';

function assertAmount(label, actual, expected) {
  assert.equal(actual, expected, `${label}: expected ${expected}, got ${actual}`);
}

const tuesdayMeals = [
  {
    shopping_ingredient_lines: [
      'kuřecí prsa 260 g (syrové)',
      'olivový olej 15 g',
      'zelenina 200 g',
      'rýže 80 g (suché)',
    ],
  },
  {
    shopping_ingredient_lines: [
      'kuřecí prsa 315 g (syrové)',
      'olivový olej 10 g',
      'zelenina 205 g',
    ],
  },
  {
    shopping_ingredient_lines: [
      'banán 1 ks',
      'tvaroh 200 g',
    ],
  },
];

const rawLines = collectShoppingLinesFromMeals(tuesdayMeals);
const aggregated = aggregateShoppingIngredientLines(rawLines);

assert(aggregated.some((line) => /kuřecí prsa 575 g \(syrové\)/i.test(line)), aggregated.join(' | '));
assert(aggregated.some((line) => /olivový olej 25 g/i.test(line)), aggregated.join(' | '));
assert(aggregated.some((line) => /zelenina 405 g/i.test(line)), aggregated.join(' | '));
assert.equal(aggregated.filter((line) => /kuřecí prsa/i.test(line)).length, 1);
assert.equal(aggregated.filter((line) => /olivový olej/i.test(line)).length, 1);

const chickenMealSum = sumMealIngredientAmounts(tuesdayMeals, /kuřecí prsa/i, 'g', 'syrové');
const chickenAgg = getAggregatedIngredientAmount(aggregated, /kuřecí prsa/i, 'g', 'syrové');
assertAmount('kuřecí prsa meal sum', chickenMealSum, 575);
assertAmount('kuřecí prsa aggregated', chickenAgg, 575);

const oilMealSum = sumMealIngredientAmounts(tuesdayMeals, /olivový olej/i, 'g');
const oilAgg = getAggregatedIngredientAmount(aggregated, /olivový olej/i, 'g');
assertAmount('olej meal sum', oilMealSum, 25);
assertAmount('olej aggregated', oilAgg, 25);

const vegMealSum = sumMealIngredientAmounts(tuesdayMeals, /^zelenina$/i, 'g');
const vegAgg = getAggregatedIngredientAmount(aggregated, /^zelenina$/i, 'g');
assertAmount('zelenina meal sum', vegMealSum, 405);
assertAmount('zelenina aggregated', vegAgg, 405);

// Different qualifiers stay separate
const qualLines = aggregateShoppingIngredientLines([
  'rýže 80 g (suché)',
  'rýže 80 g (vařené)',
  'rýže 80 g (suché)',
]);
assert.equal(qualLines.filter((l) => /suché/i.test(l)).length, 1);
assert.equal(qualLines.filter((l) => /vařené/i.test(l)).length, 1);
assert(getAggregatedIngredientAmount(qualLines, /rýže/i, 'g', 'suché') === 160);

// Different units stay separate
const unitLines = aggregateShoppingIngredientLines(['banán 1 ks', 'banán 120 g']);
assert.equal(unitLines.length, 2);

// Day index from structured plan
const structuredPlan = {
  days: [
    { meals: tuesdayMeals },
    {
      meals: [
        { shopping_ingredient_lines: ['kuřecí prsa 100 g (syrové)', 'vejce 2 ks'] },
      ],
    },
  ],
};
const dayList = aggregateShoppingIngredientLinesForDayIndex(structuredPlan, 0);
assert(getAggregatedIngredientAmount(dayList, /kuřecí prsa/i, 'g', 'syrové') === 575);

const weekList = aggregateShoppingIngredientLinesFromStructuredPlan(structuredPlan);
assert(getAggregatedIngredientAmount(weekList, /kuřecí prsa/i, 'g', 'syrové') === 675);

const weekSections = buildShoppingSectionsForWeek({
  planWeekDays: [
    { dayName: 'Úterý', dateStr: '21. 7.', originalIndex: 0, meals: tuesdayMeals },
    { dayName: 'Středa', dateStr: '22. 7.', originalIndex: 1, meals: structuredPlan.days[1].meals },
  ],
  structuredPlan,
});
const flatWeek = flattenShoppingSections(weekSections);
assert(getAggregatedIngredientAmount(flatWeek, /kuřecí prsa/i, 'g', 'syrové') === 675);

console.log('OK shoppingListAggregate.test — all checks passed');
