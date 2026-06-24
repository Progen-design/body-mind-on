#!/usr/bin/env node
/**
 * Ověření hard START simple meal filtru.
 *   node scripts/verify-simple-start-meals.mjs
 */
import {
  isAllowedForStartPlan,
  getHardStartBlockReason,
  buildStartSafeFallbackMeal,
} from '../lib/startSimpleMealFilter.js';
import { scoreRecipeSimplicity } from '../lib/recipeSimplicityScore.js';

function row(name, kcal = 600, ingredients = ['kuře 150 g', 'rýže 80 g', 'zelenina']) {
  return { name_cs: name, kcal, ingredients };
}

const MUST_BLOCK = [
  'Snídaňový burrito se slaninou a vejcem',
  'Pomerančové kuře s hnědou rýží (bez lepku)',
  'Kokosové kari s ramenovými nudlemi',
  'Předkrmy: Muffiny z frittaty',
  'Losos confit s omáčkou z citronové trávy',
  'Jak udělat nejvíce sýrové mačkané těstoviny',
];

const MUST_ALLOW = [
  'Tvaroh s vločkami a banánem',
  'Kuře s rýží a zeleninou',
  'Těstoviny s tuňákem',
  'Omeleta se zeleninou',
  'Vejce s pečivem a zeleninou',
  'Jogurt s ovocem',
];

let failed = 0;

console.log('--- Hard START filter: must block ---');
for (const name of MUST_BLOCK) {
  const reason = getHardStartBlockReason(row(name), 'lunch');
  const ok = !isAllowedForStartPlan(row(name), 'lunch');
  const score = scoreRecipeSimplicity(row(name), 'lunch');
  console.log(`${ok ? 'OK' : 'FAIL'} BLOCK "${name}" reason=${reason} score=${score}`);
  if (!ok) failed += 1;
}

console.log('\n--- Hard START filter: must allow ---');
for (const name of MUST_ALLOW) {
  const reason = getHardStartBlockReason(row(name), 'lunch');
  const ok = isAllowedForStartPlan(row(name), 'lunch');
  const score = scoreRecipeSimplicity(row(name), 'lunch');
  console.log(`${ok ? 'OK' : 'FAIL'} ALLOW "${name}" reason=${reason ?? 'none'} score=${score}`);
  if (!ok) failed += 1;
}

console.log('\n--- Start safe fallback meal ---');
const fallback = buildStartSafeFallbackMeal({ type: 'lunch' }, 650, 3);
const fbOk =
  ['Rýže s vejcem a zeleninou', 'Kuře s rýží a zeleninou', 'Krůtí maso s bramborem', 'Těstoviny s tuňákem', 'Čočka s vejcem'].includes(fallback.display_name_cs) &&
  fallback.catalog_source === 'start_safe_fallback' &&
  fallback.recipe_verified === false &&
  Array.isArray(fallback.shopping_ingredient_lines) &&
  fallback.shopping_ingredient_lines.length > 0 &&
  fallback.kcal > 0;
console.log(`${fbOk ? 'OK' : 'FAIL'} fallback lunch`, {
  name: fallback.display_name_cs,
  kcal: fallback.kcal,
  source: fallback.catalog_source,
});
if (!fbOk) failed += 1;

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
