/**
 * Single source of truth for daily calorie target across profile, plan, and UI.
 */
import { calculateNutritionTargets } from './nutritionTargets.js';

/** Max daily sum deviation from canonical target (±10 %). */
export const CANONICAL_DAY_CALORIE_TOLERANCE = 0.10;

/**
 * Canonical daily kcal target from body_metrics (TDEE + goal + activity + adjustments).
 * @param {object} bodyMetrics
 * @param {{ forceRecalculate?: boolean }} [opts]
 */
export function getCanonicalCalorieTarget(bodyMetrics, opts = {}) {
  const targets = calculateNutritionTargets({
    bodyMetrics,
    latestWithingsSummary: bodyMetrics?.withings_summary ?? null,
    goal: bodyMetrics?.goal,
    activity: bodyMetrics?.activity,
    workoutDays: bodyMetrics?.workout_days,
    planAdjustmentSignal: bodyMetrics?.plan_adjustment_signal ?? null,
    forceRecalculate: opts.forceRecalculate === true,
  });
  return Math.round(Number(targets.calories_target) || 0);
}

/**
 * Align structured plan targets with canonical calorie target (no per-day jitter).
 * @param {object} structuredPlan
 * @param {object} bodyMetrics
 */
export function normalizePlanCalorieTargets(structuredPlan, bodyMetrics) {
  if (!structuredPlan || typeof structuredPlan !== 'object') return structuredPlan;
  const canonical = getCanonicalCalorieTarget(bodyMetrics);
  if (!(canonical > 0)) return structuredPlan;

  structuredPlan.targets = structuredPlan.targets || {};
  structuredPlan.targets.calories_per_day = canonical;

  for (const day of structuredPlan.days || []) {
    day.daily_target_kcal = canonical;
    if (day._calorie_honesty && typeof day._calorie_honesty === 'object') {
      day._calorie_honesty.target_kcal = canonical;
    }
  }

  if (structuredPlan.calorie_honesty && typeof structuredPlan.calorie_honesty === 'object') {
    structuredPlan.calorie_honesty.target_kcal = canonical;
  }

  return structuredPlan;
}

/**
 * @param {object} structuredPlan
 * @param {object} bodyMetrics
 */
export function assertCalorieTargetConsistency(structuredPlan, bodyMetrics) {
  const expected = getCanonicalCalorieTarget(bodyMetrics);
  const planTarget = Math.round(Number(structuredPlan?.targets?.calories_per_day) || 0);
  const bmTarget = Math.round(Number(bodyMetrics?.calories_target) || 0);
  const ok = expected > 0 && planTarget === expected && (bmTarget <= 0 || bmTarget === expected);
  return {
    ok,
    expected,
    planTarget,
    bodyMetricsTarget: bmTarget || null,
    delta: planTarget > 0 && expected > 0 ? planTarget - expected : null,
    message: ok
      ? null
      : `Kalorický cíl nesedí: body_metrics=${bmTarget || '—'}, plán=${planTarget || '—'}, očekáváno=${expected || '—'}`,
  };
}

/**
 * Fields that should trigger calories_target recalculation.
 */
export const CALORIE_TARGET_RECALC_FIELDS = Object.freeze([
  'goal',
  'activity',
  'weight_kg',
  'weekly_sessions_user',
  'workout_days',
  'freq_choice',
]);

/**
 * Build body_metrics patch with recalculated calories_target (+ macros).
 * @param {object} bodyMetrics
 * @param {{ forceRecalculate?: boolean }} [opts]
 */
export function buildCalorieTargetBodyMetricsPatch(bodyMetrics, opts = {}) {
  const targets = calculateNutritionTargets({
    bodyMetrics,
    latestWithingsSummary: bodyMetrics?.withings_summary ?? null,
    goal: bodyMetrics?.goal,
    activity: bodyMetrics?.activity,
    workoutDays: bodyMetrics?.workout_days,
    planAdjustmentSignal: bodyMetrics?.plan_adjustment_signal ?? null,
    forceRecalculate: opts.forceRecalculate === true,
  });
  // JEN SLOUPCE, KTERÉ V `body_metrics` OPRAVDU JSOU.
  //
  // Do 10. 8. 2026 se tu vracelo i `protein_g`, `carbs_g` a `fat_g` — pod
  // špatnými jmény sloupců (bez `_target_g`), takže Postgres celý UPDATE
  // odmítl a neuložilo se ani `calories_target`. Chyba se spolkla do
  // `console.warn`, tak si toho nikdo nevšiml.
  //
  // MAKRA SE VRACÍ SPOLU S CÍLEM OD 31. 8. 2026.
  //
  // Migrace `20260823210000_body_metrics_macro_targets.sql` (23. 8.) přidala
  // `protein_target_g`/`carbs_target_g`/`fat_target_g` a `weeklyWeightRecalc.js`
  // je od té doby ukládá vedle `calories_target`. Tahle funkce ale dál vracela
  // jen kalorie — všichni čtyři volající (lib/heightUpdatePatch.js,
  // lib/unifiedPlanPipeline.js, api/profile-body-data.js,
  // api/profile-preferences.js) si tak přepsali
  // `calories_target` novým číslem a nechali u něj stará makra z jiného cíle.
  // Změřeno na produkci po opravě výšky: 2164 → 2634 kcal, makra beze změny
  // (185/205/67 g — to je součet přesně na starých 2164). Viz
  // docs/DALSI_KROK.md 6.7(a).
  //
  // `calculateNutritionTargets()` je čerstvě spočítala ve stejném volání
  // (`targets` výš) — stačí je vzít odsud, ne počítat podruhé jinde.
  return {
    calories_target: targets.calories_target,
    protein_target_g: targets.protein_g,
    carbs_target_g: targets.carbs_g,
    fat_target_g: targets.fat_g,
  };
}
