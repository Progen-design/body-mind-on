// Telesne slozeni z withings_body_snapshots.
// Fixtures jsou doslovny vyrez z produkce (dotaz 22. 8. 2026), vcetne
// prazdneho radku z 20. 8., ktery Withings posila u skupin bez telesnych metrik.
import test from 'node:test';
import assert from 'node:assert/strict';

import { jePrazdnySnapshot, vyberTelesneSlozeni } from '../../lib/telesneSlozeni.js';

// PRODUKCE[1] je schválně 3,5 dne (>72 h) před PRODUKCE[0], ne pár hodin jako
// v produkčním výřezu — testy „delta se počítá" jinak spadnou pod práh z 7.2f
// (viz `MIN_HODIN_MEZI_MERENIMI_PRO_ZMENU` v lib/telesneSlozeni.js).
const PRODUKCE = [
  { measured_at: '2026-08-21T16:00:22Z', fat_percent: 14.7, muscle_mass_kg: 84.6, visceral_fat: 2.6, bmi: 31.5, basal_metabolic_rate: 2647, bone_mass_kg: 4.4 },
  { measured_at: '2026-08-18T01:07:02Z', fat_percent: 14.8, muscle_mass_kg: 83.2, visceral_fat: 2.6, bmi: 31.0, basal_metabolic_rate: 2594, bone_mass_kg: 4.2 },
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
  // Bez heightCm appka BMI nevymýšlí ze surového sloupce — viz BMI testy níž.
  assert.equal(s.bmi, null);
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

  assert.equal(s?.predchozi_measured_at, '2026-08-18T01:07:02Z');
  assert.equal(s?.zmena.fat_percent, -0.1);
  assert.equal(s?.zmena.muscle_mass_kg, 1.4);
  // Bez heightCm je i zmena.bmi null — viz BMI testy níž.
  assert.equal(s?.zmena.bmi, null);
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
  // Rozestup 96 h — nad prahem 7.2f, ať test opravdu prochází cestou
  // "chybějící metrika", ne cestou "krátký rozestup".
  const s = vyberTelesneSlozeni([
    { measured_at: '2026-08-21T16:00:00Z', fat_percent: 14.7, muscle_mass_kg: 84.6, visceral_fat: null, bmi: null, basal_metabolic_rate: null, bone_mass_kg: null },
    { measured_at: '2026-08-17T16:00:00Z', fat_percent: null, muscle_mass_kg: 83.0, visceral_fat: null, bmi: null, basal_metabolic_rate: null, bone_mass_kg: null }
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

// docs/DALSI_KROK.md 7.2d — BMI z aktuální výšky, ne ze surového sloupce
// withings_body_snapshots.bmi (Withings ho počítá z výšky nastavené u sebe).
test('BMI se počítá z váhy a AKTUÁLNÍ výšky, ne ze surového sloupce bmi', () => {
  // Withings měl u sebe starou výšku a uložil bmi 999 — to se má ignorovat.
  const s = vyberTelesneSlozeni(
    [{ measured_at: '2026-08-31T19:17:00Z', weight_kg: 105.7, bmi: 999 }],
    194
  );
  assert.equal(s?.bmi, 28.1, 'BMI = 105,7 / 1,94² musí vyjít z výšky, ne ze sloupce bmi');
  assert.notEqual(s?.bmi, 999);
});

test('bez výšky appka BMI nevymýšlí — null, ne surová hodnota z Withings', () => {
  const s = vyberTelesneSlozeni([{ measured_at: '2026-08-31T19:17:00Z', weight_kg: 105.7, bmi: 28.1 }]);
  assert.equal(s?.bmi, null);
});

test('historie BMI je srovnatelná na jednu výšku (docs/DALSI_KROK.md 7.2d)', () => {
  // Změřeno na produkci: 30. 8. 104,8 kg (Withings BMI 31,6 ze staré výšky
  // 182 cm), 31. 8. 105,7 kg (Withings BMI 28,1 už ze správných 194 cm) —
  // váha stoupla, ale BMI ve Withings datech SPADLO o 3,5 bodu. Appka počítá
  // obě měření ze STEJNÉ (aktuální) výšky, takže BMI musí růst spolu s váhou,
  // ne naopak.
  const s = vyberTelesneSlozeni(
    [
      { measured_at: '2026-09-04T08:00:00Z', weight_kg: 105.7, bmi: 28.1 },
      { measured_at: '2026-08-30T22:43:00Z', weight_kg: 104.8, bmi: 31.6 }
    ],
    194
  );
  assert.equal(s?.bmi, 28.1);
  assert.ok(
    (s?.zmena.bmi ?? 0) > 0,
    `váha stoupla, appkové BMI ze stejné výšky musí taky stoupnout (vyšlo ${s?.zmena.bmi})`
  );
});

// docs/DALSI_KROK.md 7.2f — rozdíl mezi měřeními kratší než pár dní je šum
// impedance, ne změna složení těla.
test('rozdíl pod prahem (pár dní) se nepodává jako změna složení těla', () => {
  // Zmereno na produkci 31. 8. 2026: 21 h mezi měřeními ukazovala +3,4 kg
  // svalů a −1,8 % tuku „za den" — to je šum impedance, ne pokrok.
  const s = vyberTelesneSlozeni([
    { measured_at: '2026-08-31T19:17:00Z', fat_percent: 10.6, muscle_mass_kg: 91.5 },
    { measured_at: '2026-08-30T22:43:00Z', fat_percent: 12.4, muscle_mass_kg: 88.1 }
  ]);
  assert.equal(s?.predchozi_measured_at, '2026-08-30T22:43:00Z', 'předchozí měření pořád existuje');
  for (const [klic, hodnota] of Object.entries(s!.zmena)) {
    assert.equal(hodnota, null, `zmena.${klic} se pod prahem nesmí ukázat jako fakt`);
  }
});

test('rozdíl nad prahem (72 h+) se počítá normálně', () => {
  const s = vyberTelesneSlozeni([
    { measured_at: '2026-09-04T08:00:00Z', fat_percent: 10.6, muscle_mass_kg: 91.5 },
    { measured_at: '2026-08-30T22:43:00Z', fat_percent: 12.4, muscle_mass_kg: 88.1 }
  ]);
  assert.equal(Math.round((s?.zmena.fat_percent ?? 0) * 10) / 10, -1.8);
  assert.equal(Math.round((s?.zmena.muscle_mass_kg ?? 0) * 10) / 10, 3.4);
});
