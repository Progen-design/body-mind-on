/**
 * Tests: atomic portion scale — cookable rounding + nutrition from plate.
 */
import {
  scaleIngredientLine,
  scaleIngredientEntry,
  scalePortionBundle,
  applyAtomicPortionScaleToMeal,
  roundCookableAmount,
  validateDiscreteIngredientAmount,
  classifyIngredientUnit,
  boostMealWithFlexibleCatchUp,
  catchUpFlexibleIngredients,
} from '../atomicPortionScale.js';
import { applyPortionScaleToStructuredMeal, scaleMealToTarget } from '../portionScaling.js';
import { passesMacroKcalGate, getMacroCalorieDelta } from '../../macroKcalConsistency.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('--- cookable rounding ---');

{
  assert(classifyIngredientUnit('g') === 'flexible', 'g flexible');
  assert(classifyIngredientUnit('ks') === 'discrete', 'ks discrete');
  assert(classifyIngredientUnit('plátky') === 'discrete', 'platky discrete');
  assert(classifyIngredientUnit('konzerva') === 'discrete', 'konzerva discrete');
  assert(roundCookableAmount(92, 'g') === 90 || roundCookableAmount(92, 'g') === 95, `92g→${roundCookableAmount(92, 'g')}`);
  assert(roundCookableAmount(3.45, 'ks', 'vejce') === 3.5, `egg ${roundCookableAmount(3.45, 'ks', 'vejce')}`);
  assert(roundCookableAmount(0.575, 'ks', 'okurka') === 0.5, `okurka ${roundCookableAmount(0.575, 'ks', 'okurka')}`);
  assert(roundCookableAmount(1.15, 'konzerva', 'tuňák') === 1, `can ${roundCookableAmount(1.15, 'konzerva', 'tuňák')}`);
  assert(roundCookableAmount(2.3, 'plátky', 'celozrnný chléb') === 2.5, `bread ${roundCookableAmount(2.3, 'plátky', 'celozrnný chléb')}`);
  console.log('OK roundCookableAmount rules');
}

{
  const bad = validateDiscreteIngredientAmount({ name: 'vejce', unit: 'ks', amount: 3.45 });
  assert(bad.ok === false, '3.45 eggs must fail validator');
  const good = validateDiscreteIngredientAmount({ name: 'vejce', unit: 'ks', amount: 3.5 });
  assert(good.ok === true, '3.5 eggs ok');
  const can = validateDiscreteIngredientAmount({ name: 'tuňák', unit: 'konzerva', amount: 1.15 });
  assert(can.ok === false, '1.15 can must fail');
  console.log('OK validateDiscreteIngredientAmount');
}

console.log('--- atomicPortionScale ---');

{
  const line = scaleIngredientLine('rýže 80 g', 1, 1.15);
  // 80*1.15=92 → nearest 5g = 90 or 95
  assert(/9[05]/.test(line), `expected ~90/95 g, got ${line}`);
  console.log('OK scaleIngredientLine flexible', line);
}

{
  const egg = scaleIngredientLine('vejce 3 ks', 1, 1.15);
  assert(!egg.includes('3.45') && !egg.includes('3,45'), `egg line ${egg}`);
  assert(/3([.,]5)?|7\/2|3 1\/2/.test(egg) || egg.includes('3.5') || egg.includes('4') || egg.includes('3'), `egg cookable ${egg}`);
  const v = validateDiscreteIngredientAmount(egg);
  assert(v.ok, `egg must validate: ${egg} ${JSON.stringify(v)}`);
  console.log('OK scaleIngredientLine discrete egg', egg);
}

{
  const obj = scaleIngredientEntry({ name: 'čedar', unit: 'g', amount: 480, original: '480 g čedaru' }, 1, 0.5);
  assert(Math.abs(Number(obj.amount) - 240) < 0.01, `amount ${obj.amount}`);
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
      ingredients: [
        { name: 'vejce', unit: 'ks', amount: 2 },
        { name: 'rýže', unit: 'g', amount: 80 },
      ],
    },
    1,
    1.15
  );
  assert(bundle.kcal > 0, `kcal ${bundle.kcal}`);
  assert(validateDiscreteIngredientAmount(bundle.ingredients[0]).ok, `egg amount ${bundle.ingredients[0].amount}`);
  assert(Number(bundle.ingredients[0].amount) % 0.5 === 0, 'egg half-step');
  assert(Number(bundle.ingredients[1].amount) % 5 === 0, `rice 5g ${bundle.ingredients[1].amount}`);
  console.log('OK scalePortionBundle cookable', bundle.kcal, bundle.ingredients);
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
      source: 'simple_start',
    },
    catalog_source: 'simple_start',
  };
  applyPortionScaleToStructuredMeal(meal, 1.15, { simpleStartMode: true, allowUnverified: true });
  assert(Number(meal.recipe.ingredients[0].amount) % 5 === 0, `meat ${meal.recipe.ingredients[0].amount}`);
  assert(meal.kcal > 0, `meal kcal ${meal.kcal}`);
  console.log('OK applyPortionScaleToStructuredMeal', meal.kcal, meal.recipe.ingredients[0].amount);
}

