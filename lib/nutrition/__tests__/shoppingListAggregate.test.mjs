/**
 * Shopping list aggregation against REAL active plan in Supabase.
 * Canonical source: meal.recipe.ingredients (not shopping_ingredient_lines).
 *
 *   node lib/nutrition/__tests__/shoppingListAggregate.test.mjs
 *   node lib/nutrition/__tests__/shoppingListAggregate.test.mjs --email=janprikopa@gmail.com
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  aggregateShoppingIngredientLines,
  collectShoppingLinesFromMeals,
  countShoppingLinesForIngredient,
  getAggregatedIngredientAmount,
  sumRecipeIngredientAmounts,
} from '../../shoppingListAggregate.js';
import { aggregateShoppingIngredientLinesForDayIndex } from '../../spoonacularShopping.js';
import { buildShoppingSectionForDay } from '../../shoppingListBuilder.js';

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const emailArg = (process.argv.find((a) => a.startsWith('--email=')) || '--email=janprikopa@gmail.com')
  .slice('--email='.length)
  .trim()
  .toLowerCase();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE credentials for shopping aggregate test');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: planRow, error: planErr } = await supabase
  .from('ai_generated_plans')
  .select('id, email, structured_plan_json')
  .eq('is_active', true)
  .eq('email', emailArg)
  .maybeSingle();

if (planErr || !planRow?.structured_plan_json?.days?.length) {
  console.error('Active plan not found for', emailArg, planErr?.message || '');
  process.exit(1);
}

const structuredPlan = planRow.structured_plan_json;
const days = structuredPlan.days;

function mealsWithoutShoppingLines(dayMeals) {
  return (dayMeals || []).map((meal) => {
    const copy = { ...meal };
    delete copy.shopping_ingredient_lines;
    if (copy.recipe && typeof copy.recipe === 'object') {
      copy.recipe = { ...copy.recipe };
      delete copy.recipe.shopping_ingredient_lines;
    }
    return copy;
  });
}

function findDayWithDuplicateZelenina() {
  for (let i = 0; i < days.length; i += 1) {
    const meals = days[i]?.meals || [];
    const records = meals.flatMap((m) => (Array.isArray(m?.recipe?.ingredients) ? m.recipe.ingredients : []));
    const zeleninaCount = records.filter((ing) => /^zelenina$/i.test(String(ing?.name || ''))).length;
    if (zeleninaCount >= 2) {
      return { dayIndex: i, meals, date: days[i]?.date || null };
    }
  }
  return null;
}

const hit = findDayWithDuplicateZelenina();
assert.ok(hit, 'No day with zelenina in 2+ meals found in active plan');

const { dayIndex, meals, date } = hit;
const recipeOnlyMeals = mealsWithoutShoppingLines(meals);

const rawLines = collectShoppingLinesFromMeals(recipeOnlyMeals);
assert.ok(countShoppingLinesForIngredient(rawLines, /^zelenina$/i, 'g') >= 2,
  `Expected 2+ raw zelenina lines from recipe.ingredients, got: ${rawLines.filter((l) => /zelenina/i.test(l)).join(' | ')}`);

const aggregated = aggregateShoppingIngredientLinesForDayIndex(
  { days: [{ ...days[dayIndex], meals: recipeOnlyMeals }] },
  0,
);
const zeleninaLines = aggregated.filter((line) => /^zelenina\b/i.test(line));
assert.equal(zeleninaLines.length, 1,
  `Expected 1 aggregated zelenina row, got ${zeleninaLines.length}: ${zeleninaLines.join(' | ')}`);

const expectedSum = sumRecipeIngredientAmounts(recipeOnlyMeals, /^zelenina$/i, 'g');
const aggregatedAmount = getAggregatedIngredientAmount(aggregated, /^zelenina$/i, 'g');
assert.equal(aggregatedAmount, expectedSum,
  `Aggregated zelenina ${aggregatedAmount} g != recipe sum ${expectedSum} g`);

const uiSection = buildShoppingSectionForDay({
  dayName: 'Test',
  dateStr: date || '',
  meals: [],
  structuredPlan: { days: [{ ...days[dayIndex], meals: recipeOnlyMeals }] },
  dayIndex: 0,
});
const uiZelenina = (uiSection.items || []).filter((line) => /^zelenina\b/i.test(line));
assert.equal(uiZelenina.length, 1,
  `UI section expected 1 zelenina row, got: ${uiZelenina.join(' | ')}`);

console.log('OK shoppingListAggregate.test — active plan', emailArg, 'day', date || dayIndex,
  'zelenina', zeleninaLines[0], `(recipe.ingredients sum ${expectedSum} g)`);
console.log('  source: meal.recipe.ingredients (shopping_ingredient_lines stripped in test)');
