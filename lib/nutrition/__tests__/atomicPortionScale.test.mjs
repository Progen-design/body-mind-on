/**
 * Tests: atomic portion scale (nutrition + ingredients always together).
 */
import {
  scaleIngredientLine,
  scaleIngredientEntry,
  scalePortionBundle,
  applyAtomicPortionScaleToMeal,
} from '../atomicPortionScale.js';
import { applyPortionScaleToStructuredMeal, scaleMealToTarget } from '../portionScaling.js';
import { passesMacroKcalGate, getMacroCalorieDelta, calculateCaloriesFromMacros } from '../../macroKcalConsistency.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('--- atomicPortionScale ---');

{
  const line = scaleIngredientLine('rýže 80 g', 1, 1.15);
  assert(line.includes('92') || line.includes('91.9') || line.includes('92.0'), `expected ~92 g, got ${line}`);
  console.log('OK scaleIngredientLine', line);
}

{
  const obj = scaleIngredientEntry({ name: 'čedar', unit: 'g', amount: 480, original: '480 g čedaru' }, 1, 0.5);
  assert(Math.abs(Number(obj.amount) - 240) < 0.01, `amount ${obj.amount}`);
  assert(String(obj.original).includes('240'), `original ${obj.original}`);
  console.log('OK scaleIngredientEntry object');
}

{
  const bundle = scalePortionBundle(
    {
      kcal: 400,
      protein_g: 30,
      carbs_g: 40,
      fat_g: 10,
      shopping_ingredient_lines: ['vejce 2 ks', 'rýže 80 g'],
      ingredients: [{ name: 'rýže', unit: 'g', amount: 80 }],
    },
    1,
    1.15
  );
  assert(bundle.kcal === 460, `kcal ${bundle.kcal}`);
  assert(bundle.portion_multiplier === 1.15, `mult ${bundle.portion_multiplier}`);
  assert(Array.isArray(bundle.shopping_ingredient_lines), 'shopping present');
  assert(bundle.shopping_ingredient_lines[1].includes('92') || bundle.shopping_ingredient_lines[1].includes('91'), `shopping ${bundle.shopping_ingredient_lines[1]}`);
  assert(Math.abs(Number(bundle.ingredients[0].amount) - 92) < 0.1, `ing amount ${bundle.ingredients[0].amount}`);
  console.log('OK scalePortionBundle locks nutrition+ingredients');
}

{
  const meal = {
    kcal: 400,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 10,
    portion_multiplier: 1,
    shopping_ingredient_lines: ['kuřecí prsa 150 g'],
    recipe: {
      calories: 400,
      protein_g: 30,
      carbs_g: 40,
      fat_g: 10,
      portion_multiplier: 1,
      ingredients: [{ name: 'kuřecí prsa', unit: 'g', amount: 150, original: '150 g kuřecích prsou' }],
      source: 'simple_start_library',
    },
    catalog_source: 'simple_start_library',
  };
  applyPortionScaleToStructuredMeal(meal, 1.15, { simpleStartMode: true, allowUnverified: true });
  assert(meal.kcal === 460, `meal kcal ${meal.kcal}`);
  assert(meal.shopping_ingredient_lines[0].includes('172') || meal.shopping_ingredient_lines[0].includes('173'), `line ${meal.shopping_ingredient_lines[0]}`);
  assert(Math.abs(Number(meal.recipe.ingredients[0].amount) - 172.5) < 0.2, `recipe ing ${meal.recipe.ingredients[0].amount}`);
  console.log('OK applyPortionScaleToStructuredMeal scales ingredients');
}

{
  // Prove there is no nutrition-only public path: scaleMealToTarget with ingredients scales them too
  const scaled = scaleMealToTarget(
    {
      kcal: 500,
      protein_g: 40,
      carbs_g: 50,
      fat_g: 15,
      shopping_ingredient_lines: ['tvaroh 200 g'],
      portion_multiplier: 1,
    },
    575,
    { simpleStartMode: true }
  );
  assert(scaled.portion_multiplier >= 0.85 && scaled.portion_multiplier <= 1.15, `mult ${scaled.portion_multiplier}`);
  assert(scaled.shopping_ingredient_lines[0] !== 'tvaroh 200 g' || scaled.portion_multiplier === 1, 'shopping scaled when mult≠1');
  console.log('OK scaleMealToTarget includes shopping lines', scaled.shopping_ingredient_lines[0], scaled.portion_multiplier);
}

console.log('--- macro kcal gate ±10% ---');

{
  // 26.89*4 + 52*4 + 28*9 = 107.56 + 208 + 252 = 567.56 → ~2 % vs 579
  const janin = getMacroCalorieDelta(579, 26.89, 52, 28);
  assert(passesMacroKcalGate(579, 26.89, 52, 28) === true, `janin-like should pass, delta ${janin.deltaPercent}%`);
  console.log('OK janin-like passes', janin.deltaPercent + '%');
}

{
  assert(passesMacroKcalGate(115, 5, 10, 2) === false, '30% delta must fail');
  assert(getMacroCalorieDelta(115, 5, 10, 2).status === 'ERROR', 'status ERROR');
  console.log('OK large delta fails gate');
}

{
  // Original bug: multiplier scaled macros+kcal together → arithmetic still ~OK (~5.5 %)
  const rel = Math.abs(904 - 854) / 904;
  assert(rel < 0.1, 'arithmetic gate alone would miss nutrition-only scale bug');
  console.log('OK arithmetic gate alone misses old bug (rel', (rel * 100).toFixed(1), '%) — 2a is the real fix');
}

console.log('All atomicPortionScale + macro gate checks passed.');
