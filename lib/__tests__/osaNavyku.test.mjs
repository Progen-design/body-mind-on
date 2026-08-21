/**
 * Osa grafu návyků.
 *
 * Chyba, kterou to opravuje: spodní půlka osy měla popisky −1, −2. Dolů se
 * ale počítají zlozvyky, ne záporné splněné návyky — minus tam nepatří.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hornMez, maSpodniPul, popiskyOsy } from '../profile/osaNavyku.js';

test('horní mez je nejvyšší naměřená hodnota z obou směrů', () => {
  assert.equal(hornMez([{ posCount: 3, negCount: 1 }, { posCount: 2, negCount: 5 }]), 5);
  assert.equal(hornMez([{ posCount: 7, negCount: 0 }]), 7);
});

test('bez dat je mez 1, ne 0 — nulou se nedělí', () => {
  assert.equal(hornMez([]), 1);
  assert.equal(hornMez(null), 1);
  assert.equal(hornMez([{ posCount: 0, negCount: 0 }]), 1);
});

test('spodní půlka jen když uživatel sleduje zlozvyky', () => {
  assert.equal(maSpodniPul(5), true);
  assert.equal(maSpodniPul(0), false);
  assert.equal(maSpodniPul(null), false);
  assert.equal(maSpodniPul(undefined), false);
});

test('žádný popisek osy není záporný', () => {
  for (const spodni of [true, false]) {
    for (const tick of popiskyOsy(4, spodni)) {
      assert.ok(!tick.popisek.startsWith('-'), `popisek ${tick.popisek} je záporný`);
      assert.ok(Number(tick.popisek) >= 0, `popisek ${tick.popisek} < 0`);
    }
  }
});

test('bez zlozvyků jde osa od nuly nahoru', () => {
  const ticky = popiskyOsy(3, false);
  assert.deepEqual(ticky.map((t) => t.hodnota), [3, 2, 1, 0]);
  assert.deepEqual(ticky.map((t) => t.popisek), ['3', '2', '1', '0']);
});

test('se zlozvyky je osa oboustranná, ale popisky v absolutní hodnotě', () => {
  const ticky = popiskyOsy(2, true);
  assert.deepEqual(ticky.map((t) => t.hodnota), [2, 1, 0, -1, -2]);
  assert.deepEqual(ticky.map((t) => t.popisek), ['2', '1', '0', '1', '2']);
});

test('nula je vždy na ose', () => {
  for (const [max, spodni] of [[1, true], [1, false], [6, true], [6, false]]) {
    assert.ok(popiskyOsy(max, spodni).some((t) => t.hodnota === 0), `chybí nula (${max}, ${spodni})`);
  }
});

test('nesmyslná mez se ošetří, ne aby graf zmizel', () => {
  assert.deepEqual(popiskyOsy(0, false).map((t) => t.hodnota), [1, 0]);
  assert.deepEqual(popiskyOsy(NaN, false).map((t) => t.hodnota), [1, 0]);
});
