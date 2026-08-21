/**
 * Seskupení cviků podle partie.
 *
 * Sekce „Dnešní trénink“ byla plochý seznam „název + série×opakování“.
 * Partie i nářadí přitom v kanonickém registru cviků jsou.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ikonaCviku, seskupCviky, skupinaCviku, stojiZaSeskupeni } from '../profile/cvikSkupiny.js';

/** Zjednodušený registr ve tvaru, jaký vrací getCanonicalExercise. */
const REGISTR = {
  bench_press: { body_part: 'chest', equipment: 'barbell', display_name_cs: 'Tlak na lavici' },
  squat: { body_part: 'upper legs', equipment: 'barbell', display_name_cs: 'Dřep' },
  pull_up: { body_part: 'back', equipment: 'body weight', display_name_cs: 'Shyb' },
  plank: { body_part: 'waist', equipment: 'body weight', display_name_cs: 'Prkno' },
  lunge: { body_part: 'upper legs', equipment: 'body weight', display_name_cs: 'Výpad' },
};
const najdi = (k) => REGISTR[k] || null;

test('skupina se určí z body_part', () => {
  assert.equal(skupinaCviku({ body_part: 'chest' }).popisek, 'Hrudník');
  assert.equal(skupinaCviku({ body_part: 'upper legs' }).popisek, 'Nohy');
  assert.equal(skupinaCviku({ body_part: 'waist' }).popisek, 'Střed těla');
});

test('neznámý nebo chybějící cvik spadne do Ostatní, nevymýšlí se partie', () => {
  assert.equal(skupinaCviku({ body_part: 'tentacles' }).popisek, 'Ostatní');
  assert.equal(skupinaCviku(null).popisek, 'Ostatní');
  assert.equal(skupinaCviku({}).popisek, 'Ostatní');
});

test('ikona jde primárně podle nářadí', () => {
  assert.equal(ikonaCviku({ body_part: 'chest', equipment: 'barbell' }), '🏋️');
  assert.equal(ikonaCviku({ body_part: 'back', equipment: 'body weight' }), '🤸');
});

test('bez nářadí se vezme ikona partie', () => {
  assert.equal(ikonaCviku({ body_part: 'chest' }), '🫀');
  assert.equal(ikonaCviku(null), '🏋️');
});

test('cviky se seskupí a skupiny drží pevné pořadí', () => {
  const cviky = [
    { canonical_key: 'squat' },
    { canonical_key: 'bench_press' },
    { canonical_key: 'plank' },
    { canonical_key: 'lunge' },
  ];
  const skupiny = seskupCviky(cviky, najdi);
  // Hrudník (1) před Nohami (5) před Středem těla (6) — bez ohledu na pořadí vstupu.
  assert.deepEqual(skupiny.map((s) => s.popisek), ['Hrudník', 'Nohy', 'Střed těla']);
  assert.equal(skupiny.find((s) => s.popisek === 'Nohy').cviky.length, 2);
});

test('původní index cviku se zachová — kliknutí musí trefit správný cvik', () => {
  const cviky = [{ canonical_key: 'squat' }, { canonical_key: 'bench_press' }, { canonical_key: 'lunge' }];
  const skupiny = seskupCviky(cviky, najdi);
  const nohy = skupiny.find((s) => s.popisek === 'Nohy');
  assert.deepEqual(nohy.cviky.map((c) => c.index), [0, 2]);
  const hrudnik = skupiny.find((s) => s.popisek === 'Hrudník');
  assert.deepEqual(hrudnik.cviky.map((c) => c.index), [1]);
});

test('žádný cvik se seskupením neztratí', () => {
  const cviky = [
    { canonical_key: 'squat' }, { canonical_key: 'neznamy' }, { canonical_key: 'plank' },
    { canonical_key: null }, { canonical_key: 'bench_press' },
  ];
  const skupiny = seskupCviky(cviky, najdi);
  const celkem = skupiny.reduce((s, g) => s + g.cviky.length, 0);
  assert.equal(celkem, cviky.length);
});

test('prázdný seznam nevyrobí prázdné skupiny', () => {
  assert.deepEqual(seskupCviky([], najdi), []);
  assert.deepEqual(seskupCviky(null, najdi), []);
});

test('chybějící registr nespadne', () => {
  const skupiny = seskupCviky([{ canonical_key: 'squat' }], null);
  assert.equal(skupiny.length, 1);
  assert.equal(skupiny[0].popisek, 'Ostatní');
});

test('jedna skupina se nadpisem nedělí', () => {
  assert.equal(stojiZaSeskupeni(seskupCviky([{ canonical_key: 'squat' }], najdi)), false);
  assert.equal(stojiZaSeskupeni(seskupCviky([{ canonical_key: 'squat' }, { canonical_key: 'plank' }], najdi)), true);
});

test('každá skupina má popisek i ikonu', () => {
  for (const s of seskupCviky([{ canonical_key: 'squat' }, { canonical_key: 'pull_up' }], najdi)) {
    assert.ok(s.popisek, 'skupina bez popisku');
    assert.ok(s.ikona, 'skupina bez ikony');
  }
});
