/**
 * Vyloučení jídel z minulých týdnů — aby se jednomu člověku neopakoval jídelníček.
 *
 * Změřeno na účtu janprikopa@gmail.com: mezi plány valid_from 2026-08-20
 * a 2026-08-27 se opakovalo 27 z 35 jídel (77 %). Uvnitř každého týdne bylo
 * všech 35 receptů různých — chyběla jen paměť mezi týdny.
 *
 * Nejcitlivější místo je výjimka: co si uživatel připnul tlačítkem
 * „Zahrnout od dalšího týdne“, se vyloučit NESMÍ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TYDNU_HISTORIE,
  receptyZPlanu,
  vyluceniZHistorie,
  zacatekHistorie,
} from '../plan/historieJidel.js';

test('okno historie jsou tři týdny', () => {
  assert.equal(TYDNU_HISTORIE, 3);
  assert.equal(zacatekHistorie('2026-08-27'), '2026-08-06');
});

test('neplatné datum nevyrobí nesmyslné okno', () => {
  for (const v of [null, undefined, '', 'nesmysl']) assert.equal(zacatekHistorie(v), null);
});

test('recepty z minulých týdnů se vyloučí', () => {
  const out = vyluceniZHistorie(['101', '102', '103']);
  assert.deepEqual([...out].sort(), ['101', '102', '103']);
});

test('připnuté jídlo se NEVYLUČUJE — uživatel o něm rozhodl sám', () => {
  const out = vyluceniZHistorie(['101', '102', '103'], ['102']);
  assert.equal(out.has('102'), false, 'pin je záměrná volba, algoritmus ji nesmí přebít');
  assert.equal(out.has('101'), true);
  assert.equal(out.has('103'), true);
});

test('číslo z DB a text z JSONB jsou tentýž recept', () => {
  // catalog_id chodí z structured_plan_json jako string, z user_meal_pins jako
  // bigint. Bez normalizace by se pin nespároval a jídlo by se vyloučilo.
  const out = vyluceniZHistorie(['102'], [102]);
  assert.equal(out.size, 0, 'pin 102 (number) musí zrušit vyloučení "102" (string)');
});

test('prázdné a chybějící vstupy projdou bez pádu', () => {
  assert.equal(vyluceniZHistorie([]).size, 0);
  assert.equal(vyluceniZHistorie(null, null).size, 0);
  assert.equal(vyluceniZHistorie([null, undefined, '104']).size, 1);
});

test('z uloženého plánu se vytáhnou všechna catalog_id', () => {
  const structured = {
    days: [
      { meals: [{ catalog_id: 1 }, { catalog_id: 2 }] },
      { meals: [{ catalog_id: 3 }, { name_cs: 'bez receptu' }] },
    ],
  };
  assert.deepEqual(receptyZPlanu(structured), ['1', '2', '3']);
});

test('plán bez dnů nebo bez jídel nevyhodí výjimku', () => {
  assert.deepEqual(receptyZPlanu(null), []);
  assert.deepEqual(receptyZPlanu({}), []);
  assert.deepEqual(receptyZPlanu({ days: [{}] }), []);
});
