/**
 * POST /api/onboarding/replace-workout
 * Nahradí trénink daného dne novými cviky z wger.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md § Replace Workout Flow
 */
import { resolveExercise } from '../../../lib/services/exerciseProviderRegistry';
import { rotatedTemplatesForBodyMetrics } from '../../../lib/workoutPlanScaler';
import { filterWorkoutPlanForTrainingEnvironment } from '../../../lib/trainingEnvironment.js';

function errorResponse(res, status, error, code, requestId) {
  return res.status(status).json({
    ok: false,
    error,
    code: code || 'INTERNAL_ERROR',
    _request_id: requestId,
  });
}

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
    const bodyMetrics = {
      training_environment: body.training_environment,
      available_equipment: body.available_equipment,
      notes: body.notes,
      user_id: body.user_id,
    };
    const templates = rotatedTemplatesForBodyMetrics(bodyMetrics);
    const block = templates[focusIndex % templates.length] || templates[0];

    const planStub = {
      days: [{
        day_index: 1,
        exercises: block.map((ex) => ({
          canonical_key: ex.canonical_key,
          search_term: ex.search_term ?? ex.canonical_key,
          name_cs: ex.name_cs,
          sets: ex.sets ?? 3,
          reps: ex.reps ?? null,
          duration_sec: ex.duration_sec ?? null,
        })),
      }],
    };
    filterWorkoutPlanForTrainingEnvironment(planStub, bodyMetrics);
    const filteredBlock = planStub.days[0].exercises;

    const exercises = [];
    for (const ex of filteredBlock) {
      const resolved = await resolveExercise(ex.search_term || ex.canonical_key);
      const verified = resolved?.source === 'wger' && (resolved?.name ?? false);
      const display_name_cs = verified ? (resolved?.display_name_cs ?? 'Cvik') : 'Cvik (neověřeno)';
      exercises.push({
        name: display_name_cs,
        display_name_cs,
        canonical_key: (ex.canonical_key || resolved?.canonical_key) ?? null,
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
