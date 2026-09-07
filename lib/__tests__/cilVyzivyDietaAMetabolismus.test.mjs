/**
 * docs/DALSI_KROK.md 9.1, A + B1.
 *
 * A) Makrový rozpad ignoroval `diet_type` — tuk byl vždy 28 % energie, i u
 * nízkosacharidové diety. Nízkosacharidový uživatel dostával cíl 239 g
 * sacharidů (51 % energie), tedy přesný opak toho, co si zvolil.
 *
 * B1) Kalorický cíl se počítal z váhy, ne z TDEE (BMR × aktivita). Výška,
 * věk a pohlaví do něj nevstupovaly vůbec, přestože `bmrMifflinStJeor()` už
 * v souboru existovala — používala se jen na dolní limit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNutritionTargets,
  bmrMifflinStJeor,
  PODIL_TDEE_REDUKCE,
  PODIL_TDEE_NABIRANI,
  FAKTOR_AKTIVITY_SEDAVY,
  FAKTOR_AKTIVITY_STREDNE,
  FAKTOR_AKTIVITY_VELMI,
} from '../nutritionTargets.js';

const PROFIL = { weight_kg: 80, height_cm: 180, age: 30, gender: 'male' };

/** `bmrMifflinStJeor` čte camelCase, `body_metrics` je snake_case — most mezi nimi jen pro test. */
function bmrProfilu(bm) {
  return bmrMifflinStJeor({ weightKg: bm.weight_kg, heightCm: bm.height_cm, age: bm.age, gender: bm.gender });
}

test('A: low_carb dostane sacharidy v zadaném rozmezí, ne 51 % energie', () => {
  const t = calculateNutritionTargets({
    bodyMetrics: { ...PROFIL, diet_type: 'low_carb' },
    goal: 'udrzovani',
    activity: 'stredne',
  });
  const podilSacharidu = (t.carbs_g * 4) / t.calories_target;

  assert.ok(podilSacharidu >= 0.18 && podilSacharidu <= 0.28,
    `sacharidy tvoří ${(podilSacharidu * 100).toFixed(1)} % energie, čekalo se 20–25 %`);
  // Regresní hodnota z dřívějšího chybného vzorce — nesmí se tam vrátit.
  assert.ok(podilSacharidu < 0.4, 'low_carb nesmí dopadnout na 51 % energie ze sacharidů jako dřív');
});

test('A: tuk u low_carb je zbytek po bílkovinách a sacharidech, součet sedí na cíl', () => {
  const t = calculateNutritionTargets({
    bodyMetrics: { ...PROFIL, diet_type: 'low_carb' },
    goal: 'redukce',
    activity: 'velmi',
  });
  const soucet = t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9;
  assert.ok(Math.abs(soucet - t.calories_target) <= 10,
    `makra dávají ${soucet} kcal, cíl je ${t.calories_target}`);
});

test('A: ostatní diety (vegetarian, gluten_free, lactose_free) rozpad neupravují', () => {
  const bezDiety = calculateNutritionTargets({ bodyMetrics: PROFIL, goal: 'udrzovani', activity: 'stredne' });
  for (const diet of ['vegetarian', 'gluten_free', 'lactose_free', 'standard', '']) {
    const t = calculateNutritionTargets({
      bodyMetrics: { ...PROFIL, diet_type: diet },
      goal: 'udrzovani',
      activity: 'stredne',
    });
    assert.equal(t.fat_g, bezDiety.fat_g, `${diet}: tuk se nesmí lišit od výchozího rozpadu`);
    assert.equal(t.carbs_g, bezDiety.carbs_g, `${diet}: sacharidy se nesmí lišit od výchozího rozpadu`);
  }
});

test('B1: cíl vychází z TDEE (BMR × faktor aktivity pro TDEE), ne z váhy', () => {
  const bmr = bmrProfilu(PROFIL);
  const t = calculateNutritionTargets({ bodyMetrics: PROFIL, goal: 'udrzovani', activity: 'stredne' });
  // „stredne" = FAKTOR_AKTIVITY_STREDNE (1,55) — NE activityMultiplier() (1,0).
  // TDEE se zaokrouhlí na celé PŘED aplikací podílu cíle, „udržování“ = TDEE beze změny.
  assert.equal(t.calories_target, Math.round(bmr * FAKTOR_AKTIVITY_STREDNE));
});

