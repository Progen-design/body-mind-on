/**
 * lib/planQualityMetrics.js — čistý výpočet metrik kvality plánu (bez DB / Supabase).
 */

import { MAX_PUBLISHABLE_WORKOUT_SETS } from './planDataIntegrity.js';
import {
  isTrustedExercisedbGifUrl,
  resolveTrustedGifForCanonicalKey,
} from './exerciseRegistryMedia.js';

const KCAL_TOLERANCE = 0.10;
const SKIP_EXERCISE_KEYS = new Set(['warmup', 'cooldown', 'rest', 'stretch']);

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/** Odvození očekávaného počtu jídel bez závislosti na planOrchestrator chain. */
function deriveExpectedMealsPerDay(bodyMetrics) {
  if (!bodyMetrics || typeof bodyMetrics !== 'object') return 3;
  const calTarget = asNum(bodyMetrics.calories_target)
    ?? asNum(bodyMetrics?.targets?.calories_per_day);
  if (calTarget != null && calTarget >= 2600) return 4;
  return Math.min(6, Math.max(2, asNum(bodyMetrics.meals_per_day) ?? 3));
}

function isRealTrainingExercise(ex) {
  const key = String(ex?.canonical_key || '').trim().toLowerCase();
  return key && !SKIP_EXERCISE_KEYS.has(key);
}

/**
 * @param {object|null|undefined} planJson
 * @param {object} [bodyMetrics]
 * @param {{ generation_source?: string|null, fallback_used?: boolean }} [opts]
 */
export function computePlanQualityMetrics(planJson, bodyMetrics = {}, opts = {}) {
  const days = Array.isArray(planJson?.days) ? planJson.days : [];
  const expectedMealsPerDay = deriveExpectedMealsPerDay(bodyMetrics);
  const dailyTarget = Number(
    planJson?.targets?.calories_per_day ?? bodyMetrics?.calories_target ?? null
  );

  let mealCountTotal = 0;
  let workoutDaysCount = 0;
  let maxSetsSeen = 0;
  let setsOverPublishableLimitCount = 0;
  let trustedGifCount = 0;
  let missingGifCount = 0;
  let unverifiedExerciseCount = 0;
  const dailyKcals = [];
  let dailyKcalOutOfToleranceCount = 0;

  for (const day of days) {
    const meals = day?.meals ?? [];
    mealCountTotal += meals.length;

    const dayKcal = meals.reduce((sum, m) => sum + (Number(m?.kcal) || 0), 0);
    if (dayKcal > 0) dailyKcals.push(dayKcal);
    if (Number.isFinite(dailyTarget) && dailyTarget > 0 && dayKcal > 0) {
      const diff = Math.abs(dayKcal - dailyTarget) / dailyTarget;
      if (diff > KCAL_TOLERANCE) dailyKcalOutOfToleranceCount += 1;
    }

    const exercises = day?.workout?.exercises ?? [];
    if (exercises.some(isRealTrainingExercise)) workoutDaysCount += 1;

    for (const ex of exercises) {
      if (!isRealTrainingExercise(ex)) continue;

      const key = String(ex.canonical_key || '').trim().toLowerCase();
      const sets = Number(ex.sets);
      if (Number.isFinite(sets)) {
        maxSetsSeen = Math.max(maxSetsSeen, sets);
        if (sets > MAX_PUBLISHABLE_WORKOUT_SETS) setsOverPublishableLimitCount += 1;
      }

      const hasTrustedGif = Boolean(ex.gif_url && isTrustedExercisedbGifUrl(ex.gif_url));
      const registryGif = resolveTrustedGifForCanonicalKey(key);
      if (hasTrustedGif) {
        trustedGifCount += 1;
      } else if (registryGif || (!ex.gif_url && !ex.video_url)) {
        missingGifCount += 1;
      }

      if (ex.exercise_verified === false) unverifiedExerciseCount += 1;
    }
  }

  return {
    days_count: days.length,
    meals_per_day_expected: expectedMealsPerDay,
    meal_count_total: mealCountTotal,
    workout_days_count: workoutDaysCount,
    max_sets_seen: maxSetsSeen,
    sets_over_publishable_limit_count: setsOverPublishableLimitCount,
    trusted_gif_count: trustedGifCount,
    missing_gif_count: missingGifCount,
    unverified_exercise_count: unverifiedExerciseCount,
    daily_kcal_min: dailyKcals.length ? Math.min(...dailyKcals) : null,
    daily_kcal_max: dailyKcals.length ? Math.max(...dailyKcals) : null,
    daily_kcal_target: Number.isFinite(dailyTarget) ? dailyTarget : null,
    daily_kcal_out_of_tolerance_count: dailyKcalOutOfToleranceCount,
    generation_source: opts.generation_source
      ?? planJson?._diagnostics?.generation_source
      ?? null,
    fallback_used: opts.fallback_used === true,
  };
}
