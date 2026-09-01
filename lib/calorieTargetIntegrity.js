/**
 * Single source of truth for daily calorie target across profile, plan, and UI.
 */
import { calculateNutritionTargets } from './nutritionTargets.js';
import { enqueueAIEvent } from './aiEvents.js';

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

/**
 * JEDINÉ MÍSTO, KTERÉ SMÍ VYROBIT UDÁLOST `target_changed`.
 *
 * docs/DALSI_KROK.md 8.1. Cíl se dnes mění na PĚTI místech (ne čtyřech, jak
 * uvádí zadání — `lib/weeklyWeightRecalc.js` píše `calories_target` přímo,
 * mimo `buildCalorieTargetBodyMetricsPatch()`, viz komentář u volajících
 * výš). Kdyby si každé z těch pěti míst stavělo emit samo, událost by
 * vznikala pětkrát jinak formulovaná, nebo by na některém místě chyběla —
 * přesně to selhání, kterému se má tahle funkce vyhnout. Volající jen předá
 * starou hodnotu a patch, který se zrovna chystá zapsat; jestli je to
 * doopravdy změna (a tedy jestli se má `ai_events` řádek vůbec založit),
 * rozhoduje výhradně tahle funkce.
 *
 * ZÁMĚRNĚ JEN ENQUEUE, ŽÁDNÝ `triggerImmediateDecision()`. Ten by hned
 * vyhodnotil `evaluateUserState()` a spustil VŠECHNA aktuálně zapnutá
 * pravidla pro toho uživatele (dnes jen `user_registered`), ne jen tohle.
 * U `api/profile-preferences.js` už `triggerImmediateDecision()` volá se
 * kvůli `diet_changed`/`goal_changed` — tam se nic nezdvojuje. Na ostatních
 * čtyřech místech (výška, váha, pipeline, týdenní přepočet) by šlo
 * o nové, dosud neexistující volání s vedlejšími účinky mimo scope
 * tohohle bodu.
 *
 * TOHLE NEZNAMENÁ, ŽE FRONTOVANÝ EVENT NIC NESPUSTÍ. Cron
 * `/api/ai/run-scheduler` (`vercel.json`, každých 15 minut) volá
 * `processAIEvents()` → `processPendingAIEvents()`, ten do 15 minut vezme
 * i tenhle `target_changed` řádek a zavolá na něj `evaluateUserState()` →
 * `createAITasksFromDecisions()` — úplně stejně, jako by šlo o
 * `diet_changed`. `enabled = false` u `target_changed → adjust_plan`
 * (migrace `20260901090000`) zabrání jen tomu, aby úlohu založilo TOHLE
 * pravidlo. Vedle DB pravidel ale `evaluateUserState()` vždycky (bez ohledu
 * na `ai_trigger_rules.enabled`) běží `getHardcodedDecisions()` a — i větví
 * pro DB pravidla, řádek 252 — nepodmíněná kontrola
 * `if (state.missing_plan) → trainer:initial_plan` (lib/aiDecisionEngine.js
 * ř. 81–83 a 252). Jediné, co teda z frontovaného `target_changed` může
 * dnes vzniknout, je `initial_plan`, a to jen u uživatele, který nikdy
 * neměl žádný plán. Změřeno: 20 účtů, 0 bez jakéhokoli plánu — `missing_plan`
 * je dnes u všech `false`, takže `target_changed` prakticky nevyrobí nic.
 *
 * @typedef {{
 *   oldCaloriesTarget: number|string|null|undefined,
 *   patch: { calories_target?: number, protein_target_g?: number|null, carbs_target_g?: number|null, fat_target_g?: number|null },
 *   source: 'height_updated'|'weight_updated'|'preferences_updated'|'plan_pipeline_recalc'|'weekly_recalc',
 * }} TargetChangedInput
 */

function kladneCeleKcal(value) {
  // `Number(null)` je 0 a `Number.isFinite(0)` je `true` — bez explicitní
  // kontroly na `null`/`undefined` by chybějící stará hodnota (registrace)
  // vyšla jako „cíl 0 kcal", tedy jako REÁLNÁ ZMĚNA na cokoli nenulového.
  // Zachyceno testem `lib/__tests__/targetChangedEvent.test.mjs`.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Čistá část rozhodnutí — bez DB, aby šla otestovat bez Supabase (stejný
 * vzor jako `lib/heightUpdatePatch.js`). Vrací `null`, když se nemá nic
 * poslat (žádná stará hodnota, žádná nová, nebo se opravdu nezměnily).
 *
 * @param {TargetChangedInput} args
 * @returns {{ old_calories_target: number, new_calories_target: number, source: string, protein_target_g: number|null, carbs_target_g: number|null, fat_target_g: number|null }|null}
 */
export function buildTargetChangedPayload({ oldCaloriesTarget, patch, source } = {}) {
  const oldTarget = kladneCeleKcal(oldCaloriesTarget);
  const newTarget = kladneCeleKcal(patch?.calories_target);
  // `oldTarget === null` znamená první uložení (registrace), ne změnu — tu
  // hlásí `user_registered`, ne `target_changed`. Ten případ navíc do
  // žádného z pěti míst výš nevede: registrace zapisuje INSERT, ne UPDATE
  // přes `buildCalorieTargetBodyMetricsPatch()`/`weeklyWeightRecalc.js`.
  if (oldTarget === null || newTarget === null || oldTarget === newTarget) return null;
  return {
    old_calories_target: oldTarget,
    new_calories_target: newTarget,
    source,
    protein_target_g: patch?.protein_target_g ?? null,
    carbs_target_g: patch?.carbs_target_g ?? null,
    fat_target_g: patch?.fat_target_g ?? null,
  };
}

/**
 * @param {string|null|undefined} userId
 * @param {TargetChangedInput} args
 */
export async function emitCalorieTargetChangedEvent(userId, args = {}) {
  if (!userId) return { ok: false, reason: 'missing_user' };
  const payload = buildTargetChangedPayload(args);
  if (!payload) return { ok: false, reason: 'no_real_change' };
  return enqueueAIEvent('target_changed', userId, payload);
}