test('B1: redukce a nabírání používají pojmenované podíly TDEE, ne váhu', () => {
  // Vyšší BMR než u PROFIL, ať 0,8× TDEE nespadne pod dolní limit a test
  // neověřuje omylem podlahu místo vzorce.
  const bm = { weight_kg: 90, height_cm: 190, age: 25, gender: 'male' };
  const bmr = bmrProfilu(bm);
  const tdee = Math.round(bmr * FAKTOR_AKTIVITY_STREDNE);
  const redukce = calculateNutritionTargets({ bodyMetrics: bm, goal: 'redukce', activity: 'stredne' });
  const nabirani = calculateNutritionTargets({ bodyMetrics: bm, goal: 'nabirani_svaly', activity: 'stredne' });

  assert.equal(redukce.calories_target, Math.round(tdee * PODIL_TDEE_REDUKCE));
  assert.equal(redukce.floor_applied, false, 'test má ověřit vzorec, ne podlahu');
  assert.equal(nabirani.calories_target, Math.round(tdee * PODIL_TDEE_NABIRANI));
});

test('B1: faktor aktivity pro TDEE není activityMultiplier() — 0,95/1,0/1,08 by dalo cíl pod BMR', () => {
  // Regrese proti první (chybné) verzi bodu B1: násobit BMR číslem
  // z activityMultiplier() dá "udržování" pod bazální metabolismus.
  const bmr = bmrProfilu(PROFIL);
  const sedavy = calculateNutritionTargets({ bodyMetrics: PROFIL, goal: 'udrzovani', activity: 'sedavy' });
  const stredne = calculateNutritionTargets({ bodyMetrics: PROFIL, goal: 'udrzovani', activity: 'stredne' });
  const velmi = calculateNutritionTargets({ bodyMetrics: PROFIL, goal: 'udrzovani', activity: 'velmi' });

  assert.equal(sedavy.calories_target, Math.round(bmr * FAKTOR_AKTIVITY_SEDAVY));
  assert.equal(stredne.calories_target, Math.round(bmr * FAKTOR_AKTIVITY_STREDNE));
  assert.equal(velmi.calories_target, Math.round(bmr * FAKTOR_AKTIVITY_VELMI));

  for (const t of [sedavy, stredne, velmi]) {
    assert.ok(t.calories_target > bmr, `cíl ${t.calories_target} nesmí být pod BMR ${bmr}`);
  }
});

test('B1: udržování nikdy neklesne pod BMR a padne do 1,3–1,8× BMR (5 profilů ze zadání)', () => {
  const profily = [
    { label: 'žena 32, 168/72, sedavá', bm: { weight_kg: 72, height_cm: 168, age: 32, gender: 'female', activity: 'sedavy' } },
    { label: 'muž 38, 183/95, sedavý', bm: { weight_kg: 95, height_cm: 183, age: 38, gender: 'male', activity: 'sedavy' } },
    { label: 'muž 27, 190/72, sedavý', bm: { weight_kg: 72, height_cm: 190, age: 27, gender: 'male', activity: 'sedavy' } },
    { label: 'žena 22, 158/50, velmi aktivní', bm: { weight_kg: 50, height_cm: 158, age: 22, gender: 'female', activity: 'velmi' } },
    { label: 'žena 57, 160/79, sedavá', bm: { weight_kg: 79, height_cm: 160, age: 57, gender: 'female', activity: 'sedavy' } },
  ];

  for (const { label, bm } of profily) {
    const t = calculateNutritionTargets({ bodyMetrics: bm, goal: 'udrzovani', activity: bm.activity });
    const bmr = t.bmr;
    assert.ok(t.calories_target >= bmr, `${label}: cíl ${t.calories_target} je pod BMR ${bmr} — to je hladovka, ne udržování`);
    const nasobekBmr = t.calories_target / bmr;
    assert.ok(
      nasobekBmr >= 1.3 && nasobekBmr <= 1.8,
      `${label}: cíl je ${nasobekBmr.toFixed(2)}× BMR, čekalo se 1,3–1,8×`
    );
  }
});

