/**
 * VÝŠKA MUSÍ SKONČIT V BODY_METRICS I V METADATECH A MUSÍ ZMĚNIT
 * CALORIES_TARGET I BMI — jinak se opakuje docs/DALSI_KROK.md 6.5: uživatel
 * změnil výšku ze 182 na 194 cm, hlavička profilu (čte metadata) to
 * ukázala, generátor plánu, kalorický cíl a BMI (čtou body_metrics) zůstaly
 * počítané ze 182, protože api/profile-settings.js zapisoval jen metadata.
 *
 * Test kryje čistou logiku (lib/heightUpdatePatch.js), ne DB zápis —
 * lib/updateHeightCm.js, který DB zápis dělá, importuje supabaseServer.js
 * a bez env proměnných by test spadl na připojení, ne na logice. Stejný
 * vzor jako lib/__tests__/quickWeightRow.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildHeightUpdatePatch } from '../heightUpdatePatch.js';
import { calculateBmi } from '../withingsProfileImport.js';

/** Odpovídá produkčnímu nálezu 31. 8. 2026 (docs/DALSI_KROK.md 6.5). */
const POSLEDNI_RADEK = {
  id: 'radek-1',
  user_id: 'user-1',
  weight_kg: 104.8,
  height_cm: 182,
  age: 38,
  gender: 'male',
  goal: 'redukce',
  activity: 'stredne',
  workout_days: ['1', '3', '5'],
  calories_target: 2164,
  bmi: calculateBmi(104.8, 182),
};

test('patch nese novou výšku do body_metrics i do metadat', () => {
  const { bodyMetricsPatch, metadataPatch } = buildHeightUpdatePatch(POSLEDNI_RADEK, 194);

  assert.equal(bodyMetricsPatch.height_cm, 194);
  assert.equal(metadataPatch.height_cm, 194);
});

test('patch přepočítá calories_target podle nové výšky, ne podle staré', () => {
  // docs/DALSI_KROK.md 9.1/B1: cíl se od 7. 9. 2026 odvozuje z TDEE (BMR ×
  // aktivita), ne z váhy — u redukce/nabírání navíc s vlastním podílem TDEE,
  // takže "vyšší postava vždy vyšší cíl" už neplatí obecně (nižší dolní
  // strop u vyššího BMR to nekompenzuje vždy směrem nahoru). Skutečná
  // invariant z 6.5 je, že se výška do přepočtu VŮBEC dostane — porovnává
  // se proto přepočet při nové výšce s přepočtem při té staré, ne s
  // libovolnou dřív uloženou hodnotou.
  const { bodyMetricsPatch: novy } = buildHeightUpdatePatch(POSLEDNI_RADEK, 194);
  const { bodyMetricsPatch: puvodniVyska } = buildHeightUpdatePatch(POSLEDNI_RADEK, 182);

  assert.notEqual(novy.calories_target, POSLEDNI_RADEK.calories_target);
  assert.notEqual(
    novy.calories_target,
    puvodniVyska.calories_target,
    'cíl vyšel stejně jako při staré výšce — výška se do přepočtu nedostala'
  );
});

test('patch přepočítá bmi podle nové výšky, ne podle staré', () => {
  const { bodyMetricsPatch } = buildHeightUpdatePatch(POSLEDNI_RADEK, 194);

  // Přesně vzorec, ne magická konstanta — bmi = váha / (výška v m)^2.
  const ocekavaneBmi = Math.round((104.8 / (1.94 * 1.94)) * 10) / 10;
  assert.equal(bodyMetricsPatch.bmi, ocekavaneBmi);

  // A hlavně: musí se lišit od staré hodnoty spočítané z 182 cm — to je
  // přesně vada z 6.5, jen v jiném poli.
  assert.notEqual(bodyMetricsPatch.bmi, POSLEDNI_RADEK.bmi);
});

test('bmi se počítá přes calculateBmi ze stejného modulu jako lib/quickWeightRow.js, ne přes vlastní vzorec', () => {
  // Etapa 6.4: quickWeightRow.js přepočítává bmi při změně váhy přes
  // calculateBmi() z lib/withingsProfileImport.js. Výška má stejnou
  // povinnost mít jeden zdroj vzorce, ne druhou implementaci.
  const handler = fs.readFileSync(new URL('../heightUpdatePatch.js', import.meta.url), 'utf8');
  assert.match(
    handler,
    /from '\.\/withingsProfileImport\.js'/,
    'heightUpdatePatch.js nepoužívá calculateBmi ze sdíleného modulu'
  );
});

test('patch nemění nic jiného než height_cm, bmi, calories_target a makra', () => {
  const { bodyMetricsPatch } = buildHeightUpdatePatch(POSLEDNI_RADEK, 194);
  assert.deepEqual(
    Object.keys(bodyMetricsPatch).sort(),
    ['bmi', 'calories_target', 'carbs_target_g', 'fat_target_g', 'height_cm', 'protein_target_g']
  );
});

test('patch přepočítá makra podle nové výšky, ne podle staré — docs/DALSI_KROK.md 6.7(a)', () => {
  // Produkční nález: calories_target se po opravě výšky přepočítal
  // (2164 → 2634), makra zůstala 185/205/67 g — součet přesně na starý
  // cíl 2164, ne na nový. Řádek si sám odporoval.
  const { bodyMetricsPatch } = buildHeightUpdatePatch(
    { ...POSLEDNI_RADEK, protein_target_g: 185, carbs_target_g: 205, fat_target_g: 67 },
    194
  );

  const soucetKcal = bodyMetricsPatch.protein_target_g * 4
    + bodyMetricsPatch.carbs_target_g * 4
    + bodyMetricsPatch.fat_target_g * 9;
  assert.ok(
    Math.abs(soucetKcal - bodyMetricsPatch.calories_target) <= 8,
    `makra (${soucetKcal} kcal) neodpovídají novému calories_target (${bodyMetricsPatch.calories_target})`
  );
});

test('api/profile-settings.js a api/profile-body-data.js zapisují výšku přes updateHeightCm, ne samy', () => {
  // Regrese na příčinu z 6.5: profile-settings.js dřív psal height_cm jen
  // do user_metadata, nikdy do body_metrics.
  for (const soubor of ['../../api/profile-settings.js', '../../api/profile-body-data.js']) {
    const handler = fs.readFileSync(new URL(soubor, import.meta.url), 'utf8');
    assert.match(
      handler,
      /from '\.\.\/lib\/updateHeightCm\.js'/,
      `${soubor} neimportuje sdílenou funkci pro zápis výšky`
    );
    assert.equal(
      /height_cm\s*[<>]=?\s*\d/.test(handler),
      false,
      `${soubor} má meze výšky natvrdo, místo aby je vzal z lib/vyskaMeze.js`
    );
  }
});
