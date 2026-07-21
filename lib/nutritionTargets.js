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

  calories = clamp(Math.round(calories), 1200, 6000);
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
  };
}
