import test from 'node:test';
import assert from 'node:assert/strict';

import {
  naradiTreninku,
  serieOpakovaniSlovy,
  svalCesky,
  svalyTreninku,
  zamereniTreninku,
} from '../profile/treninkPopis.js';

/** Skutečný Trénink B z produkčního plánu 23. 8. 2026. */
const TRENINK_B = [
  { primary_muscle: 'glutes', equipment_class: 'barbell' },      // Rumunský mrtvý tah
  { primary_muscle: 'shoulders', equipment_class: 'dumbbell' },  // Tlaky nad hlavu
  { primary_muscle: 'back', equipment_class: 'cable' },          // Stahování na kladce
  { primary_muscle: 'hamstrings', equipment_class: 'machine' },  // Zakopávání vleže
  { primary_muscle: 'abs', equipment_class: 'body_weight' },     // Dead bug
];

test('zaměření se skládá ze skutečných cviků, neopisuje název', () => {
  const z = zamereniTreninku(TRENINK_B);
  // Do 23. 8. 2026 tu bylo „Varianta B" — název tréninku podruhé.
  assert.ok(z && !/varianta/i.test(z), `zaměření opisuje název: ${z}`);
  assert.ok(z.includes('záda'), 'chybí záda');
  assert.ok(z.includes('hýždě'), 'chybí hýždě');
});

test('trénink přes horní i dolní půlku se označí za celotělový', () => {
  assert.match(zamereniTreninku(TRENINK_B), /^Celé tělo — /);
});

test('trénink jen na horní půlku se za celotělový nevydává', () => {
  const jenHorni = [
    { primary_muscle: 'chest' },
    { primary_muscle: 'triceps' },
  ];
  const z = zamereniTreninku(jenHorni);
  assert.ok(!z.startsWith('Celé tělo'), `nohy tam nejsou: ${z}`);
  assert.equal(z, 'hrudník, triceps');
});

test('svaly se řadí po těle, ne podle pořadí cviků', () => {
  // V plánu jsou hýždě první, ale ve výpisu patří až za horní partie.
  const svaly = svalyTreninku(TRENINK_B);
  assert.ok(svaly.indexOf('záda') < svaly.indexOf('hýždě'), svaly.join(', '));
});

test('neznámý sval se nedopočítává ani nehádá z názvu', () => {
  assert.equal(svalCesky('neco_co_neexistuje'), null);
  assert.deepEqual(svalyTreninku([{ primary_muscle: 'neznamy' }]), []);
  assert.equal(zamereniTreninku([{ primary_muscle: 'neznamy' }]), null);
});

test('nářadí se vypíše česky a bez duplicit', () => {
  assert.deepEqual(
    naradiTreninku(TRENINK_B),
    ['jednoručky', 'kladka', 'stroj', 'velká činka', 'vlastní váha']
  );
});

test('zápis série se rozepíše slovy', () => {
  assert.equal(serieOpakovaniSlovy(3, '8-10'), '3 série po 8–10 opakováních');
  assert.equal(serieOpakovaniSlovy(5, '5'), '5 sérií po 5 opakováních');
  assert.equal(serieOpakovaniSlovy(3, '10-12 na stranu'), '3 série po 10–12 na stranu opakováních');
});

test('výdrž na čas se nepopisuje jako opakování', () => {
  assert.equal(serieOpakovaniSlovy(3, '30 s'), '3 série po 30 s');
});

test('bez počtu sérií se věta nevyrábí', () => {
  assert.equal(serieOpakovaniSlovy(0, '8-10'), null);
  assert.equal(serieOpakovaniSlovy(3, ''), null);
});
