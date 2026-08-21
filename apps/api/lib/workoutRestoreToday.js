/**
 * Fast today-workout restore — structured JSON only, no HTML render, no external APIs.
 */
import { supabaseServer } from './supabaseServer';
import { loadOwnedPlanDay, isTodayWorkoutCompleted } from './workoutReplaceAuth';

/**
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.planId
 * @param {number} params.planDayIndex
 * @returns {Promise<{ ok: true, workout: object, structured_plan_json: object, idempotent?: boolean, timings: object } | { error: string, status: number, error_category?: string, timings?: object }>}
 */
export async function restoreTodayWorkout({ userId, planId, planDayIndex }) {
  const t0 = Date.now();
  const timings = { auth_ms: 0, db_read_ms: 0, db_update_ms: 0, total_ms: 0 };

  const dbReadStart = Date.now();

  const [completed, planCtx] = await Promise.all([
    isTodayWorkoutCompleted(userId, planId, planDayIndex),
    loadOwnedPlanDay(userId, planId, planDayIndex),
  ]);

  if (completed) {
    return { error: 'Trénink je již dokončený.', status: 409, error_category: 'workout_completed', timings: { ...timings, total_ms: Date.now() - t0 } };
  }
  if (planCtx.error) {
    return { error: planCtx.error, status: planCtx.status, error_category: 'plan_load', timings: { ...timings, total_ms: Date.now() - t0 } };
  }

  const dayWorkout = planCtx.day?.workout;
  const replacedTodayId = dayWorkout?.replaced_today_id;

  let replacement = null;

  if (replacedTodayId) {
    const { data } = await supabaseServer
      .from('workout_replacements')
      .select('id, status, original_workout, plan_id, plan_day')
      .eq('id', replacedTodayId)
      .eq('user_id', userId)
      .maybeSingle();
    replacement = data;
  }

  if (!replacement) {
    const { data } = await supabaseServer
      .from('workout_replacements')
      .select('id, status, original_workout, plan_id, plan_day')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('plan_day', String(planDayIndex))
      .in('status', ['confirmed', 'restored'])
      .order('confirmed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    replacement = data;
  }

  timings.db_read_ms = Date.now() - dbReadStart;

  if (!replacement?.original_workout) {
    if (replacedTodayId) {
      return {
        error: 'Původní trénink není k dispozici.',
        status: 404,
        error_category: 'no_replacement',
        timings: { ...timings, total_ms: Date.now() - t0 },
      };
    }
    const backup = dayWorkout?.original_workout_backup;
    if (!backup) {
      return {
        error: 'Původní trénink není k dispozici.',
        status: 404,
        error_category: 'no_replacement',
        timings: { ...timings, total_ms: Date.now() - t0 },
      };
    }
    replacement = { id: replacedTodayId, status: 'confirmed', original_workout: backup };
  }

  if (replacement.status !== 'confirmed' && replacement.status !== 'restored') {
    return {
      error: 'Náhrada není ve stavu pro obnovení.',
      status: 409,
      error_category: 'invalid_status',
      timings: { ...timings, total_ms: Date.now() - t0 },
    };
  }

  if (replacement.plan_id && replacement.plan_id !== planId) {
    return { error: 'Náhrada nepatří k tomuto plánu.', status: 403, error_category: 'ownership', timings: { ...timings, total_ms: Date.now() - t0 } };
  }
  if (replacement.plan_day && replacement.plan_day !== String(planDayIndex)) {
    return { error: 'Náhrada nepatří k tomuto dni.', status: 403, error_category: 'ownership', timings: { ...timings, total_ms: Date.now() - t0 } };
  }

  if (replacement.status === 'restored') {
    timings.total_ms = Date.now() - t0;
    return {
      ok: true,
      workout: planCtx.day.workout,
      structured_plan_json: planCtx.structured,
      idempotent: true,
      timings,
    };
  }

  const structured = planCtx.structured;
  const restoredWorkout = JSON.parse(JSON.stringify(replacement.original_workout));
  delete restoredWorkout.original_workout_backup;
  delete restoredWorkout.replaced_today_id;

  structured.days[planCtx.dayIdx].workout = restoredWorkout;

  const dbUpdateStart = Date.now();

  const { error: updErr } = await supabaseServer
    .from('ai_generated_plans')
    .update({ structured_plan_json: structured })
    .eq('id', planId)
    .eq('user_id', userId);

  if (updErr) {
    return {
      error: 'Nepodařilo se obnovit trénink.',
      status: 500,
      error_category: 'db_update',
      timings: { ...timings, db_update_ms: Date.now() - dbUpdateStart, total_ms: Date.now() - t0 },
    };
  }

  if (replacement.id) {
    await supabaseServer
      .from('workout_replacements')
      .update({ status: 'restored', restored_at: new Date().toISOString() })
      .eq('id', replacement.id)
      .eq('user_id', userId)
      .eq('status', 'confirmed');
  }

  timings.db_update_ms = Date.now() - dbUpdateStart;
  timings.total_ms = Date.now() - t0;

  return {
    ok: true,
    workout: restoredWorkout,
    structured_plan_json: structured,
    idempotent: false,
    timings,
  };
}
