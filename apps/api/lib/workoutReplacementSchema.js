/** Strict validation for workout replacement API responses. */

const EXERCISE_SCHEMA = {
  name: 'string',
  sets: 'number',
  reps: 'string|null',
  rest_seconds: 'number|null',
  instructions: 'string|null',
  equipment: 'string|null',
};

export const WORKOUT_REPLACE_PROMPT_VERSION = 'workout_today_v1';

/**
 * @param {unknown} data
 * @returns {{ ok: boolean, value?: object, error?: string }}
 */
export function validateReplacementPreview(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid_payload' };
  const d = /** @type {Record<string, unknown>} */ (data);
  if (typeof d.replacement_id !== 'string' || !d.replacement_id) return { ok: false, error: 'missing_replacement_id' };
  if (typeof d.title !== 'string' || !d.title.trim()) return { ok: false, error: 'missing_title' };
  const duration = Number(d.duration_minutes);
  if (!Number.isFinite(duration) || duration < 10 || duration > 90) return { ok: false, error: 'invalid_duration' };
  if (!Array.isArray(d.focus) || d.focus.length < 1) return { ok: false, error: 'invalid_focus' };
  if (!Array.isArray(d.exercises) || d.exercises.length < 1 || d.exercises.length > 8) {
    return { ok: false, error: 'invalid_exercises' };
  }
  for (const ex of d.exercises) {
    if (!ex || typeof ex !== 'object') return { ok: false, error: 'invalid_exercise' };
    if (typeof ex.name !== 'string' || !ex.name.trim()) return { ok: false, error: 'invalid_exercise_name' };
    const sets = Number(ex.sets);
    if (!Number.isFinite(sets) || sets < 1 || sets > 6) return { ok: false, error: 'invalid_sets' };
    if (ex.reps != null && typeof ex.reps !== 'string') return { ok: false, error: 'invalid_reps' };
  }
  if (d.expires_at != null && typeof d.expires_at !== 'string') return { ok: false, error: 'invalid_expires' };
  return { ok: true, value: d };
}

/**
 * @param {object} workout
 * @returns {object}
 */
export function toStructuredDayWorkout(workout) {
  const exercises = (workout.exercises || []).map((ex) => ({
    canonical_key: ex.canonical_key || null,
    name_cs: ex.name || ex.name_cs || 'Cvik',
    display_name_cs: ex.display_name_cs || ex.name || ex.name_cs || 'Cvik',
    sets: ex.sets,
    reps: ex.reps || null,
    duration_sec: ex.duration_sec || null,
    rest_seconds: ex.rest_seconds || 60,
    instructions: ex.instructions || null,
    equipment: ex.equipment || null,
    exercise_verified: ex.exercise_verified === true,
    image_url: ex.image_url || null,
    gif_url: ex.gif_url || null,
    video_url: ex.video_url || null,
    wger_exercise_id: ex.wger_exercise_id || null,
    replaced_today: true,
    replaced_from: ex.replaced_from || null,
  }));
  return {
    duration_minutes: workout.duration_minutes,
    title: workout.title,
    focus: workout.focus || [],
    exercises,
  };
}

export { EXERCISE_SCHEMA };
