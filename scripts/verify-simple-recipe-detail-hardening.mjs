#!/usr/bin/env node
/**
 * Ověření, že START jídla nemají pod jednoduchým názvem složitý katalogový detail.
 *   node scripts/verify-simple-recipe-detail-hardening.mjs
 */
import {
  getFullContentStartBlockReason,
  isAllowedForSimpleStartPlan,
  buildStartSafeFallbackMeal,
  buildSimpleFallbackInstructions,
  findStartFallbackTemplate,
} from '../lib/startSimpleMealFilter.js';
import { recipePartsToHtml } from '../lib/recipeDetailHtml.js';

function row(partial) {
  return {
    id: partial.id ?? 1,
    name_cs: partial.name_cs || 'Jídlo',
    name_en: partial.name_en || '',
    meal_type: partial.meal_type || 'obed',
    kcal: partial.kcal ?? 600,
    protein_g: 30,
    carbs_g: 50,
    fat_g: 15,
    ingredients: partial.ingredients || [],
    instructions: partial.instructions || '',
    instructions_cs: partial.instructions_cs || partial.instructions || '',
    source: partial.source || 'spoonacular',
    ...partial,
  };
}

function htmlText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

let failed = 0;

function check(label, ok, detail = '') {
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

console.log('--- Full-content START validation ---');

const pastitsio = row({
  id: 205,
  name_cs: 'Brambory s vejcem',
  name_en: 'Pastitsio',
  meal_type: 'vecere',
  ingredients: [
    '8 lžíce másla',
    '1 libra ziti',
    '4 vejce',
    '2 hrnky feta sýra',
    '4 hrnky masové omáčky',
  ],
  instructions: 'Layer pasta with meat sauce and bake.',
});
const pastitsioReason = getFullContentStartBlockReason(pastitsio, 'dinner', { name_cs: 'Brambory s vejcem', type: 'dinner' });
check(
  '1) Brambory s vejcem + pastitsio ingredience = odmítnout',
  !isAllowedForSimpleStartPlan(pastitsio, { name_cs: 'Brambory s vejcem', type: 'dinner' }),
  pastitsioReason
);

const kari = row({
  name_cs: 'Kuře s rýží a zeleninou',
  name_en: 'Coconut chicken curry',
  ingredients: ['kuřecí prsa 150 g', 'kokosové mléko 200 ml', 'kari pasta 1 lžíce', 'rýže 80 g'],
});
const kariReason = getFullContentStartBlockReason(kari, 'lunch', { name_cs: 'Kuře s rýží a zeleninou', type: 'lunch' });
check(
  '2) Kuře s rýží + kokos/kari = odmítnout',
  Boolean(kariReason),
  kariReason
);

const simple = row({
  name_cs: 'Brambory s vejcem',
  ingredients: ['brambory 300 g', 'vejce 2 ks', 'zelenina 100 g', 'olivový olej 1 lžíce'],
  instructions: 'Uvař brambory. Usmaž vejce. Podávej se zeleninou.',
});
check(
  '3) vejce + brambory + zelenina = povolit',
  isAllowedForSimpleStartPlan(simple, { name_cs: 'Brambory s vejcem', type: 'dinner' }),
  getFullContentStartBlockReason(simple, 'dinner') || 'none'
);

const manyIng = row({
  name_cs: 'Kuře s rýží',
  ingredients: Array.from({ length: 13 }, (_, i) => `surovina ${i + 1} 50 g`),
});
check(
  '4) moc složitých surovin = odmítnout',
  Boolean(getFullContentStartBlockReason(manyIng, 'lunch')),
  getFullContentStartBlockReason(manyIng, 'lunch')
);

const jogurtComplex = row({
  name_cs: 'Jogurt s ovocem',
  name_en: 'Raspberry yogurt dessert',
  ingredients: ['4 porce marshmallow', '2 plátky želatiny', '1 hrnek řeckého jogurtu', '4 hrnky malin'],
});
check(
  'jogurt + marshmallow/želatina = odmítnout',
  Boolean(getFullContentStartBlockReason(jogurtComplex, 'snack', { name_cs: 'Jogurt s ovocem', type: 'snack' })),
  getFullContentStartBlockReason(jogurtComplex, 'snack', { name_cs: 'Jogurt s ovocem', type: 'snack' })
);

const eggsBreadNoPastry = row({
  name_cs: 'Vejce s pečivem a zeleninou',
  ingredients: ['4 ks vejce', '150 g brokolice', '45 ml mléka'],
});
check(
  'Vejce s pečivem bez pečiva = odmítnout',
  Boolean(getFullContentStartBlockReason(eggsBreadNoPastry, 'breakfast', { name_cs: 'Vejce s pečivem a zeleninou', type: 'breakfast' })),
  getFullContentStartBlockReason(eggsBreadNoPastry, 'breakfast', { name_cs: 'Vejce s pečivem a zeleninou', type: 'breakfast' })
);

const eggsBreadAligned = row({
  name_cs: 'Vejce s pečivem a zeleninou',
  ingredients: ['4 ks vejce', '2 plátky celozrného pečiva', '100 g zeleniny'],
});
check(
  'Vejce s pečivem + pečivo + vejce + zelenina = povolit',
  isAllowedForSimpleStartPlan(eggsBreadAligned, { name_cs: 'Vejce s pečivem a zeleninou', type: 'breakfast', allowed_catalog_match_terms: ['vejce', 'pečiv'] }),
  getFullContentStartBlockReason(eggsBreadAligned, 'breakfast', { name_cs: 'Vejce s pečivem a zeleninou', type: 'breakfast' }) || 'none'
);

const jogurtFruitAligned = row({
  name_cs: 'Jogurt s ovocem',
  ingredients: ['jogurt 180 g', 'banán 1 ks', 'jahody 80 g'],
});
check(
  'Jogurt s ovocem + jogurt + banán/jahody = povolit',
  isAllowedForSimpleStartPlan(jogurtFruitAligned, { name_cs: 'Jogurt s ovocem', type: 'snack', allowed_catalog_match_terms: ['jogurt', 'ovoc'] }),
  getFullContentStartBlockReason(jogurtFruitAligned, 'snack', { name_cs: 'Jogurt s ovocem', type: 'snack' }) || 'none'
);

const ryzeMismatch = row({
  name_cs: 'Rýže s vejcem a zeleninou',
  ingredients: ['150 g kuřecích prsou', '100 g rýže', '50 g avokáda', '10 g olivového oleje'],
});
check(
  'rýže s vejcem bez vejce v surovinách = odmítnout',
  Boolean(getFullContentStartBlockReason(ryzeMismatch, 'lunch', { name_cs: 'Rýže s vejcem a zeleninou', type: 'lunch' })),
  getFullContentStartBlockReason(ryzeMismatch, 'lunch', { name_cs: 'Rýže s vejcem a zeleninou', type: 'lunch' })
);

const allowAligned = row({
  name_cs: 'Kuře s rýží a zeleninou',
  ingredients: ['150 g kuřecích prsou', '100 g rýže', '150 g zeleniny', '1 lžíce oleje'],
});
check(
  'kuře s rýží se správnými surovinami = povolit',
  isAllowedForSimpleStartPlan(allowAligned, { name_cs: 'Kuře s rýží a zeleninou', type: 'lunch', allowed_catalog_match_terms: ['kuře', 'rýž'] }),
  getFullContentStartBlockReason(allowAligned, 'lunch', { name_cs: 'Kuře s rýží a zeleninou', type: 'lunch' }) || 'none'
);

console.log('\n--- Fallback output ---');
const fallback = buildStartSafeFallbackMeal(
  { type: 'dinner', name_cs: 'Brambory s vejcem', planner_source: 'simple_meal_planner_agent' },
  650,
  2
);
const fbOk =
  fallback.catalog_source === 'simple_start_fallback' &&
  Array.isArray(fallback.shopping_ingredient_lines) &&
  fallback.shopping_ingredient_lines.length > 0 &&
  fallback.shopping_ingredient_lines.length <= 6 &&
  !/pastitsio|kari|pesto|frittata/i.test(fallback.shopping_ingredient_lines.join(' '));
check('5) fallback vrací jednoduchý nákupní seznam', fbOk, fallback.shopping_ingredient_lines.join('; '));

console.log('\n--- Recipe detail safety ---');
const blocked = Boolean(pastitsioReason);
const tpl = findStartFallbackTemplate('Brambory s vejcem', 'dinner');
const lines = (tpl?.shopping_ingredient_lines || []).map((s) => String(s));
const instr = buildSimpleFallbackInstructions('Brambory s vejcem', lines);
const complexHtml = recipePartsToHtml({
  title: 'Brambory s vejcem',
  ingredients_cs: lines,
  instructions_cs: instr,
  image_url: null,
  nutritionHtml: '',
});
const complexText = htmlText(complexHtml);
const detailOk =
  blocked &&
  complexHtml.includes('Postup') &&
  !/pastitsio|ziti|feta|libra|masov[eá]\s+om[aá]čk/i.test(complexText) &&
  /brambor|vejce|zelenin/i.test(complexText);
check('6) recipe detail fallback nepoužije složitý katalog', detailOk, complexText.slice(0, 120));

const breakfastTpl = findStartFallbackTemplate('Tvaroh s vločkami a banánem', 'breakfast');
const breakfastHtml = recipePartsToHtml({
  title: 'Tvaroh s vločkami a banánem',
  ingredients_cs: breakfastTpl?.shopping_ingredient_lines || [],
  instructions_cs: buildSimpleFallbackInstructions('Tvaroh s vločkami a banánem', breakfastTpl?.shopping_ingredient_lines || []),
  image_url: null,
  nutritionHtml: '',
});
check(
  'fallback detail HTML je jednoduchý',
  /tvaroh|vločk|banán/i.test(htmlText(breakfastHtml)) && !/pastitsio|kari/i.test(breakfastHtml),
  htmlText(breakfastHtml).slice(0, 100)
);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
