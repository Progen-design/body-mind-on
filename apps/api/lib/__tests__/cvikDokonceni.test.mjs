/**
 * Odškrtávání jednotlivých cviků.
 *
 * Jediná nová funkce fáze 3. Hlídá se hlavně soužití se stávajícím
 * „celý trénink hotov“: odškrtání všech cviků ho zaškrtne, ale ruční
 * přepnutí musí dál fungovat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KLIC_CELEHO_TRENINKU,
  jeCvikHotovy,
  jeTreninkHotovy,
  klicCviku,
  maSeDopsatCelyTrenink,
  pocetHotovychCviku,
  popisProbehu,
} from '../profile/cvikDokonceni.js';

const mnozina = (...klice) => new Set(klice);

test('klíč cviku jde podle pořadí, ne podle názvu', () => {
  // Tentýž cvik se v tréninku může objevit dvakrát (rozcvička + hlavní série).
  assert.equal(klicCviku(0), 'cvik#0');
  assert.equal(klicCviku(7), 'cvik#7');
});

test('nesmyslný index klíč nevyrobí', () => {
  assert.equal(klicCviku(-1), '');
  assert.equal(klicCviku(1.5), '');
  assert.equal(klicCviku(null), '');
  assert.equal(klicCviku('a'), '');
});

test('cvik je hotový podle zápisu v množině', () => {
  const h = mnozina('workout:cvik#0', 'workout:cvik#2');
  assert.equal(jeCvikHotovy(h, 0), true);
  assert.equal(jeCvikHotovy(h, 1), false);
  assert.equal(jeCvikHotovy(h, 2), true);
});

test('cvik a celý trénink jsou dva různé záznamy', () => {
  const h = mnozina(`workout:${KLIC_CELEHO_TRENINKU}`);
  assert.equal(jeTreninkHotovy(h), true);
  assert.equal(jeCvikHotovy(h, 0), false, 'hotový trénink neznamená hotový cvik');
});

test('počítání hotových cviků', () => {
  const h = mnozina('workout:cvik#0', 'workout:cvik#3');
  assert.equal(pocetHotovychCviku(h, 4), 2);
  assert.equal(pocetHotovychCviku(h, 0), 0);
  assert.equal(pocetHotovychCviku(new Set(), 4), 0);
});

test('poslední odškrtnutý cvik dopíše celý trénink', () => {
  // Tři ze čtyř hotové, zaškrtávám ten čtvrtý.
  const h = mnozina('workout:cvik#0', 'workout:cvik#1', 'workout:cvik#2');
  assert.equal(maSeDopsatCelyTrenink({ hotove: h, pocetCviku: 4, index: 3, zaskrtava: true }), true);
});

test('nedokončený trénink se nedopisuje', () => {
  const h = mnozina('workout:cvik#0');
  assert.equal(maSeDopsatCelyTrenink({ hotove: h, pocetCviku: 4, index: 1, zaskrtava: true }), false);
});

test('odškrtnutí cviku zpátky celý trénink neruší ani nedopisuje', () => {
  const h = mnozina('workout:cvik#0', 'workout:cvik#1', 'workout:cvik#2', 'workout:cvik#3');
  assert.equal(maSeDopsatCelyTrenink({ hotove: h, pocetCviku: 4, index: 2, zaskrtava: false }), false);
});

test('když je trénink hotový ručně, nedopisuje se znovu', () => {
  const h = mnozina('workout:cvik#0', 'workout:cvik#1', `workout:${KLIC_CELEHO_TRENINKU}`);
  assert.equal(maSeDopsatCelyTrenink({ hotove: h, pocetCviku: 2, index: 1, zaskrtava: true }), false);
});

test('jediný cvik v tréninku dopíše celý trénink hned', () => {
  assert.equal(maSeDopsatCelyTrenink({ hotove: new Set(), pocetCviku: 1, index: 0, zaskrtava: true }), true);
});

test('trénink bez cviků se nedopisuje', () => {
  assert.equal(maSeDopsatCelyTrenink({ hotove: new Set(), pocetCviku: 0, index: 0, zaskrtava: true }), false);
  assert.equal(maSeDopsatCelyTrenink({}), false);
  assert.equal(maSeDopsatCelyTrenink(), false);
});

test('popis průběhu mlčí, dokud se nezačne', () => {
  assert.equal(popisProbehu(0, 8), null);
  assert.equal(popisProbehu(3, 8), '3 z 8 cviků hotovo');
  assert.equal(popisProbehu(1, 1), '1 z 1 cviku hotovo');
});

test('popis průběhu nespadne na nesmyslech', () => {
  assert.equal(popisProbehu(null, 8), null);
  assert.equal(popisProbehu(3, 0), null);
  assert.equal(popisProbehu(3, null), null);
});

test('prázdná nebo chybná množina nespadne', () => {
  assert.equal(jeCvikHotovy(null, 0), false);
  assert.equal(jeCvikHotovy(undefined, 0), false);
  assert.equal(jeTreninkHotovy(null), false);
});
