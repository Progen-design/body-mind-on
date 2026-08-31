// Makra jsou JEDNO cislo pro celou aplikaci: urci se pri registraci, ulozi
// do `body_metrics` a odtud je bere profil, prehled i generator jidelnicku.
//
// Chyba, kterou to hlida: `naPreference` cetla makra z `structured_plan_json`
// (otisk cile v okamziku generovani) a `body_metrics` az jako zalohu. Jakmile
// se cil zmenil, profil dal ukazoval staré cislo z planu. Mereno na produkci
// 23. 8. 2026 u janprikopa@gmail.com: ulozeny cil B 185 g, plan z 20. 8.
// B 158 g, profil ukazoval 158 g.
import test from 'node:test';
import assert from 'node:assert/strict';
import { naPreference } from './adaptery.ts';

const DNES = new Date().toISOString().slice(0, 10);

/** Plan se zamrzlym, uz neplatnym cilem. */
const PLAN_SE_STARYM_CILEM = {
  id: 'plan-stary-cil',
  is_active: true,
  valid_from: DNES,
  valid_until: DNES,
  structured_plan_json: {
    targets: { calories_per_day: 2164, protein_g: 158, carbs_g: 232, fat_g: 67 },
    days: [],
  },
};

const VYCHOZI = {
  dailyCalorieTarget: 0,
  proteinRatioPercent: 0,
  carbsRatioPercent: 0,
  fatRatioPercent: 0,
  proteinTargetG: null,
  carbsTargetG: null,
  fatTargetG: null,
  currentHeightCm: 182,
  targetWeightKg: 0,
  weeklyWorkoutsTarget: 3,
} as any;

/** Zpetny prevod procent na gramy, aby se tvrdilo o tom, co uzivatel vidi. */
function gramy(procenta: number, kcal: number, kcalNaGram: number): number {
  return Math.round((kcal * (procenta / 100)) / kcalNaGram);
}

/**
 * Preference nesou pomer v celych procentech, ne gramy, takze cesta
 * gramy -> procenta -> gramy zaokrouhluje dvakrat. Pri 2164 kcal je jedno
 * procento asi 5 g bilkovin, takze zpetny prevod sedne na +-2 g. Vic nez to
 * uz znamena, ze se nekde bere jine cislo, ne zaokrouhleni.
 */
function sediNaGramy(procenta: number, kcal: number, kcalNaGram: number, ocekavano: number, co: string) {
  const skutecnost = gramy(procenta, kcal, kcalNaGram);
  assert.ok(
    Math.abs(skutecnost - ocekavano) <= 2,
    `${co}: ceka se ~${ocekavano} g, vyslo ${skutecnost} g (${procenta} %)`
  );
}

test('ulozeny cil z body_metrics prebiji makra zamrzla v planu', () => {
  const pref = naPreference(
    {
      body_metrics: [
        { calories_target: 2164, protein_target_g: 185, carbs_target_g: 205, fat_target_g: 67 },
      ],
      plans: [PLAN_SE_STARYM_CILEM],
    } as any,
    VYCHOZI
  );

  assert.equal(pref.dailyCalorieTarget, 2164);
  sediNaGramy(pref.proteinRatioPercent, 2164, 4, 185, 'bilkoviny z ulozeneho cile');
  sediNaGramy(pref.carbsRatioPercent, 2164, 4, 205, 'sacharidy z ulozeneho cile');
  sediNaGramy(pref.fatRatioPercent, 2164, 9, 67, 'tuky z ulozeneho cile');

  // A hlavne: nesmi to byt cislo z planu.
  assert.notEqual(gramy(pref.proteinRatioPercent, 2164, 4), 158, 'nebere se zamrzly plan');

  // docs/DALSI_KROK.md 7.2b: gramy musí být přesné uložené číslo, ne jen to,
  // co se z nich dá zpětně dopočítat přes zaokrouhlené procento.
  assert.equal(pref.proteinTargetG, 185, 'proteinTargetG musí nést přesnou uloženou hodnotu');
  assert.equal(pref.carbsTargetG, 205);
  assert.equal(pref.fatTargetG, 67);
});

test('bez ulozenych maker se sahne do planu, ne na vychozi maketu', () => {
  const pref = naPreference(
    { body_metrics: [{ calories_target: 2164 }], plans: [PLAN_SE_STARYM_CILEM] } as any,
    VYCHOZI
  );

  sediNaGramy(pref.proteinRatioPercent, 2164, 4, 158, 'zaloha z planu');
  sediNaGramy(pref.carbsRatioPercent, 2164, 4, 232, 'sacharidy jako zaloha z planu');
});

test('bez maker i bez planu zustanou puvodni hodnoty, nic se nevymysli', () => {
  const pref = naPreference({ body_metrics: [{ calories_target: 2164 }], plans: [] } as any, {
    ...VYCHOZI,
    proteinRatioPercent: 30,
    carbsRatioPercent: 40,
    fatRatioPercent: 30,
  });

  assert.equal(pref.proteinRatioPercent, 30);
  assert.equal(pref.carbsRatioPercent, 40);
  assert.equal(pref.fatRatioPercent, 30);
});
