/**
 * Mapování karta → jídlo ve structured_plan_json.
 *
 * REGRESE K HLÁŠENÍ Z 17. 8. 2026. Klik na „Recept“ u druhé svačiny otevřel
 * modal té první, protože se jídlo hledalo `arr.find(m => m.type === want)` —
 * tedy PRVNÍ jídlo daného typu, a index byl jen záloha. Den má přitom běžně
 * svačiny dvě. Toutéž cestou chodí i „Nahradit jiným“ a „Zahrnout od dalšího
 * týdne“, takže mířily vedle taky.
 *
 * Reprodukováno v prohlížeči na dni:
 *   [0] snídaně  Jogurt s ovocem a ořechy
 *   [1] oběd     Krůtí prsa s rýží
 *   [2] svačina  Jogurt s jablkem a skořicí
 *   [3] svačina  Cottage s pečivem      ← klik sem otevřel [2]
 *   [4] večeře   Tvarohová miska
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  structuredMealForCard,
  sameTypeOrdinalIn,
  structMealTypeFromLabel,
} from '../plan/structuredMealLookup.js';

/** Přesně ten den, na kterém byl bug změřen. */
const STRUCT_DAY = {
  meals: [
    { type: 'breakfast', display_name_cs: 'Jogurt s ovocem a ořechy' },
    { type: 'lunch', display_name_cs: 'Krůtí prsa s rýží' },
    { type: 'snack', display_name_cs: 'Jogurt s jablkem a skořicí' },
    { type: 'snack', display_name_cs: 'Cottage s pečivem' },
    { type: 'dinner', display_name_cs: 'Tvarohová miska' },
  ],
};

/** Karty tak, jak je staví buildMealsFromStructuredDay — české štítky, 1:1. */
const KARTY = [
  { type: 'Snídaně' },
  { type: 'Oběd' },
  { type: 'Svačina' },
  { type: 'Svačina' },
  { type: 'Večeře' },
];

test('každá karta vede na své jídlo — i obě svačiny', () => {
  for (let mi = 0; mi < KARTY.length; mi += 1) {
    const nalezene = structuredMealForCard(
      STRUCT_DAY,
      KARTY[mi].type,
      mi,
      sameTypeOrdinalIn(KARTY, mi),
    );
    assert.equal(
      nalezene?.display_name_cs,
      STRUCT_DAY.meals[mi].display_name_cs,
      `karta [${mi}] (${KARTY[mi].type}) vede na cizí jídlo`,
    );
  }
});

test('druhá svačina neotevře první — přesně nahlášený případ', () => {
  const nalezene = structuredMealForCard(STRUCT_DAY, 'Svačina', 3, sameTypeOrdinalIn(KARTY, 3));
  assert.equal(nalezene.display_name_cs, 'Cottage s pečivem');
  assert.notEqual(nalezene.display_name_cs, 'Jogurt s jablkem a skořicí');
});

test('sameTypeOrdinalIn počítá pořadí v rámci typu', () => {
  assert.equal(sameTypeOrdinalIn(KARTY, 0), 0, 'jediná snídaně');
  assert.equal(sameTypeOrdinalIn(KARTY, 2), 0, 'první svačina');
  assert.equal(sameTypeOrdinalIn(KARTY, 3), 1, 'druhá svačina');
  assert.equal(sameTypeOrdinalIn(KARTY, 4), 0, 'jediná večeře');
});

test('tři svačiny v jednom dni — každá vede na svou', () => {
  const den = {
    meals: [
      { type: 'snack', display_name_cs: 'A' },
      { type: 'snack', display_name_cs: 'B' },
      { type: 'snack', display_name_cs: 'C' },
    ],
  };
  const karty = [{ type: 'Svačina' }, { type: 'Svačina' }, { type: 'Svačina' }];
  const nazvy = karty.map((k, mi) =>
    structuredMealForCard(den, k.type, mi, sameTypeOrdinalIn(karty, mi))?.display_name_cs);
  assert.deepEqual(nazvy, ['A', 'B', 'C']);
});

test('když se pořadí rozejde s JSON, rozhoduje typ a pořadí v rámci typu', () => {
  // Ta situace, kvůli které tu hledání podle typu vůbec bylo: karty jsou
  // v jiném pořadí než struktura. Druhá svačina musí i tak trefit druhou.
  const den = {
    meals: [
      { type: 'snack', display_name_cs: 'svacina-1' },
      { type: 'snack', display_name_cs: 'svacina-2' },
      { type: 'dinner', display_name_cs: 'vecere' },
    ],
  };
  const karty = [{ type: 'Večeře' }, { type: 'Svačina' }, { type: 'Svačina' }];
  assert.equal(structuredMealForCard(den, 'Večeře', 0, sameTypeOrdinalIn(karty, 0))?.display_name_cs, 'vecere');
  assert.equal(structuredMealForCard(den, 'Svačina', 1, sameTypeOrdinalIn(karty, 1))?.display_name_cs, 'svacina-1');
  assert.equal(structuredMealForCard(den, 'Svačina', 2, sameTypeOrdinalIn(karty, 2))?.display_name_cs, 'svacina-2');
});

test('neznámý štítek spadne na pozici', () => {
  assert.equal(structuredMealForCard(STRUCT_DAY, 'Něco divného', 3, 0)?.display_name_cs, 'Cottage s pečivem');
});

test('prázdný nebo chybějící den nespadne', () => {
  assert.equal(structuredMealForCard(null, 'Svačina', 0, 0), null);
  assert.equal(structuredMealForCard({ meals: [] }, 'Svačina', 0, 0), null);
  assert.equal(sameTypeOrdinalIn(null, 2), 0);
});

test('štítky se čtou česky i anglicky', () => {
  assert.equal(structMealTypeFromLabel('Svačina'), 'snack');
  assert.equal(structMealTypeFromLabel('snack'), 'snack');
  assert.equal(structMealTypeFromLabel('Večeře'), 'dinner');
  assert.equal(structMealTypeFromLabel('Vecere'), 'dinner');
  assert.equal(structMealTypeFromLabel(''), null);
});
