/**
 * JEDNOTKA JAKO UZAVŘENÝ SEZNAM — docs/DALSI_KROK.md 8.9.
 *
 * 8.9 zůstává rozdělané schválně (viz DALSI_KROK.md): diagnóza „neznámá
 * surovina, která není neznámá" byla vedle — `unit` má v JSON schématu
 * generátoru enum ['g','ml'], model jinou jednotku vrátit nemůže, takže
 * rozdělení `compute_nutrition_for_ingredients` na `units_unmatched` řeší
 * latentní chybu ve funkci, ne skutečnou příčinu pádů fronty. Ta migrace
 * (`supabase/migrations/_odlozene/20260903210000...`) je odložená, protože
 * mění návratový typ funkce, na které visí view `system_health_alerts_zaklad`.
 *
 * Co z 8.9 ZŮSTÁVÁ a testuje se tady: `povolene_jednotky`/`jednotkyMimoSeznam()`
 * jako zábradlí (neškodí, i když by teoreticky nemělo mít příležitost
 * zasáhnout) a bílý seznam v hlavní smyčce generátoru (`recipeGeneratorRun.js`:
 * do `nedohledane` smí přispět výhradně `duvod === 'nutrice_neuplna'`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jednotkyMimoSeznam,
  buildGeneratorInput,
  POVOLENE_JEDNOTKY,
} from '../recipeGenerator.js';

// ------------------------------------------------------ jednotkyMimoSeznam

test('g a ml projdou beze zbytku', () => {
  const recept = { ingredients: [{ name: 'losos', unit: 'g' }, { name: 'olej', unit: 'ml' }] };
  assert.deepEqual(jednotkyMimoSeznam(recept), []);
});

test('kus neprojde', () => {
  const recept = { ingredients: [{ name: 'losos', unit: 'kus' }] };
  assert.deepEqual(jednotkyMimoSeznam(recept), ['kus']);
});

test('smíšený recept vrátí jen tu jednotku, co je mimo seznam', () => {
  const recept = { ingredients: [{ name: 'losos', unit: 'g' }, { name: 'citron', unit: 'kus' }] };
  assert.deepEqual(jednotkyMimoSeznam(recept), ['kus']);
});

test('stejná špatná jednotka se v poli neopakuje', () => {
  const recept = { ingredients: [{ name: 'losos', unit: 'kg' }, { name: 'krevety', unit: 'kg' }] };
  assert.deepEqual(jednotkyMimoSeznam(recept), ['kg']);
});

test('vlastní seznam povolených jednotek jde zadat explicitně', () => {
  const recept = { ingredients: [{ name: 'mouka', unit: 'lžíce' }] };
  assert.deepEqual(jednotkyMimoSeznam(recept, ['g', 'ml', 'lžíce']), []);
});

test('recept bez surovin nespadne', () => {
  assert.deepEqual(jednotkyMimoSeznam({ ingredients: [] }), []);
  assert.deepEqual(jednotkyMimoSeznam({}), []);
  assert.deepEqual(jednotkyMimoSeznam(null), []);
});

// ------------------------------------------------------ buildGeneratorInput

test('povolene_jednotky je ve vstupu pro model vždy, i bez ostatních volitelných polí', () => {
  const polozka = { meal_type: 'obed', diet_tags: [], kcal_min: 450, kcal_max: 680 };
  const vstup = buildGeneratorInput(polozka, ['losos'], [], 5);
  assert.deepEqual(vstup.povolene_jednotky, POVOLENE_JEDNOTKY);
});

test('spatna jednotka jde do vlastniho pole, NE do tyhle_suroviny_neznam', () => {
  const polozka = { meal_type: 'obed', diet_tags: [], kcal_min: 450, kcal_max: 680 };
  // nedohledane (suroviny) je prázdné — to je přesně stav po opravě: pojistka
  // na jednotku pošle "kg" do spatneJednotky, ne "losos" do nedohledane.
  const vstup = buildGeneratorInput(
    polozka, ['losos'], [], 5, /* nedohledane */ [], null, null, [], null, /* spatneJednotky */ ['kg'],
  );
  assert.equal('tyhle_suroviny_neznam' in vstup, false, 'losos se nesmí objevit jako zakázaná surovina');
  assert.deepEqual(vstup.tyhle_jednotky_nepouzivej, ['kg']);
});

test('bez spatne jednotky se pole vubec nepřidá', () => {
  const polozka = { meal_type: 'obed', diet_tags: [], kcal_min: 450, kcal_max: 680 };
  const vstup = buildGeneratorInput(polozka, ['losos'], [], 5);
  assert.equal('tyhle_jednotky_nepouzivej' in vstup, false);
});

test('nedohledana surovina a spatna jednotka se nemichaji, kdyz jsou obe', () => {
  const polozka = { meal_type: 'obed', diet_tags: [], kcal_min: 450, kcal_max: 680 };
  const vstup = buildGeneratorInput(
    polozka, ['losos', 'cizrna'], [], 5, ['cizrna'], null, null, [], null, ['kg'],
  );
  assert.deepEqual(vstup.tyhle_suroviny_neznam, ['cizrna']);
  assert.deepEqual(vstup.tyhle_jednotky_nepouzivej, ['kg']);
});
