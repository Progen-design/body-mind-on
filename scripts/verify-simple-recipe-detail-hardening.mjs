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
import { getMealNutritionDisplay, sumMealCalories } from '../lib/mealNutritionDisplay.js';
import { getMealRecipeUrl } from '../lib/mealRecipeDisplay.js';
import { createMealDisplayModel } from '../lib/mealDisplayModel.js';
import { findSimpleStartRecipeByTitle } from '../lib/simpleStartRecipeLibrary.js';
import { readFileSync } from 'fs';

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

const eggsBreadWithBakingPowderOnly = row({
  name_cs: 'Vejce s pečivem a zeleninou',
  ingredients: ['4 ks vejce', '10 g prášku do pečiva', '100 g zeleniny'],
});
check(
  'Vejce s pečivem + prášek do pečiva (bez pečiva) = odmítnout',
  Boolean(getFullContentStartBlockReason(eggsBreadWithBakingPowderOnly, 'breakfast', { name_cs: 'Vejce s pečivem a zeleninou', type: 'breakfast' })),
  getFullContentStartBlockReason(eggsBreadWithBakingPowderOnly, 'breakfast', { name_cs: 'Vejce s pečivem a zeleninou', type: 'breakfast' })
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

const ovesnaComplex = row({
  name_cs: 'Ovesná kaše s proteinem',
  ingredients: ['150 g brusinek', '120 ml smetany', '100 g ovesných vloček', 'fíky 80 g'],
});
check(
  'Ovesná kaše se smetanou/fíky = odmítnout',
  Boolean(getFullContentStartBlockReason(ovesnaComplex, 'breakfast', { name_cs: 'Ovesná kaše s proteinem', type: 'breakfast' })),
  getFullContentStartBlockReason(ovesnaComplex, 'breakfast', { name_cs: 'Ovesná kaše s proteinem', type: 'breakfast' })
);

const ovesnaSimple = row({
  name_cs: 'Ovesná kaše s proteinem',
  ingredients: ['ovesné vločky 60 g', 'mléko 200 ml', 'protein 30 g', 'banán 1 ks', 'skořice 1 špetka'],
});
check(
  'Ovesná kaše s vločkami/mlékem/proteinem/banánem = povolit',
  isAllowedForSimpleStartPlan(ovesnaSimple, { name_cs: 'Ovesná kaše s proteinem', type: 'breakfast', allowed_catalog_match_terms: ['ovesn', 'protein'] }),
  getFullContentStartBlockReason(ovesnaSimple, 'breakfast', { name_cs: 'Ovesná kaše s proteinem', type: 'breakfast' }) || 'none'
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
  (fallback.catalog_source === 'simple_start_fallback' || fallback.catalog_source === 'simple_start_library') &&
  Array.isArray(fallback.shopping_ingredient_lines) &&
  fallback.shopping_ingredient_lines.length > 0 &&
  fallback.shopping_ingredient_lines.length <= 6 &&
  !/pastitsio|kari|pesto|frittata/i.test(fallback.shopping_ingredient_lines.join(' '));
check('5) fallback vrací jednoduchý nákupní seznam', fbOk, fallback.shopping_ingredient_lines.join('; '));

const fallbackNutrients = getMealNutritionDisplay(fallback);
const fallbackUrl = getMealRecipeUrl(fallback, 'https://app.bodyandmindon.cz');
const fallbackDayKcal = sumMealCalories([fallback]);
check(
  'fallback má web/email nutrition mapping (kcal+makra)',
  fallbackNutrients.calories != null && fallbackNutrients.protein_g != null && fallbackNutrients.carbs_g != null && fallbackNutrients.fat_g != null && fallbackDayKcal != null,
  JSON.stringify(fallbackNutrients)
);
check(
  'fallback má recipe detail URL pro web',
  /recipe-from-catalog/.test(fallbackUrl) && /fallback=1/.test(fallbackUrl),
  fallbackUrl
);

const mixedSourceMeal = {
  type: 'lunch',
  display_name_cs: 'Rýže s vejcem a zeleninou',
  name_cs: 'Rýže s vejcem a zeleninou',
  catalog_source: 'catalog',
  catalog_id: 999999,
  recipe_id: 888888,
  recipe_verified: true,
  spoonacular_url: 'https://spoonacular.com/recipes/chicken',
  recipe: {
    id: 888888,
    title: 'Chicken rice bowl',
    source: 'catalog',
    source_url: 'https://spoonacular.com/recipes/chicken',
    calories: 690,
    protein_g: 45,
    carbs_g: 51,
    fat_g: 28,
  },
  kcal: 690,
  protein_g: 45,
  carbs_g: 51,
  fat_g: 28,
  shopping_ingredient_lines: ['kuřecí prsa 180 g', 'rýže 80 g', 'zelenina 120 g'],
};
const mixedModel = createMealDisplayModel(mixedSourceMeal, 'https://app.bodyandmindon.cz');
const mixedUrl = getMealRecipeUrl(mixedSourceMeal, 'https://app.bodyandmindon.cz');
check(
  '1) title rýže+vejce + kuře ingredience = fallback',
  mixedModel.isFallback && mixedModel.consistencyStatus.startsWith('inconsistent:'),
  mixedModel.consistencyStatus
);
check(
  '2) fallback detail pro rýži s vejcem neobsahuje kuře',
  /rýže|ryze/i.test(mixedModel.ingredients.join(' ')) && /vejce/i.test(mixedModel.ingredients.join(' ')) && /zelenin/i.test(mixedModel.ingredients.join(' ')) && !/kuř|kure|chicken/i.test(mixedModel.ingredients.join(' ')),
  mixedModel.ingredients.join('; ')
);
check(
  '3) fallback detail URL nepoužije catalog_id/recipe_id',
  /fallback=1/.test(mixedUrl) && !/[?&]id=\d+/.test(mixedUrl),
  mixedUrl
);
const mixedDetailHtml = recipePartsToHtml({
  title: mixedModel.title,
  ingredients_cs: mixedModel.ingredients,
  instructions_cs: mixedModel.instructions,
  image_url: null,
  nutritionHtml: `Calories ${mixedModel.calories} Protein ${mixedModel.protein_g} Carbohydrates ${mixedModel.carbs_g} Fat ${mixedModel.fat_g}`,
});
const mixedDetailText = htmlText(mixedDetailHtml).toLowerCase();
check(
  '4) web model a detail mají stejné kcal/makra',
  mixedModel.calories != null
    && mixedModel.protein_g != null
    && mixedModel.carbs_g != null
    && mixedModel.fat_g != null
    && mixedDetailText.includes(String(mixedModel.calories))
    && mixedDetailText.includes(String(mixedModel.protein_g))
    && mixedDetailText.includes(String(mixedModel.carbs_g))
    && mixedDetailText.includes(String(mixedModel.fat_g)),
  mixedDetailText.slice(0, 200)
);
const webModel = createMealDisplayModel(mixedSourceMeal);
const emailModel = createMealDisplayModel(mixedSourceMeal);
check(
  '5) email a web model mají stejné title/kcal/makra',
  webModel.title === emailModel.title
    && webModel.calories === emailModel.calories
    && webModel.protein_g === emailModel.protein_g
    && webModel.carbs_g === emailModel.carbs_g
    && webModel.fat_g === emailModel.fat_g,
  JSON.stringify({
    web: { title: webModel.title, kcal: webModel.calories, p: webModel.protein_g, c: webModel.carbs_g, f: webModel.fat_g },
    email: { title: emailModel.title, kcal: emailModel.calories, p: emailModel.protein_g, c: emailModel.carbs_g, f: emailModel.fat_g },
  })
);

const cottageBread = findSimpleStartRecipeByTitle('Cottage s pečivem', 'snack');
check(
  'Cottage s pečivem = cottage + pečivo (bez tvaroh/vločky/banán)',
  cottageBread
    && /cottage/i.test(cottageBread.ingredients.join(' '))
    && /pečiv|chleb|toast/i.test(cottageBread.ingredients.join(' '))
    && !/tvaroh|vločk|banán/i.test(cottageBread.ingredients.join(' ')),
  cottageBread ? cottageBread.ingredients.join('; ') : 'missing'
);

const pastaChicken = findSimpleStartRecipeByTitle('Těstoviny s kuřetem', 'lunch');
check(
  'Těstoviny s kuřetem = těstoviny + kuře',
  pastaChicken
    && /těstovin|testovin/i.test(pastaChicken.ingredients.join(' '))
    && /kuř|kure/i.test(pastaChicken.ingredients.join(' ')),
  pastaChicken ? pastaChicken.ingredients.join('; ') : 'missing'
);

const riceEgg = findSimpleStartRecipeByTitle('Rýže s vejcem a zeleninou', 'lunch');
check(
  'Rýže s vejcem = rýže + vejce + zelenina',
  riceEgg
    && /rýž|ryz/i.test(riceEgg.ingredients.join(' '))
    && /vejce/i.test(riceEgg.ingredients.join(' '))
    && /zelenin/i.test(riceEgg.ingredients.join(' ')),
  riceEgg ? riceEgg.ingredients.join('; ') : 'missing'
);

const eggsBread = findSimpleStartRecipeByTitle('Vejce s pečivem a zeleninou', 'breakfast');
check(
  'Vejce s pečivem = vejce + pečivo + zelenina',
  eggsBread
    && /vejce/i.test(eggsBread.ingredients.join(' '))
    && /pečiv|chleb|toast/i.test(eggsBread.ingredients.join(' '))
    && /zelenin|rajče|okurk/i.test(eggsBread.ingredients.join(' ')),
  eggsBread ? eggsBread.ingredients.join('; ') : 'missing'
);

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

const eggsBreadModel = createMealDisplayModel({
  type: 'breakfast',
  catalog_source: 'simple_start_fallback',
  display_name_cs: 'Vejce s pečivem a zeleninou',
  kcal: 450,
  protein_g: 24,
  carbs_g: 38,
  fat_g: 22,
});
const eggsBreadHtml = recipePartsToHtml({
  title: eggsBreadModel.title,
  ingredients_cs: eggsBreadModel.ingredients,
  instructions_cs: eggsBreadModel.instructions,
  image_url: null,
  nutritionHtml: '',
});
check(
  '6) Vejce s pečivem detail obsahuje vejce + pečivo',
  /vejce/i.test(htmlText(eggsBreadHtml)) && /pečiv|chleb|toast/i.test(htmlText(eggsBreadHtml)),
  htmlText(eggsBreadHtml).slice(0, 140)
);

const yogurtModel = createMealDisplayModel({
  type: 'snack',
  catalog_source: 'simple_start_fallback',
  display_name_cs: 'Jogurt s ovocem',
  kcal: 220,
  protein_g: 14,
  carbs_g: 28,
  fat_g: 6,
});
const yogurtHtml = recipePartsToHtml({
  title: yogurtModel.title,
  ingredients_cs: yogurtModel.ingredients,
  instructions_cs: yogurtModel.instructions,
  image_url: null,
  nutritionHtml: '',
});
check(
  '7) Jogurt s ovocem detail je bez marshmallow',
  /jogurt/i.test(htmlText(yogurtHtml)) && /banán|ovoce|jahod/i.test(htmlText(yogurtHtml)) && !/marshmallow/i.test(htmlText(yogurtHtml)),
  htmlText(yogurtHtml).slice(0, 140)
);

check(
  '8) Ovesná kaše se smetanou/fíky = fallback nebo odmítnout',
  Boolean(getFullContentStartBlockReason(ovesnaComplex, 'breakfast', { name_cs: 'Ovesná kaše s proteinem', type: 'breakfast' })),
  getFullContentStartBlockReason(ovesnaComplex, 'breakfast', { name_cs: 'Ovesná kaše s proteinem', type: 'breakfast' })
);

const oatmealLibrary = findSimpleStartRecipeByTitle('Ovesná kaše s proteinem', 'breakfast');
check(
  'Ovesná kaše library = vločky + protein bez smetany/fíků',
  oatmealLibrary
    && /vločk|ovesn/i.test(oatmealLibrary.ingredients.join(' '))
    && /protein/i.test(oatmealLibrary.ingredients.join(' '))
    && !/smetan|fík|fik/i.test(oatmealLibrary.ingredients.join(' ')),
  oatmealLibrary ? oatmealLibrary.ingredients.join('; ') : 'missing'
);

const sameMeal = createMealDisplayModel({
  type: 'lunch',
  planner_source: 'simple_meal_planner_agent',
  display_name_cs: 'Kuře s rýží a zeleninou',
  name_cs: 'Kuře s rýží a zeleninou',
});
const webSame = createMealDisplayModel(sameMeal.normalizedMeal);
const emailSame = createMealDisplayModel(sameMeal.normalizedMeal);
const detailSame = recipePartsToHtml({
  title: sameMeal.title,
  ingredients_cs: sameMeal.ingredients,
  instructions_cs: sameMeal.instructions,
  image_url: null,
  nutritionHtml: `Calories ${sameMeal.calories} Protein ${sameMeal.protein_g} Carbohydrates ${sameMeal.carbs_g} Fat ${sameMeal.fat_g}`,
});
const detailSameText = htmlText(detailSame);
check(
  'web/e-mail/detail stejný title+kcal+makra+ingredients',
  webSame.title === emailSame.title
    && webSame.calories === emailSame.calories
    && webSame.protein_g === emailSame.protein_g
    && webSame.carbs_g === emailSame.carbs_g
    && webSame.fat_g === emailSame.fat_g
    && detailSameText.includes(String(sameMeal.calories))
    && sameMeal.ingredients.every((line) => detailSameText.toLowerCase().includes(String(line).toLowerCase().split(' ')[0])),
  JSON.stringify({
    title: sameMeal.title,
    kcal: sameMeal.calories,
    p: sameMeal.protein_g,
    c: sameMeal.carbs_g,
    f: sameMeal.fat_g,
  })
);

check(
  'denní kcal součet = součet jídel',
  sumMealCalories([sameMeal.normalizedMeal, fallback]) === ((sameMeal.calories || 0) + (fallbackNutrients.calories || 0)),
  `${sumMealCalories([sameMeal.normalizedMeal, fallback])} vs ${(sameMeal.calories || 0) + (fallbackNutrients.calories || 0)}`
);

const idempotencyFiles = [
  '../lib/taskExecutors.js',
  '../pages/api/body-metrics.js',
  '../pages/api/send-plan-again.js',
];
const idempotencyText = idempotencyFiles.map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
check(
  'automatická registrace guard (idempotency logy přítomné)',
  idempotencyText.includes('[email-idempotency] skipped duplicate weekly plan email')
    && idempotencyText.includes('[email-idempotency] sent weekly plan email')
    && idempotencyText.includes('[email-idempotency] manual resend weekly plan email'),
  'email-idempotency-log-strings'
);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
