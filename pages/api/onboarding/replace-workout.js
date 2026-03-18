/**
 * POST /api/onboarding/replace-workout
 * Nahradí trénink daného dne novými cviky z wger.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md § Replace Workout Flow
 */
import { resolveExercise } from '../../../lib/services/exerciseProviderRegistry';

function errorResponse(res, status, error, code, requestId) {
  return res.status(status).json({
    ok: false,
    error,
    code: code || 'INTERNAL_ERROR',
    _request_id: requestId,
  });
}

const WORKOUT_BLOCKS = [
  [
    { search_term: 'squat', sets: 3, reps: '10-12' },
    { search_term: 'push up', sets: 3, reps: '8-10' },
    { search_term: 'bent over row', sets: 3, reps: '10' },
    { search_term: 'plank', sets: 3, duration_sec: 45 },
    { search_term: 'lunge', sets: 3, reps: '10 per leg' },
  ],
  [
    { search_term: 'squat', sets: 4, reps: '10' },
    { search_term: 'lunge', sets: 3, reps: '10 per leg' },
    { search_term: 'hip bridge', sets: 3, reps: '12' },
    { search_term: 'plank', sets: 3, duration_sec: 30 },
    { search_term: 'crunch', sets: 3, reps: '15' },
  ],
  [
    { search_term: 'push up', sets: 4, reps: '8-10' },
    { search_term: 'bent over row', sets: 3, reps: '10' },
    { search_term: 'shoulder press', sets: 3, reps: '10' },
    { search_term: 'plank', sets: 3, duration_sec: 30 },
    { search_term: 'bicycle crunch', sets: 3, reps: '12 per side' },
  ],
];

export default async function handler(req, res) {
  const requestId = `req_${Date.now()}`;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Pouze POST', 'METHOD_NOT_ALLOWED', requestId);
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { plan_id, date, hint_focus } = body;

    if (!date) {
      return errorResponse(res, 400, 'date je povinné', 'VALIDATION_ERROR', requestId);
    }

    const focusIndex = hint_focus === 'upper' ? 2 : hint_focus === 'lower' ? 1 : 0;
    const block = WORKOUT_BLOCKS[focusIndex % WORKOUT_BLOCKS.length];

    const exercises = [];
    for (const ex of block) {
      const resolved = await resolveExercise(ex.search_term);
      const verified = resolved?.source === 'wger' && (resolved?.name ?? false);
      exercises.push({
        name: verified ? (resolved?.name || 'Cvik (neověřeno)') : 'Cvik (neověřeno)',
        exercise_verified: verified,
        sets: ex.sets ?? 3,
        reps: ex.reps ?? null,
        duration_sec: ex.duration_sec ?? null,
        image_url: resolved?.image_url ?? null,
        video_url: resolved?.video_url ?? null,
        source: resolved?.source ?? 'none',
        wger_exercise_id: resolved?.wger_exercise_id ?? null,
      });
    }

    return res.status(200).json({
      ok: true,
      workout: {
        duration_minutes: body.workout_duration_min ?? 45,
        exercises,
      },
      _request_id: requestId,
    });
  } catch (err) {
    console.error('[onboarding/replace-workout]', err?.message || err);
    return errorResponse(res, 500, 'Nepodařilo se nahradit trénink', 'INTERNAL_ERROR', requestId);
  }
}
