/**
 * Unit tests for Spoonacular import ingredient gate (English names, pre-translation).
 */
import {
  countMainIngredients,
  evaluateImportGate,
  getMainIngredientLimit,
  isNotARecipeTitle,
} from '../catalogImportGate.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function ing(name) {
  return { nameClean: name, name };
}

console.log('--- countMainIngredients ---');

{
  const ingredients = [
    ing('chicken breast'),
    ing('rice'),
    ing('broccoli'),
    ing('salt'),
    ing('olive oil'),
    ing('black pepper'),
  ];
  assert(countMainIngredients(ingredients) === 3, `seasonings excluded, got ${countMainIngredients(ingredients)}`);
  console.log('OK seasonings excluded from count');
}

{
  const breakfast = [
    ing('eggs'),
    ing('oats'),
    ing('banana'),
    ing('milk'),
    ing('cinnamon'),
    ing('honey'),
  ];
  assert(countMainIngredients(breakfast) === 5, `breakfast mains ${countMainIngredients(breakfast)}`);
  assert(getMainIngredientLimit('snidane') === 6, 'snidane limit 6');
  const gate = evaluateImportGate(
    { title: 'Simple Oats', extendedIngredients: breakfast, nutrition: { nutrients: [
      { name: 'Calories', amount: 350 },
      { name: 'Protein', amount: 15 },
      { name: 'Carbohydrates', amount: 40 },
      { name: 'Fat', amount: 8 },
    ] } },
    'snidane',
  );
  assert(gate.pass, `snidane 5 mains passes limit 6: ${gate.reason}`);
  breakfast.push(ing('yogurt'), ing('berries'));
  const failGate = evaluateImportGate(
    { title: 'Loaded Oats', extendedIngredients: breakfast, nutrition: { nutrients: [
      { name: 'Calories', amount: 400 },
      { name: 'Protein', amount: 18 },
      { name: 'Carbohydrates', amount: 45 },
      { name: 'Fat', amount: 10 },
    ] } },
    'snidane',
  );
  assert(!failGate.pass && failGate.reason === 'too_complex', `snidane 7 mains rejected: ${failGate.reason}`);
  console.log('OK snidane allows 6, rejects 7');
}

{
  const lunch = [
    ing('chicken'),
    ing('rice'),
    ing('peppers'),
    ing('onion'),
    ing('tomatoes'),
    ing('beans'),
    ing('salt'),
  ];
  assert(countMainIngredients(lunch) === 6, `lunch mains ${countMainIngredients(lunch)}`);
  assert(getMainIngredientLimit('obed') === 6, 'obed limit 6');
  const okGate = evaluateImportGate(
    { title: 'Chicken Bowl', extendedIngredients: lunch, nutrition: { nutrients: [
      { name: 'Calories', amount: 500 },
      { name: 'Protein', amount: 35 },
      { name: 'Carbohydrates', amount: 45 },
      { name: 'Fat', amount: 12 },
    ] } },
    'obed',
  );
  assert(okGate.pass, '6 mains passes obed limit');
  lunch.push(ing('avocado'));
  const failGate = evaluateImportGate(
    { title: 'Chicken Bowl Plus', extendedIngredients: lunch, nutrition: { nutrients: [
      { name: 'Calories', amount: 550 },
      { name: 'Protein', amount: 36 },
      { name: 'Carbohydrates', amount: 46 },
      { name: 'Fat', amount: 18 },
    ] } },
    'obed',
  );
  assert(!failGate.pass && failGate.reason === 'too_complex', `7 mains rejected: ${failGate.reason}`);
  console.log('OK obed allows 6, rejects 7');
}

{
  assert(isNotARecipeTitle('How to Make Better Smoothies'), 'how to title');
  assert(isNotARecipeTitle('10 Best Ways to Cook Chicken'), 'best ways');
  assert(!isNotARecipeTitle('Grilled Chicken with Rice'), 'real recipe title');
  const gate = evaluateImportGate(
    { title: 'How to upgrade your breakfast?', extendedIngredients: [ing('oats')], nutrition: { nutrients: [
      { name: 'Calories', amount: 200 },
      { name: 'Protein', amount: 8 },
      { name: 'Carbohydrates', amount: 30 },
      { name: 'Fat', amount: 4 },
    ] } },
    'snidane',
  );
  assert(!gate.pass && gate.reason === 'not_a_recipe', `clickbait rejected: ${gate.reason}`);
  console.log('OK clickbait titles rejected');
}

console.log('ALL countMainIngredients tests passed');
