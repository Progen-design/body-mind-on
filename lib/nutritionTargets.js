function asNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeGoal(goal) {
  const g = String(goal || '').toLowerCase().trim();
  if (g === 'redukce' || g === 'nabirani_svaly' || g === 'udrzovani') return g;
  return 'udrzovani';
}

function activityMultiplier(activity) {
  const value = String(activity || '').toLowerCase().trim();
  if (['velmi', 'very_active', 'active'].includes(value)) return 1.08;
  if (['stredne', 'moderate', 'light'].includes(value)) return 1.0;
  return 0.95;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * DOLNÍ LIMIT KALORICKÉHO CÍLE.
 *
 * ZJIŠTĚNÍ Z 13. 8. 2026: limit „ženy 1200 kcal, 0,8× BMR" v kódu NEEXISTOVAL.
 * Byl tu jen plochý `clamp(calories, 1200, 6000)` — pro ženy náhodou správný,
 * pro muže o dost nízký a na BMR nezávislý úplně. Dokud se cíl počítal jen při
 * registraci z ručně zadané váhy, moc to nevadilo. Jakmile se začne přepočítávat
 * z odvozené váhy, začne to vadit hodně: hubnoucí člověk dostává každý týden
 * nižší cíl a plochá podlaha ho nezastaví dřív než na 1200 kcal.
 *
 * Limit je proto max ze dvou věcí:
 *   1. absolutní minimum podle pohlaví (ženy 1200, muži 1500),
 *   2. 0,8 × BMR — škáluje s konkrétním člověkem, ne s tabulkou.
 *
 * BMR: Mifflin–St Jeor, standard pro tenhle účel.
 *
 * POZNÁMKA K MUŽSKÉ HODNOTĚ: zadání uvádělo výslovně jen ženských 1200.
 * 1500 pro muže je běžně používaný protějšek a je konzervativnější než
 * dosavadní stav, ale je to MŮJ předpoklad — potvrdit.
 */
export const MIN_KCAL_ZENA = 1200;
export const MIN_KCAL_MUZ = 1500;
/** Podíl BMR, pod který cíl nesmí klesnout. */
export const MIN_PODIL_BMR = 0.8;

function jeZena(gender) {
  const g = String(gender || '').toLowerCase().trim();
  return ['female', 'zena', 'žena', 'z', 'ž', 'f', 'w'].includes(g);
}

/**
 * Mifflin–St Jeor. Vrací null, když chybí vstup — dohadovat se výška ani věk
 * nesmí, protože z odhadu by vznikl limit, který nikoho nechrání.
 *
 * @returns {number|null}
 */
export function bmrMifflinStJeor({ weightKg, heightCm, age, gender } = {}) {
  const w = asNum(weightKg);
  const h = asNum(heightCm);
  const a = asNum(age);
  if (!(w > 0) || !(h > 0) || !(a > 0)) return null;
  const zaklad = 10 * w + 6.25 * h - 5 * a;
  return Math.round(zaklad + (jeZena(gender) ? -161 : 5));
}

/**
 * Dolní limit pro daného člověka. Platí pro KAŽDÝ výpočet cíle — registrační
 * i týdenní přepočet, protože obojí jde přes `calculateNutritionTargets`.
 *
 * @returns {{ limit: number, bmr: number|null, zaklad: number }}
 */
export function minimalniKalorickyCil({ weightKg, heightCm, age, gender } = {}) {
  const zaklad = jeZena(gender) ? MIN_KCAL_ZENA : MIN_KCAL_MUZ;
  const bmr = bmrMifflinStJeor({ weightKg, heightCm, age, gender });
  const zBmr = bmr === null ? 0 : Math.round(MIN_PODIL_BMR * bmr);
  return { limit: Math.max(zaklad, zBmr), bmr, zaklad };
}

function stableHash(input) {
  const text = JSON.stringify(input);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function calculateNutritionTargets({
  bodyMetrics = {},
  latestWithingsSummary = null,
  goal,
  activity,
  workoutDays = null,
  planAdjustmentSignal = null,
  forceRecalculate = false,
} = {}) {
  const normalizedGoal = normalizeGoal(goal ?? bodyMetrics?.goal);
  const weight = asNum(bodyMetrics?.weight_kg) ?? asNum(bodyMetrics?.weight) ?? 70;
  const registrationCalories = asNum(bodyMetrics?.calories_target);
  const activityMul = activityMultiplier(activity ?? bodyMetrics?.activity);
  const workoutDayCount = Array.isArray(workoutDays)
    ? workoutDays.length
    : asNum(bodyMetrics?.weekly_sessions_user) ?? asNum(bodyMetrics?.workouts_per_week) ?? 3;

  let calories = 0;
  if (
    !forceRecalculate
    && registrationCalories != null
    && registrationCalories >= 1000
    && registrationCalories <= 6000
  ) {
    calories = Math.round(registrationCalories);
  } else if (normalizedGoal === 'redukce') {
    calories = Math.round((weight * 28 - 300) * activityMul);
  } else if (normalizedGoal === 'nabirani_svaly') {
    calories = Math.round((weight * 32 + 200) * activityMul);
  } else {
    calories = Math.round((weight * 30) * activityMul);
  }

  let protein = Math.round(weight * (normalizedGoal === 'nabirani_svaly' ? 2.0 : normalizedGoal === 'redukce' ? 1.8 : 1.6));
  let fat = Math.round((calories * 0.28) / 9);

  if (workoutDayCount >= 5) {
    calories += 100;
    protein += 5;
  }

  const shouldAdjust = planAdjustmentSignal?.should_adjust_next_plan === true;
  if (shouldAdjust) {
    calories += asNum(planAdjustmentSignal?.calorie_delta_next_plan) ?? 0;
    protein += asNum(planAdjustmentSignal?.protein_delta_g) ?? 0;
  }

  // Limit se počítá z TÉ VÁHY, ze které se počítal i cíl — u týdenního
  // přepočtu tedy z odvozené, ne z registrační. Jinak by podlaha patřila
  // někomu jinému než strop.
  const { limit: minKcal, bmr } = minimalniKalorickyCil({
    weightKg: weight,
    heightCm: bodyMetrics?.height_cm,
    age: bodyMetrics?.age,
    gender: bodyMetrics?.gender,
  });
  const predLimitem = Math.round(calories);
  calories = clamp(predLimitem, minKcal, 6000);
  const limitPouzit = calories > predLimitem;

  protein = clamp(Math.round(protein), 70, 320);
  fat = clamp(Math.round(fat), 35, 200);
  const carbs = clamp(Math.round((calories - protein * 4 - fat * 9) / 4), 40, 700);

  const inputsForHash = {
    weight,
    goal: normalizedGoal,
    activity: activity ?? bodyMetrics?.activity ?? null,
    calories_target: registrationCalories,
    workout_days_count: workoutDayCount,
    withings_summary: latestWithingsSummary,
    plan_adjustment_signal: shouldAdjust ? planAdjustmentSignal : null,
  };

  return {
    calories_target: calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    source: 'body_metrics_withings_adjusted',
    calculated_at: new Date().toISOString(),
    inputs_hash: stableHash(inputsForHash),
    // Pro audit v `calorie_target_changes`: ať je zpětně vidět, že cíl
    // nedopadl podle vzorce, ale opřel se o dolní limit.
    floor_applied: limitPouzit,
    floor_value: minKcal,
    bmr,
  };
}
