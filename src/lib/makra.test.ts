import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { denniMakra, gramyMakra } from './makra.ts';

/** Skutečný profil z produkce 23. 8. 2026. */
const PROFIL = {
  dailyCalorieTarget: 2164,
  proteinRatioPercent: 34,
  carbsRatioPercent: 38,
  fatRatioPercent: 28,
};

test('gramy sedí na kalorický cíl', () => {
  const m = denniMakra(PROFIL);
  assert.equal(m.bilkoviny.gramy, 184);
  assert.equal(m.sacharidy.gramy, 206);
  assert.equal(m.tuky.gramy, 67);

  // Zpětná kontrola: součet energie makro sedí na cíl (±5 kcal na zaokrouhlení).
  const kcal = m.bilkoviny.gramy * 4 + m.sacharidy.gramy * 4 + m.tuky.gramy * 9;
  assert.ok(Math.abs(kcal - PROFIL.dailyCalorieTarget) <= 5, `spocteno ${kcal} kcal`);
});

test('procenta se nesou beze změny z profilu', () => {
  const m = denniMakra(PROFIL);
  assert.equal(m.bilkoviny.procenta, 34);
  assert.equal(m.sacharidy.procenta, 38);
  assert.equal(m.tuky.procenta, 28);
});

test('tuky se počítají devíti kaloriemi na gram, ne čtyřmi', () => {
  // Kdyby se tuky počítaly jako sacharidy, vyšlo by 152 g místo 67 g.
  assert.equal(gramyMakra(2164, 28, 9), 67);
  assert.notEqual(gramyMakra(2164, 28, 9), gramyMakra(2164, 28, 4));
});

test('bez kalorického cíle se nevyrábí číslo', () => {
  const m = denniMakra({ ...PROFIL, dailyCalorieTarget: 0 });
  assert.equal(m.bilkoviny.gramy, 0);
  assert.equal(m.sacharidy.gramy, 0);
  assert.equal(m.tuky.gramy, 0);
});

test('gramy maker nejsou nikde napsané natvrdo', () => {
  // Do 23. 8. 2026 měl OverviewBentoGrid v JSX `B {procenta} % (103 g)`.
  // Procento bylo z profilu, gramy z makety — Přehled tvrdil 103 g,
  // Profil 184 g. Obě místa teď berou číslo z `denniMakra`.
  for (const soubor of ['../components/OverviewBentoGrid.tsx', '../components/ProfileSection.tsx']) {
    const kod = readFileSync(new URL(soubor, import.meta.url), 'utf8')
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\(\s*\d+\s*g\s*\)/.test(kod), `${soubor}: gramy maker natvrdo v JSX`);
    assert.ok(kod.includes('denniMakra') || kod.includes('makra.'), `${soubor}: makra se nepočítají ze sdíleného modulu`);
  }
});
