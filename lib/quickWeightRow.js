// lib/quickWeightRow.js
// Čistá funkce nad tvarem řádku, který ruční „Nové vážení" zapíše do
// body_metrics. Vytažená z api/quick-weight.js, aby šla otestovat bez DB.
import { calculateBmi } from './withingsProfileImport.js';

/**
 * PROČ CELÝ ŘÁDEK, NE RUČNÍ VÝČET POLÍ.
 *
 * Do 29. 8. 2026 tu stál ručně psaný seznam polí ke zkopírování z posledního
 * řádku. Chyběly v něm `diet_type`, `workout_days`, `dietary_restrictions`,
 * `foods_to_avoid`, `devices` a cíle výživy — ruční zvážení je tiše smazalo.
 * Viz docs/DALSI_KROK.md 6.4: vegetariánka, která se zvážila, přišla o
 * vegetariánství a dostala vyšší kalorický cíl, přestože zhubla.
 *
 * Základ nového řádku je proto CELÝ poslední řádek. Jediná pole, která se
 * vědomě přepisují, jsou `id` a `created_at` (DB je generuje sama — nový
 * řádek nesmí zdědit cizí identitu ani cizí čas vzniku), `weight_kg` (to je
 * smysl akce) a `bmi` (dopočítané z nové váhy, ne kopie staré).
 *
 * `calories_target`/`protein_target_g`/`carbs_target_g`/`fat_target_g` se
 * NEPŘEPOČÍTÁVAJÍ — zůstávají, jaké byly. `calculateNutritionTargets()`
 * (lib/nutritionTargets.js) bere uložený `calories_target` jako vědomé
 * rozhodnutí o člověku a nepřepočítává ho samo od sebe; kdyby řádek přišel
 * bez něj, spustil by se plný přepočet ze vzorce (případně o podlahu 0,8×
 * BMR výš) — přesně skok 1436 → 1537 kcal z produkčního nálezu. Cíl smí
 * změnit jen vědomá cesta: týdenní obnova plánu (weeklyWeightRecalc.js,
 * ze zprůměrované váhy za víc dní) nebo úprava v profilu
 * (api/profile-preferences.js, api/profile-body-data.js).
 *
 * @param {object} latest — poslední řádek body_metrics daného uživatele
 * @param {{ userId: string, weightKg: number, createdAt: string }} args
 * @returns {object} řádek pro insert do body_metrics
 */
export function buildQuickWeightRow(latest, { userId, weightKg, createdAt }) {
  const { id: _id, created_at: _createdAt, ...latestFields } = latest || {};
  return {
    ...latestFields,
    user_id: userId,
    weight_kg: weightKg,
    created_at: createdAt,
    bmi: calculateBmi(weightKg, latest?.height_cm),
  };
}
