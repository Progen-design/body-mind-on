/**
 * Denní přehled s jídlem mimo plán — „Cíl 2200 · Plán 1800 · Mimo plán 450 · Zbývá −50".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { denniPrehled, naZapisMimoPlan, naZapisyMimoPlan, type ZapisMimoPlan } from './adaptery.ts';

const zPlanu = { kcalSnedeno: 1800, bilkovinyG: 120, sacharidyG: 180, tukyG: 60 };

function zapis(den: string, kcal: number, extra: Partial<ZapisMimoPlan> = {}): ZapisMimoPlan {
  return {
    id: `${den}-${kcal}`, zdroj: 'foto', popis: 'x', fotoUrl: null, kcal, protein: 10, carbs: 20, fat: 5,
    jistota: 'medium', upraveno: false, den, vytvoreno: `${den}T12:00:00Z`, ...extra,
  };
}

test('příklad ze zadání: cíl 2200, plán 1800, mimo plán 450 → zbývá −50', () => {
  const p = denniPrehled(2200, zPlanu, [zapis('2026-09-24', 300), zapis('2026-09-24', 150)], '2026-09-24');
  assert.equal(p.cilKcal, 2200);
  assert.equal(p.planKcal, 1800);
  assert.equal(p.mimoPlanKcal, 450);
  assert.equal(p.celkemKcal, 2250);
  assert.equal(p.zbyvaKcal, -50, 'přejedení se neschovává za nulu');
});

test('makra: plán + mimo plán', () => {
  const p = denniPrehled(2200, zPlanu, [zapis('2026-09-24', 300), zapis('2026-09-24', 150)], '2026-09-24');
  assert.equal(p.bilkovinyG, 140);
  assert.equal(p.sacharidyG, 220);
  assert.equal(p.tukyG, 70);
});

test('počítají se jen zápisy vybraného dne', () => {
  const p = denniPrehled(2200, zPlanu, [zapis('2026-09-23', 900), zapis('2026-09-24', 200)], '2026-09-24');
  assert.equal(p.mimoPlanKcal, 200);
  assert.equal(p.zapisyDne.length, 1);
});

test('bez zápisů je přehled jen plán a nic se nevymýšlí', () => {
  const p = denniPrehled(2200, zPlanu, [], '2026-09-24');
  assert.equal(p.mimoPlanKcal, 0);
  assert.equal(p.zbyvaKcal, 400);
  assert.equal(p.bilkovinyG, 120);
});

test('bez vybraného dne se zápisy nepřičítají', () => {
  assert.equal(denniPrehled(2200, zPlanu, [zapis('2026-09-24', 300)], null).mimoPlanKcal, 0);
});

test('adaptér: řádek z API → zápis, nesmyslné řádky vypadnou', () => {
  const z = naZapisMimoPlan({
    id: 'a', zdroj: 'foto', popis: ' Pizza ', foto_url: 'https://x', kcal: '812.4', protein_g: '30.25', carbs_g: 90,
    fat_g: 35, ai_confidence: 'low', upraveno_uzivatelem: true, plan_day: '2026-09-24', created_at: '2026-09-24T12:00:00Z',
  });
  assert.equal(z?.popis, 'Pizza');
  assert.equal(z?.kcal, 812);
  assert.equal(z?.protein, 30.3);
  assert.equal(z?.jistota, 'low');
  assert.equal(z?.upraveno, true);
  assert.equal(naZapisMimoPlan({ ...z, id: 'b', ai_confidence: 'nevim' })?.jistota, null);
  assert.equal(naZapisyMimoPlan([null, { bez: 'id' }, { id: 'c', kcal: 10 }]).length, 1);
  assert.deepEqual(naZapisyMimoPlan('nesmysl'), []);
});