{
  // Flex catch-up: eggs stay discrete; rice grows to close kcal gap
  const meal = {
    kcal: 500,
    protein_g: 30,
    carbs_g: 50,
    fat_g: 15,
    portion_multiplier: 1,
    shopping_ingredient_lines: ['vejce 2 ks', 'rýže 80 g'],
    recipe: {
      calories: 500,
      protein_g: 30,
      carbs_g: 50,
      fat_g: 15,
      portion_multiplier: 1,
      ingredients: [
        { name: 'vejce', unit: 'ks', amount: 2 },
        { name: 'rýže', unit: 'g', amount: 80 },
      ],
    },
  };
  const beforeEgg = meal.recipe.ingredients[0].amount;
  boostMealWithFlexibleCatchUp(meal, 620);
  assert(meal.recipe.ingredients[0].amount === beforeEgg, 'eggs must stay locked');
  assert(Number(meal.recipe.ingredients[1].amount) > 80, `rice must grow, got ${meal.recipe.ingredients[1].amount}`);
  assert(Number(meal.recipe.ingredients[1].amount) % 5 === 0, 'rice stays 5g steps');
  assert(meal.kcal > 500, `kcal grew to ${meal.kcal}`);
  console.log('OK flex catch-up', meal.kcal, meal.recipe.ingredients);
}

{
  const list = [
    { name: 'vejce', unit: 'ks', amount: 2 },
    { name: 'rýže', unit: 'g', amount: 80 },
  ];
  const r = catchUpFlexibleIngredients(list, 100);
  assert(r.list[0].amount === 2, 'discrete untouched');
  assert(r.list[1].amount > 80, 'rice increased');
  assert(r.addedKcal > 50, `added kcal ${r.addedKcal}`);
  console.log('OK catchUpFlexibleIngredients', r.addedKcal, r.list[1].amount);
}

{
  const scaled = scaleMealToTarget(
    {
      kcal: 500,
      protein_g: 40,
      carbs_g: 50,
      fat_g: 15,
      shopping_ingredient_lines: ['tvaroh 200 g'],
      ingredients: [{ name: 'tvaroh', unit: 'g', amount: 200 }],
      portion_multiplier: 1,
    },
    575,
    { simpleStartMode: true }
  );
  assert(scaled.portion_multiplier >= 0.85 && scaled.portion_multiplier <= 1.28, `mult ${scaled.portion_multiplier}`);
  console.log('OK scaleMealToTarget', scaled.shopping_ingredient_lines[0], scaled.portion_multiplier);
}

{
  // Re-round already-fractional meal at same nominal mult
  const meal = {
    kcal: 450,
    protein_g: 32.7,
    carbs_g: 30,
    fat_g: 22,
    portion_multiplier: 1.15,
    shopping_ingredient_lines: ['vejce 3.45 ks'],
    recipe: {
      calories: 450,
      protein_g: 32.7,
      carbs_g: 30,
      fat_g: 22,
      portion_multiplier: 1.15,
      ingredients: [{ name: 'vejce', unit: 'ks', amount: 3.45, original: '3.45 ks vejce' }],
    },
  };
  applyAtomicPortionScaleToMeal(meal, 1.15);
  assert(validateDiscreteIngredientAmount(meal.recipe.ingredients[0]).ok, `rounded ${meal.recipe.ingredients[0].amount}`);
  assert(validateDiscreteIngredientAmount(meal.shopping_ingredient_lines[0]).ok, meal.shopping_ingredient_lines[0]);
  console.log('OK re-round fractional eggs', meal.recipe.ingredients[0].amount, meal.kcal);
}

console.log('--- macro kcal gate ±10% ---');

{
  const janin = getMacroCalorieDelta(579, 26.89, 52, 28);
  assert(passesMacroKcalGate(579, 26.89, 52, 28) === true, `janin-like should pass, delta ${janin.deltaPercent}%`);
  console.log('OK janin-like passes', janin.deltaPercent + '%');
}

{
  assert(passesMacroKcalGate(115, 5, 10, 2) === false, '30% delta must fail');
  console.log('OK large delta fails gate');
}

console.log('All atomicPortionScale + cookable checks passed.');
