/**
 * Stav překladu receptu.
 *
 * Chyba, kterou to opravuje: fronta k překladu se řídila jen sloupcem
 * `name_cs`. Recept s přeloženým názvem a anglickými surovinami z ní vypadl
 * navždy. Na produkci se to týkalo 74 ze 183 spoonacularových receptů.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  jeSurovinaNeprelozena,
  overPokrytiSurovin,
  pocetNeprelozenychSurovin,
  zbyvaPrelozit,
} from '../prekladStav.js';

/** Skutečná data z recipes_catalog id=34 — název česky, suroviny anglicky. */
const SUROVINY_34 = [
  { name: 'chili powder', name_en: 'chili powder' },
  { name: 'egg whites', name_en: 'egg whites' },
  { name: 'old fashioned oats', name_en: 'old fashioned oats' },
];

test('surovina je nepřeložená, když se name rovná name_en', () => {
  assert.equal(jeSurovinaNeprelozena({ name: 'chili powder', name_en: 'chili powder' }), true);
  assert.equal(jeSurovinaNeprelozena({ name: 'chilli koření', name_en: 'chili powder' }), false);
});

test('porovnání nerozlišuje velikost písmen', () => {
  assert.equal(jeSurovinaNeprelozena({ name: 'Chili Powder', name_en: 'chili powder' }), true);
});

test('surovina bez name je nepřeložená', () => {
  assert.equal(jeSurovinaNeprelozena({ name: '', name_en: 'salt' }), true);
  assert.equal(jeSurovinaNeprelozena({ name_en: 'salt' }), true);
});

test('surovina bez name_en se nepovažuje za nepřeloženou', () => {
  // Záznamy z doby před zavedením překladu — nedá se z nich nic poznat
  // a přeložit je znovu by přepsalo ruční práci.
  assert.equal(jeSurovinaNeprelozena({ name: 'sůl' }), false);
});

test('počítá jen nepřeložené', () => {
  assert.equal(pocetNeprelozenychSurovin(SUROVINY_34), 3);
  assert.equal(pocetNeprelozenychSurovin([{ name: 'sůl', name_en: 'salt' }]), 0);
  assert.equal(pocetNeprelozenychSurovin(null), 0);
  assert.equal(pocetNeprelozenychSurovin([]), 0);
});

test('recept s českým názvem a anglickými surovinami PATŘÍ do fronty', () => {
  // Přesně případ id=34, který stará podmínka `.is('name_cs', null)` minula.
  assert.equal(zbyvaPrelozit({
    name_cs: 'Zdravá jihozápadní ovesná kaše',
    ingredients: SUROVINY_34,
    instructions_cs: ['Krok 1'],
  }), true);
});

test('plně přeložený recept do fronty nepatří', () => {
  assert.equal(zbyvaPrelozit({
    name_cs: 'Ovesná kaše',
    ingredients: [{ name: 'oves', name_en: 'oats' }],
    instructions_cs: ['Uvař oves.'],
  }), false);
});

test('chybějící název nebo postup taky znamená práci', () => {
  const suroviny = [{ name: 'oves', name_en: 'oats' }];
  assert.equal(zbyvaPrelozit({ name_cs: null, ingredients: suroviny, instructions_cs: ['x'] }), true);
  assert.equal(zbyvaPrelozit({ name_cs: '  ', ingredients: suroviny, instructions_cs: ['x'] }), true);
  assert.equal(zbyvaPrelozit({ name_cs: 'Kaše', ingredients: suroviny, instructions_cs: [] }), true);
  assert.equal(zbyvaPrelozit({ name_cs: 'Kaše', ingredients: suroviny, instructions_cs: null }), true);
});

test('nesmyslný vstup nespadne', () => {
  assert.equal(zbyvaPrelozit(null), false);
  assert.equal(zbyvaPrelozit(undefined), false);
});

test('částečná odpověď modelu se nepovažuje za pokrytou', () => {
  // Tři suroviny, dva názvy — zbylá by tiše zůstala anglicky a recept by se
  // uložil jako hotový.
  assert.deepEqual(overPokrytiSurovin(SUROVINY_34, ['chilli', 'bílky']), { ok: false, chybi: 1 });
});

test('prázdné řetězce v odpovědi se nepočítají za překlad', () => {
  assert.deepEqual(overPokrytiSurovin(SUROVINY_34, ['chilli', '', '  ']), { ok: false, chybi: 2 });
});

test('plné pokrytí projde', () => {
  assert.deepEqual(overPokrytiSurovin(SUROVINY_34, ['chilli', 'bílky', 'ovesné vločky']), { ok: true, chybi: 0 });
});

test('recept bez surovin pokrytí neblokuje', () => {
  assert.deepEqual(overPokrytiSurovin([], []), { ok: true, chybi: 0 });
  assert.deepEqual(overPokrytiSurovin(null, null), { ok: true, chybi: 0 });
});
