// lib/heightUpdatePatch.js
//
// Čistý výpočet toho, co se má zapsat, když se změní výška. Žádné DB volání,
// aby šel otestovat bez Supabase (stejný vzor jako lib/quickWeightRow.js).
//
// Z výšky se počítá BMR (Mifflin–St Jeor), takže uložit ji bez přepočtu
// `calories_target` je totéž jako ji neuložit — viz docs/DALSI_KROK.md 6.5:
// uživatel změnil výšku ze 182 na 194 cm, `calories_target` zůstal beze
// změny, protože se počítal ze starých 182.
//
// BMI má stejnou vadu ze stejného důvodu — počítá se z výšky. Přepočítává
// se přes calculateBmi() z lib/withingsProfileImport.js, ne druhou funkcí:
// lib/quickWeightRow.js (etapa 6.4) používá při změně váhy tutéž.
import { buildCalorieTargetBodyMetricsPatch } from './calorieTargetIntegrity.js';
import { calculateBmi } from './withingsProfileImport.js';

/**
 * @param {object} latestBodyMetrics — poslední řádek `body_metrics` uživatele
 * @param {number} heightCm — již ověřená výška (viz lib/vyskaMeze.js)
 * @returns {{
 *   bodyMetricsPatch: { height_cm: number, bmi: number|null, calories_target: number },
 *   metadataPatch: { height_cm: number },
 * }}
 */
export function buildHeightUpdatePatch(latestBodyMetrics, heightCm) {
  const upravenaMetrika = { ...latestBodyMetrics, height_cm: heightCm };
  const bodyMetricsPatch = {
    height_cm: heightCm,
    bmi: calculateBmi(latestBodyMetrics?.weight_kg, heightCm),
    ...buildCalorieTargetBodyMetricsPatch(upravenaMetrika, { forceRecalculate: true }),
  };
  return {
    bodyMetricsPatch,
    // Zrcadlo pro rychlé čtení (api/profile.js) — nikdy zdroj pravdy.
    metadataPatch: { height_cm: heightCm },
  };
}
