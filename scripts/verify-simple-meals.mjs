#!/usr/bin/env node
/**
 * Ověření simple meal scoring + simulace výběru z katalogu (bez DB).
 *   node scripts/verify-simple-meals.mjs
 */
import { scoreRecipeSimplicity, simplifyMealDisplayName, sortCatalogRowsForSimplePick, sanitizeIngredientLineForDisplay } from '../lib/recipeSimplicityScore.js';

const BAD = [
  'Lososová frittata',
  'Mexická kuřecí a rýžová mísa',
  'Krabí vrstvy',
  'Těstoviny s bazalkovým avokádovým pestem',
  'Grilované kuře po myslivecku',
];

const GOOD = [
  'Kuře s rýží a zeleninou',
  'Tvaroh s banánem',
  'Vejce s pečivem a zeleninou',
  'Tuňákový salát s pečivem',
  'Ovesná kaše s ovocem',
];

function row(name, kcal, ingredients = ['kuře 150 g', 'rýže 80 g', 'zelenina']) {
  return { name_cs: name, kcal, ingredients };
}

let failed = 0;

console.log('--- Simple meal score check ---');
for (const name of BAD) {
  const s = scoreRecipeSimplicity(row(name, 450), 'lunch');
  const ok = s < 0;
  console.log(`${ok ? 'OK' : 'FAIL'} BAD "${name}" → score ${s}`);
  if (!ok) failed += 1;
}
for (const name of GOOD) {
  const s = scoreRecipeSimplicity(row(name, 450), 'lunch');
  const ok = s >= 0;
  console.log(`${ok ? 'OK' : 'FAIL'} GOOD "${name}" → score ${s}`);
  if (!ok) failed += 1;
}

console.log('\n--- Display name simplify ---');
const pairs = [
  ['Mexická kuřecí a rýžová mísa', 'Kuře s rýží a zeleninou'],
  ['Lososová frittata', 'Vejce s lososem a zeleninou'],
];
for (const [raw, expected] of pairs) {
  const out = simplifyMealDisplayName(raw, 'lunch');
  const ok = out === expected;
  console.log(`${ok ? 'OK' : 'FAIL'} "${raw}" → "${out}" (expected "${expected}")`);
  if (!ok) failed += 1;
}

console.log('\n--- Catalog pick simulation (slot 650 kcal) ---');
const candidates = [
  row('Mexická kuřecí a rýžová mísa', 640, ['kuře', 'rýže', 'kukuřice', 'avokádo', 'salsa', 'koření', 'olej']),
  row('Kuře s rýží a zeleninou', 660, ['kuře', 'rýže', 'zelenina']),
  row('Krabí vrstvy', 620, ['krab', 'sýr', 'majonnaise', 'chléb']),
  row('Tvaroh s banánem', 380, ['tvaroh', 'banán']),
];
const picked = sortCatalogRowsForSimplePick(candidates, 650, 'lunch');
console.log('Pick order:', picked.map((r) => r.name_cs).join(' → '));
const top = picked[0]?.name_cs || '';
if (!/kuře|tvaroh/i.test(top)) {
  console.log(`FAIL top pick "${top}" is not simple enough`);
  failed += 1;
} else {
  console.log(`OK top pick "${top}"`);
}

console.log('\n--- Ingredient sanitize ---');
const ingOk = sanitizeIngredientLineForDisplay('4 porce soli, 2 tbsp olive oil, 1 cup rice') === 'sůl dle chuti, olive oil, rice';
console.log(`${ingOk ? 'OK' : 'FAIL'} imperial/salt sanitize`);
if (!ingOk) failed += 1;

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
