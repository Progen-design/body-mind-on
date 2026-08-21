/**
 * Řádek suroviny ze strukturovaných dat.
 *
 * Chyba, kterou to opravuje: „1/2 teaspoon chili powder“ se čistilo regexem
 * `\b\d+…(tsp|cups?|…)\b`, jenže `\b` sedne i mezi „/“ a „2“. Zbylo z toho
 * „1/ chili powder“ — useknutá frakce, ze které uživatel nepozná množství.
 * Recept id=34 v produkci je přesně tenhle případ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMnozstvi, normalizujJednotku, radekSuroviny, radkySurovin } from '../profile/surovinaRadek.js';

/** Skutečná data z recipes_catalog id=34. */
const RECEPT_34 = [
  { name: 'chili powder', unit: 'tsps', amount: 0.5, name_en: 'chili powder', original: '1/2 teaspoon chili powder' },
  { name: 'egg whites', unit: '', amount: 2, name_en: 'egg whites', original: '2 egg whites' },
  { name: 'old fashioned oats', unit: 'g', amount: 40.541, name_en: 'old fashioned oats', original: '1/2 cup old fashioned oats' },
  { name: 'reduced fat cheddar cheese', unit: 'Tbsps', amount: 4, name_en: 'reduced fat cheddar cheese', original: '4 tablespoons reduced fat cheddar cheese' },
  { name: 'salt', unit: 'serving', amount: 1, name_en: 'salt', original: 'Salt to taste' },
  { name: 'scallions', unit: '', amount: 2, name_en: 'scallions', original: '2 scallions, chopped (both white and green parts)' },
];

test('žádný řádek nekončí useknutou frakcí', () => {
  for (const r of radkySurovin(RECEPT_34)) {
    assert.ok(!/\d\/\s|\d\/$/.test(r), `useknutá frakce v „${r}“`);
  }
});

test('půl lžičky se napíše zlomkem, ne „1/“', () => {
  assert.equal(radekSuroviny(RECEPT_34[0]), '½ lžičky chili powder');
});

test('gramy z API se zaokrouhlí a nechají v gramech', () => {
  // Spoonacular posílá 40.541 — desetina gramu je falešná přesnost.
  assert.equal(radekSuroviny(RECEPT_34[2]), '41 g old fashioned oats');
});

test('lžíce se skloňuje podle počtu', () => {
  assert.equal(radekSuroviny(RECEPT_34[3]), '4 lžíce reduced fat cheddar cheese');
  assert.equal(radekSuroviny({ name: 'olej', unit: 'Tbsp', amount: 1 }), '1 lžíce olej');
  assert.equal(radekSuroviny({ name: 'olej', unit: 'Tbsp', amount: 6 }), '6 lžic olej');
});

test('lžička se skloňuje podle počtu', () => {
  assert.equal(radekSuroviny({ name: 'sůl', unit: 'tsp', amount: 1 }), '1 lžička sůl');
  assert.equal(radekSuroviny({ name: 'sůl', unit: 'tsp', amount: 3 }), '3 lžičky sůl');
  assert.equal(radekSuroviny({ name: 'sůl', unit: 'tsp', amount: 5 }), '5 lžiček sůl');
});

test('sentinel „serving“ u soli není množství', () => {
  assert.equal(radekSuroviny(RECEPT_34[4]), 'sůl dle chuti');
});

test('bez jednotky se napíše počet kusů', () => {
  assert.equal(radekSuroviny(RECEPT_34[1]), '2× egg whites');
  assert.equal(radekSuroviny(RECEPT_34[5]), '2× scallions');
});

test('preferuje se český název, když existuje', () => {
  assert.equal(
    radekSuroviny({ name_cs: 'chilli koření', name: 'chili powder', unit: 'tsps', amount: 0.5 }),
    '½ lžičky chilli koření',
  );
});

test('chybějící množství nevyrobí nulu', () => {
  assert.equal(radekSuroviny({ name: 'sůl', unit: 'g', amount: null }), 'sůl');
  assert.equal(radekSuroviny({ name: 'sůl', unit: 'g' }), 'sůl');
  assert.equal(radekSuroviny({ name: 'sůl', unit: 'g', amount: 0 }), 'sůl');
});

test('bez názvu se sáhne na original — ale nečistí se', () => {
  // Radši celá anglická věta než rozbitý zbytek po regexu.
  assert.equal(radekSuroviny({ original: '1/2 teaspoon chili powder' }), '1/2 teaspoon chili powder');
});

test('řetězec projde beze změny', () => {
  assert.equal(radekSuroviny('2 vejce'), '2 vejce');
});

test('formát množství: celá čísla, zlomky, desetiny', () => {
  assert.equal(formatMnozstvi(2), '2');
  assert.equal(formatMnozstvi(0.5), '½');
  assert.equal(formatMnozstvi(0.25), '¼');
  assert.equal(formatMnozstvi(0.75), '¾');
  assert.equal(formatMnozstvi(1.5), '1,5');
  assert.equal(formatMnozstvi(40.541), '41');
});

test('normalizace jednotek zvládne tvary z API', () => {
  assert.deepEqual(normalizujJednotku('tsps'), { typ: 'slovo', klic: 'tsp' });
  assert.deepEqual(normalizujJednotku('Tbsps'), { typ: 'slovo', klic: 'tbsp' });
  assert.deepEqual(normalizujJednotku('teaspoon'), { typ: 'slovo', klic: 'tsp' });
  assert.deepEqual(normalizujJednotku('g'), { typ: 'zkratka', klic: 'g' });
  assert.deepEqual(normalizujJednotku('grams'), { typ: 'zkratka', klic: 'g' });
  assert.deepEqual(normalizujJednotku(''), { typ: 'zadna', klic: '' });
  assert.deepEqual(normalizujJednotku('serving'), { typ: 'zadna', klic: 'serving' });
});

test('prázdné a nesmyslné vstupy nespadnou', () => {
  assert.equal(radekSuroviny(null), '');
  assert.equal(radekSuroviny(undefined), '');
  assert.equal(radekSuroviny(42), '');
  assert.deepEqual(radkySurovin(null), []);
  assert.deepEqual(radkySurovin([null, '', { name: 'sůl' }]), ['sůl']);
});

/* Druhá obrana: i kdyby se někde přece jen stavěl řádek z `original`,
   čištění imperiálních jednotek už nesmí nechat useknutý zlomek. */
test('sanitizer nenechá useknutou frakci ani u anglické věty', async () => {
  const { sanitizeIngredientLineForDisplay } = await import('../recipeSimplicityScore.js');
  for (const veta of ['1/2 teaspoon chili powder', '1/2 cup old fashioned oats', '3/4 cup mléka']) {
    const out = sanitizeIngredientLineForDisplay(veta);
    assert.ok(!/\d\/\s|\d\/$/.test(out), `useknutá frakce: „${veta}“ → „${out}“`);
  }
  // Metrické množství se nesmí ztratit.
  assert.equal(sanitizeIngredientLineForDisplay('200 g rýže'), '200 g rýže');
  assert.equal(sanitizeIngredientLineForDisplay('2 vejce'), '2 vejce');
});
