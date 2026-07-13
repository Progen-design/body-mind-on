// POST /api/workout/restore-today — restore original workout for today (fast path, no HTML render)
import { recordProductEvent } from '../../../lib/recordProductEvent';
import { getWorkoutReplaceAuth } from '../../../lib/workoutReplaceAuth';
import { restoreTodayWorkout } from '../../../lib/workoutRestoreToday';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authStart = Date.now();
  const auth = await getWorkoutReplaceAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { user } = auth;
  const authMs = Date.now() - authStart;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const planId = String(body.plan_id || '').trim();
    const planDayIndex = Number(body.plan_day_index);
    if (!planId || !Number.isFinite(planDayIndex)) {
      return res.status(400).json({ error: 'Chybí plan_id nebo plan_day_index.' });
    }

    const result = await restoreTodayWorkout({ userId: user.id, planId, planDayIndex });

    const timings = {
      auth_ms: authMs,
      db_read_ms: result.timings?.db_read_ms ?? 0,
      db_update_ms: result.timings?.db_update_ms ?? 0,
      total_ms: (result.timings?.total_ms ?? 0) + authMs,
    };

    if (!result.ok) {
      recordProductEvent({
        user_id: user.id,
        event_name: 'workout_change_failed',
        properties: {
          success: false,
          error_category: result.error_category || 'restore_failed',
          ...timings,
        },
        source: 'workout_restore_today',
      }).catch(() => {});

      return res.status(result.status).json({ error: result.error, timings });
    }

    recordProductEvent({
      user_id: user.id,
      event_name: 'workout_original_restored',
      properties: {
        success: true,
        ...timings,
      },
      source: 'workout_restore_today',
    }).catch(() => {});

    return res.status(200).json({
      ok: true,
      idempotent: !!result.idempotent,
      workout: result.workout,
      structured_plan_json: result.structured_plan_json,
      timings,
    });
  } catch {
    recordProductEvent({
      user_id: user.id,
      event_name: 'workout_change_failed',
      properties: { success: false, error_category: 'unexpected', auth_ms: authMs },
      source: 'workout_restore_today',
    }).catch(() => {});

    return res.status(500).json({ error: 'Nepodařilo obnovit trénink.' });
  }
}
