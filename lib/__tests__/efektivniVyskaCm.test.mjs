/**
 * VÝŠKA PRO api/profile.js MUSÍ JÍT ZE ZDROJE PRAVDY, NE ZE ZRCADLA.
 *
 * docs/DALSI_KROK.md 6.7(b): api/profile.js bral user.height_cm jen
 * z user_metadata. Zápis do metadat je v lib/updateHeightCm.js záměrně
 * best-effort (může selhat, aniž selže request) — takže se metadata mohla
 * kdykoli rozejít s body_metrics. PreferencesModal pak nezměněnou (ale
 * rozjetou) hodnotu vůbec neodeslal, protože ji srovnával se stejným
 * rozjetým zrcadlem, ne se zdrojem pravdy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { efektivniVyskaCm } from '../efektivniVyskaCm.js';

test('body_metrics má přednost před metadaty, i když se liší', () => {
  // Přesně produkční nález 6.5/6.7: metadata 194, body_metrics 182.
  assert.equal(efektivniVyskaCm({ height_cm: 182 }, { height_cm: 194 }), 182);
});

test('účet bez výšky v metadatech (t6) dostane výšku z body_metrics', () => {
  assert.equal(efektivniVyskaCm({ height_cm: 170 }, {}), 170);
  assert.equal(efektivniVyskaCm({ height_cm: 170 }, null), 170);
});

test('chybí-li body_metrics, spadne se na metadata', () => {
  assert.equal(efektivniVyskaCm(null, { height_cm: 180 }), 180);
  assert.equal(efektivniVyskaCm({}, { height_cm: 180 }), 180);
});

test('chybí-li obojí, vrací null (ne 0, ne vymyšlená hodnota)', () => {
  assert.equal(efektivniVyskaCm(null, null), null);
  assert.equal(efektivniVyskaCm({}, {}), null);
});

test('vrací číslo, ne řetězec z DB', () => {
  assert.equal(efektivniVyskaCm({ height_cm: '182' }, null), 182);
  assert.equal(typeof efektivniVyskaCm({ height_cm: '182' }, null), 'number');
});
