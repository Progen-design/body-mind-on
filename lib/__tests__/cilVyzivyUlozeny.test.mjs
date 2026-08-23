/**
 * CÍL VÝŽIVY SE UKLÁDÁ, NEPOČÍTÁ SE ZNOVU PŘI KAŽDÉM VOLÁNÍ.
 *
 * Chyba, kterou to opravuje: persistoval se jen `calories_target`, makra
 * nikdy. Bílkoviny vychází z váhy, takže s každou její změnou se posunuly
 * bílkoviny a jako zbytek i sacharidy.
 *
 * Změřeno na produkci u janprikopa@gmail.com: dva po sobě jdoucí týdenní
 * plány, oba 2164 kcal, ale jednou B 158 g / S 232 g a podruhé
 * B 183 g / S 207 g. Jídelníček se pokaždé skládal podle jiného cíle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateNutritionTargets } from '../nutritionTargets.js';

/** Skutečný profil z produkce po backfillu. */
const ULOZENY = {
  weight_kg: 103,
  height_cm: 182,
  age: 38,
  gender: 'male',
  goal: 'redukce',
  activity: 'stredne',
  calories_target: 2164,
  protein_target_g: 185,
  carbs_target_g: 205,
  fat_target_g: 67,
};

test('uložený cíl se vrátí beze změny', () => {
  const t = calculateNutritionTargets({ bodyMetrics: ULOZENY });
  assert.equal(t.calories_target, 2164);
  assert.equal(t.protein_g, 185);
  assert.equal(t.carbs_g, 205);
  assert.equal(t.fat_g, 67);
  assert.equal(t.macros_source, 'ulozeny_cil');
});

test('změna váhy uloženými makry nehne', () => {
  // Presne tohle drive rozhazovalo jidelnicek: vaha se hnula, bilkoviny
  // se prepocitaly a sacharidy dopadly jako zbytek.
  const lehci = calculateNutritionTargets({ bodyMetrics: { ...ULOZENY, weight_kg: 95 } });
  const tezsi = calculateNutritionTargets({ bodyMetrics: { ...ULOZENY, weight_kg: 110 } });
  assert.equal(lehci.protein_g, 185);
  assert.equal(tezsi.protein_g, 185);
  assert.equal(lehci.carbs_g, tezsi.carbs_g);
});

test('bez uložených maker se cíl odvodí ze vzorce', () => {
  const bezMaker = { ...ULOZENY, protein_target_g: null, carbs_target_g: null, fat_target_g: null };
  const t = calculateNutritionTargets({ bodyMetrics: bezMaker });
  assert.equal(t.macros_source, 'odvozeno');
  // redukce → váha × 1,8
  assert.equal(t.protein_g, Math.round(103 * 1.8));
});

test('forceRecalculate uložená makra obejde', () => {
  // Kontroluje se ZDROJ, ne hodnota: backfill použil tentýž vzorec, takže
  // odvozené číslo u tohohle profilu vyjde shodou okolností stejné.
  // Rozdíl je vidět, až když se uloží něco jiného, než vzorec dává.
  const t = calculateNutritionTargets({ bodyMetrics: ULOZENY, forceRecalculate: true });
  assert.equal(t.macros_source, 'odvozeno');

  const rucneUpraveny = { ...ULOZENY, protein_target_g: 210 };
  assert.equal(
    calculateNutritionTargets({ bodyMetrics: rucneUpraveny }).protein_g,
    210,
    'bez forceRecalculate se má vrátit uložená hodnota'
  );
  assert.equal(
    calculateNutritionTargets({ bodyMetrics: rucneUpraveny, forceRecalculate: true }).protein_g,
    Math.round(103 * 1.8),
    'forceRecalculate má uloženou hodnotu obejít'
  );
});

test('proteinový bonus se k uloženému cíli nepřičítá podruhé', () => {
  // Bonus +5 za 5 treninku uz je v ulozene hodnote zapocitany. Druhe
  // pricteni by cil posouvalo pri kazdem volani -- presne to se stalo
  // kaloriim v srpnu (3699 → 3799 → 3899).
  const t = calculateNutritionTargets({
    bodyMetrics: ULOZENY,
    workoutDays: ['po', 'ut', 'st', 'ct', 'pa'],
  });
  assert.equal(t.protein_g, 185, 'bonus se přičetl k uloženému cíli');
});

test('součet maker sedí na kalorický cíl', () => {
  const t = calculateNutritionTargets({ bodyMetrics: ULOZENY });
  const kcal = t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9;
  assert.ok(
    Math.abs(kcal - t.calories_target) <= 10,
    `makra dávají ${kcal} kcal, cíl je ${t.calories_target}`
  );
});

test('registrace ukládá makra, ne jen kalorie', async () => {
  const { readFileSync } = await import('node:fs');
  const zdroj = readFileSync(
    new URL('../registration/bodyMetricsRegistration.js', import.meta.url),
    'utf8'
  );
  for (const pole of ['protein_target_g', 'carbs_target_g', 'fat_target_g']) {
    assert.ok(
      new RegExp(`payload\\.${pole}\\s*=`).test(zdroj),
      `registrace neukládá ${pole}`
    );
  }
});

test('týdenní přepočet přepisuje makra spolu s kaloriemi', async () => {
  const { readFileSync } = await import('node:fs');
  const zdroj = readFileSync(new URL('../weeklyWeightRecalc.js', import.meta.url), 'utf8');
  assert.ok(
    /protein_target_g:\s*verdikt\.cile/.test(zdroj),
    'přepočet mění kalorie, ale makra nechává staré'
  );
});
