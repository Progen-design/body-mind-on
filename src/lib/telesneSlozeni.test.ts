// Telesne slozeni z withings_body_snapshots.
// Fixtures jsou doslovny vyrez z produkce (dotaz 22. 8. 2026), vcetne
// prazdneho radku z 20. 8., ktery Withings posila u skupin bez telesnych metrik.
import test from 'node:test';
import assert from 'node:assert/strict';

import { jePrazdnySnapshot, vyberTelesneSlozeni } from '../../lib/telesneSlozeni.js';

const PRODUKCE = [
  { measured_at: '2026-08-21T16:00:22Z', fat_percent: 14.7, muscle_mass_kg: 84.6, visceral_fat: 2.6, bmi: 31.5, basal_metabolic_rate: 2647, bone_mass_kg: 4.4 },
  { measured_at: '2026-08-21T01:07:02Z', fat_percent: 14.8, muscle_mass_kg: 83.2, visceral_fat: 2.6, bmi: 31.0, basal_metabolic_rate: 2594, bone_mass_kg: 4.2 },
  { measured_at: '2026-08-20T18:03:23Z', fat_percent: null, muscle_mass_kg: null, visceral_fat: null, bmi: null, basal_metabolic_rate: null, bone_mass_kg: null },
  { measured_at: '2026-08-14T15:48:39Z', fat_percent: 11.6, muscle_mass_kg: 88.9, visceral_fat: 2.4, bmi: 31.6, basal_metabolic_rate: 2757, bone_mass_kg: 3.6 }
];

test('vybere poslední snapshot se skutečnými hodnotami', () => {
  const s = vyberTelesneSlozeni(PRODUKCE);

  assert.ok(s);
  assert.equal(s.measured_at, '2026-08-21T16:00:22Z');
  assert.equal(s.fat_percent, 14.7);
  assert.equal(s.muscle_mass_kg, 84.6);
  assert.equal(s.visceral_fat, 2.6);
  assert.equal(s.bmi, 31.5);
  assert.equal(s.basal_metabolic_rate, 2647);
});

test('prázdný snapshot nepřebije poslední skutečná data', () => {
  // 20. 8. je cely null — skupina jen s aktivitou, ne mereni slozeni.
  const jenPrazdnyNahore = [
    { measured_at: '2026-08-25T10:00:00Z', fat_percent: null, muscle_mass_kg: null, visceral_fat: null, bmi: null, basal_metabolic_rate: null, bone_mass_kg: null },
    PRODUKCE[0]
  ];

  const s = vyberTelesneSlozeni(jenPrazdnyNahore);
  assert.equal(s?.measured_at, '2026-08-21T16:00:22Z', 'prazdny radek prebil skutecne mereni');
});

test('jePrazdnySnapshot pozná skupinu bez tělesných metrik', () => {
  assert.equal(jePrazdnySnapshot(PRODUKCE[2]), true);
  assert.equal(jePrazdnySnapshot(PRODUKCE[0]), false);
  assert.equal(jePrazdnySnapshot(null), true);
  assert.equal(jePrazdnySnapshot({}), true);
});

test('delta se počítá ze dvou skutečných snapshotů, prázdný se přeskočí', () => {
  const s = vyberTelesneSlozeni(PRODUKCE);

  assert.equal(s?.predchozi_measured_at, '2026-08-21T01:07:02Z');
  assert.equal(s?.zmena.fat_percent, -0.1);
  assert.equal(s?.zmena.muscle_mass_kg, 1.4);
  assert.equal(s?.zmena.bmi, 0.5);
});

test('bez druhého měření se delta nevymýšlí', () => {
  const s = vyberTelesneSlozeni([PRODUKCE[0]]);

  assert.equal(s?.predchozi_measured_at, null);
  for (const hodnota of Object.values(s!.zmena)) {
    assert.equal(hodnota, null, 'delta bez druheho mereni musi byt null');
  }
});

test('chybějící metrika je null, ne nula', () => {
  // Nula by tvrdila, ze jsme namerili nulu.
  const s = vyberTelesneSlozeni([
    { measured_at: '2026-08-21T16:00:22Z', fat_percent: 14.7, muscle_mass_kg: null, visceral_fat: null, bmi: null, basal_metabolic_rate: null, bone_mass_kg: null }
  ]);

  assert.equal(s?.fat_percent, 14.7);
  assert.equal(s?.muscle_mass_kg, null);
  assert.notEqual(s?.muscle_mass_kg, 0);
});

test('delta chybí, když jedna strana metriku nemá', () => {
  const s = vyberTelesneSlozeni([
    { measured_at: '2026-08-21T16:00:00Z', fat_percent: 14.7, muscle_mass_kg: 84.6, visceral_fat: null, bmi: null, basal_metabolic_rate: null, bone_mass_kg: null },
    { measured_at: '2026-08-20T16:00:00Z', fat_percent: null, muscle_mass_kg: 83.0, visceral_fat: null, bmi: null, basal_metabolic_rate: null, bone_mass_kg: null }
  ]);

  assert.equal(s?.zmena.fat_percent, null, 'delta proti neznamé hodnote se nesmi pocitat');
  assert.equal(s?.zmena.muscle_mass_kg, 1.6);
});

test('pořadí na vstupu nerozhoduje', () => {
  const prehazene = [PRODUKCE[3], PRODUKCE[1], PRODUKCE[2], PRODUKCE[0]];
  assert.equal(vyberTelesneSlozeni(prehazene)?.measured_at, '2026-08-21T16:00:22Z');
});

test('bez měření vrací null, aby se karta nezobrazila', () => {
  assert.equal(vyberTelesneSlozeni([]), null);
  assert.equal(vyberTelesneSlozeni(), null);
  assert.equal(vyberTelesneSlozeni([PRODUKCE[2]]), null, 'samy prazdny snapshot neni mereni');
});
