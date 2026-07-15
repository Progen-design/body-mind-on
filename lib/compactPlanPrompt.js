/**
 * Kompaktní vstup pro GPT při generování strukturovaného plánu (méně tokenů než volný text z celého bm).
 * Neobsahuje user_id, e-mail ani jiné identifikátory — jen pole ovlivňující výstup.
 */

import { bodyMetricsToPlanInput } from './bodyMetricsToPlanInput.js';
import { stripTrainingEnvironmentFromNotes } from './trainingEnvironment.js';

/**
 * @param {object} bodyMetrics - sloučený objekt bm + planInput z bodyMetricsToPlanInput
 * @returns {object}
 */
export function compactBodyMetricsForPlanPrompt(bodyMetrics) {
  if (!bodyMetrics || typeof bodyMetrics !== 'object') return {};
  const n = (x) => (x == null || x === '' ? null : x);
  const occupation = String(bodyMetrics.occupation || '').trim().slice(0, 100);
  const planInput = bodyMetricsToPlanInput(bodyMetrics);
  const notesRaw = [bodyMetrics.notes, bodyMetrics.preferences]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .join('; ')
    .trim();
  const notesWithoutEnv = stripTrainingEnvironmentFromNotes(notesRaw) || '';
  const notesForPrompt = notesWithoutEnv.slice(0, 350);
  const envDetail = planInput.training_environment_detail
    || String(bodyMetrics.training_environment_detail || '').trim()
    || null;

  return {
    goal: n(bodyMetrics.goal) || 'udrzovani',
    gender: n(bodyMetrics.gender),
    age: n(bodyMetrics.age),
    height_cm: n(bodyMetrics.height_cm ?? bodyMetrics.height),
    weight_kg: n(bodyMetrics.weight_kg ?? bodyMetrics.weight),
    activity: n(bodyMetrics.activity),
    stress: n(bodyMetrics.stress),
    ...(occupation ? { occupation } : {}),
    diet_type: n(bodyMetrics.diet_type) || 'standard',
    meals_per_day: Number(bodyMetrics.meals_per_day) || planInput.meals_per_day || 3,
    workouts_per_week: Number(bodyMetrics.workouts_per_week) || planInput.workouts_per_week || 0,
    weekly_sessions_label: n(bodyMetrics.weekly_sessions_user ?? bodyMetrics.weekly_sessions),
    workout_days_text: n(bodyMetrics.workout_days),
    preferred_workout_days: Array.isArray(bodyMetrics.preferred_workout_days)
      ? bodyMetrics.preferred_workout_days.filter((x) => typeof x === 'number')
      : planInput.preferred_workout_days,
    program: n(bodyMetrics.program),
    // Always a known equipment string for AI (bodyweight for "Ostatní")
    equipment: planInput.equipment || 'bodyweight',
    training_environment: planInput.training_environment || 'home_bodyweight',
    ...(planInput.training_environment_label
      ? { training_environment_label: planInput.training_environment_label }
      : {}),
    ...(envDetail
      ? { training_environment_note: String(envDetail).slice(0, 280) }
      : {}),
    allergies: n(bodyMetrics.allergies),
    dietary_restrictions: n(bodyMetrics.dietary_restrictions),
    foods_to_avoid: n(bodyMetrics.foods_to_avoid),
    ...(notesForPrompt ? { extra_notes: notesForPrompt } : {}),
    workout_duration_min: Number(bodyMetrics.workout_duration_min) || 60,
  };
}

/**
 * JSON řetězec pro user message (ASCII kompaktní).
 * Volitelně zahrne coach_memory_summary z bodyMetrics._coach_memory_summary (interní, neukládej do DB).
 * @param {object} bodyMetrics
 */
export function buildPlanPromptProfileJson(bodyMetrics) {
  try {
    const compact = compactBodyMetricsForPlanPrompt(bodyMetrics);
    const memRaw = bodyMetrics?._coach_memory_summary;
    if (memRaw != null && String(memRaw).trim()) {
      compact.coach_memory_summary = String(memRaw).trim().slice(0, 1200);
    }
    return JSON.stringify(compact);
  } catch {
    return '{}';
  }
}
