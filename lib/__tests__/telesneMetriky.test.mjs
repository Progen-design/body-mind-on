/**
 * Karty tělesného vývoje z nového návrhu — logika pod vzhledem.
 *
 * Návrh přišel s napevno zadrátovanými hodnotami (104,6 kg / 11,6 % / 88,9 kg)
 * a bez jakéhokoli ošetření chybějících dat. Testy hlídají to, co by se při
 * přepisu vzhledu ztratilo nejsnáz: že prázdné měření není nula, že se trend
 * hodnotí podle veličiny a že graf nevznikne z dvou teček.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_BODU_GRAFU,
  bodyGrafuVahy,
  celkovaZmena,
  formatMetrikaCs,
  smerTrendu,
} from '../profile/telesneMetriky.js';

test('číslo se formátuje česky, s desetinnou čárkou', () => {
  assert.equal(formatMetrikaCs(82.44), '82,4');
  assert.equal(formatMetrikaCs(19), '19,0');
  assert.equal(formatMetrikaCs(24.05, 1), '24,1');
});

test('chybějící měření není nula', () => {
  for (const v of [null, undefined, '', 'nesmysl', NaN]) {
    assert.equal(formatMetrikaCs(v), null, `${String(v)} se nesmí zobrazit jako číslo`);
  }
});

test('naměřená nula se zobrazit SMÍ — je to údaj', () => {
  assert.equal(formatMetrikaCs(0), '0,0');
});

test('trend hodnotí směr podle veličiny, ne podle znaménka', () => {
  // Váha a tuk: dolů je dobře.
  assert.equal(smerTrendu(-1.2, 'klesa'), 'dobre');
  assert.equal(smerTrendu(1.2, 'klesa'), 'spatne');
  // Svalová hmota: nahoru je dobře.
  assert.equal(smerTrendu(1.2, 'roste'), 'dobre');
  assert.equal(smerTrendu(-1.2, 'roste'), 'spatne');
});

test('beze změny se nic neoslavuje a bez dat se nehodnotí', () => {
  assert.equal(smerTrendu(0, 'klesa'), 'neutralni');
  for (const v of [null, undefined, '', 'x']) assert.equal(smerTrendu(v), null);
});

test('graf se řadí od nejstaršího — API vrací opačně', () => {
  const body = bodyGrafuVahy([
    { measured_at: '2026-08-10T08:00:00Z', weight_kg: 79 },
    { measured_at: '2026-08-01T08:00:00Z', weight_kg: 81 },
    { measured_at: '2026-08-05T08:00:00Z', weight_kg: 80 },
  ]);
  assert.deepEqual(body.map((b) => b.vaha), [81, 80, 79], 'obrácené pořadí by otočilo trend');
});

test('měření bez váhy se do grafu nekreslí', () => {
  const body = bodyGrafuVahy([
    { measured_at: '2026-08-01T08:00:00Z', weight_kg: 81 },
    { measured_at: '2026-08-03T08:00:00Z', weight_kg: null },
    { measured_at: '2026-08-05T08:00:00Z', weight_kg: 80 },
  ]);
  assert.equal(body.length, 2, 'mezeru v datech nelze spojit čarou');
});

test('prázdná i chybějící historie projde bez pádu', () => {
  assert.deepEqual(bodyGrafuVahy([]), []);
  assert.deepEqual(bodyGrafuVahy(null), []);
  assert.deepEqual(bodyGrafuVahy(undefined), []);
});

test('na graf jsou potřeba aspoň tři body', () => {
  assert.equal(MIN_BODU_GRAFU, 3, 'dvě tečky nejsou trend');
});

test('celková změna se počítá z prvního a posledního bodu', () => {
  assert.equal(celkovaZmena([{ vaha: 81 }, { vaha: 80 }, { vaha: 79 }]), -2);
  assert.equal(celkovaZmena([{ vaha: 79 }]), null, 'z jednoho bodu změna neexistuje');
  assert.equal(celkovaZmena([]), null);
});