test('kontrolní čísla ze zadání: udržování/redukce/nabírání sedí přesně na pěti profilech', () => {
  const ocekavano = [
    { bm: { weight_kg: 72, height_cm: 168, age: 32, gender: 'female', activity: 'sedavy' }, u: 1992, r: 1594, n: 2191 },
    { bm: { weight_kg: 95, height_cm: 183, age: 38, gender: 'male', activity: 'sedavy' }, u: 2625, r: 2100, n: 2888 },
    { bm: { weight_kg: 72, height_cm: 190, age: 27, gender: 'male', activity: 'sedavy' }, u: 2445, r: 1956, n: 2690 },
    { bm: { weight_kg: 50, height_cm: 158, age: 22, gender: 'female', activity: 'velmi' }, u: 2099, r: 1679, n: 2309 },
    { bm: { weight_kg: 79, height_cm: 160, age: 57, gender: 'female', activity: 'sedavy' }, u: 1848, r: 1478, n: 2033 },
  ];

  for (const { bm, u, r, n } of ocekavano) {
    const udrzovani = calculateNutritionTargets({ bodyMetrics: bm, goal: 'udrzovani', activity: bm.activity });
    const redukce = calculateNutritionTargets({ bodyMetrics: bm, goal: 'redukce', activity: bm.activity });
    const nabirani = calculateNutritionTargets({ bodyMetrics: bm, goal: 'nabirani_svaly', activity: bm.activity });
    assert.equal(udrzovani.calories_target, u, `udržování ${JSON.stringify(bm)}`);
    assert.equal(redukce.calories_target, r, `redukce ${JSON.stringify(bm)}`);
    assert.equal(nabirani.calories_target, n, `nabírání ${JSON.stringify(bm)}`);
  }
});

test('B1: dva profily se stejnou váhou, ale jinou výškou/věkem, dostanou jiný cíl', () => {
  // Regresní důkaz proti starému vzorci `váha × koeficient`, který dá oběma
  // stejné číslo, ať je člověk jakkoli vysoký nebo starý.
  const nizkyMladsi = calculateNutritionTargets({
    bodyMetrics: { weight_kg: 80, height_cm: 165, age: 25, gender: 'male' },
    goal: 'udrzovani',
    activity: 'stredne',
  });
  const vysokyStarsi = calculateNutritionTargets({
    bodyMetrics: { weight_kg: 80, height_cm: 195, age: 55, gender: 'male' },
    goal: 'udrzovani',
    activity: 'stredne',
  });
  assert.notEqual(nizkyMladsi.calories_target, vysokyStarsi.calories_target);
});

test('B1: bez výšky nebo věku spadne na starou váhovou heuristiku, nedohaduje se', () => {
  const bezVysky = calculateNutritionTargets({
    bodyMetrics: { weight_kg: 80, age: 30, gender: 'male' },
    goal: 'udrzovani',
    activity: 'stredne',
  });
  // Stará heuristika pro udržování: váha × 30 × koeficient aktivity.
  assert.equal(bezVysky.calories_target, Math.round(80 * 30 * 1.0));
  assert.equal(bezVysky.bmr, null, 'bez výšky nejde BMR spočítat, ani pro limit');
});

test('chráněné věci u B1 zůstávají: uložený cíl a bonus za ≥5 tréninků', () => {
  // Uložený calories_target musí projít beze změny, i pro low_carb.
  const ulozeny = calculateNutritionTargets({
    bodyMetrics: { ...PROFIL, diet_type: 'low_carb', calories_target: 1999 },
    goal: 'redukce',
    activity: 'stredne',
  });
  assert.equal(ulozeny.calories_target, 1999);

  // Bonus +100 za ≥5 tréninků platí dál, přesně jednou, i po přechodu na TDEE.
  const bezBonusu = calculateNutritionTargets({
    bodyMetrics: PROFIL, goal: 'udrzovani', activity: 'stredne', workoutDays: ['1', '3'],
  });
  const sBonusem = calculateNutritionTargets({
    bodyMetrics: PROFIL, goal: 'udrzovani', activity: 'stredne', workoutDays: ['1', '2', '3', '4', '5'],
  });
  assert.equal(sBonusem.calories_target - bezBonusu.calories_target, 100);
});
