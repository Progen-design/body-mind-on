// POST /api/workout/replace-today — generate alternative for today's workout (preview only)
import { supabaseServer } from '../../../lib/supabaseServer';
import { recordProductEvent } from '../../../lib/recordProductEvent';
import {
  getWorkoutReplaceAuth,
  loadOwnedPlanDay,
  isTodayWorkoutCompleted,
} from '../../../lib/workoutReplaceAuth';
import {
  generateTodayWorkoutAlternative,
  countTodayRegenerations,
  canRegenerateToday,
} from '../../../lib/workoutTodayReplace';
import { validateReplacementPreview } from '../../../lib/workoutReplacementSchema';
import { validateMuscleSelection } from '../../../lib/workoutMuscleGroupRules';
import {
  normalizeTrainingSetupInput,
  legacyLocationField,
} from '../../../lib/workoutTrainingSetup';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await getWorkoutReplaceAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { user } = auth;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const planId = String(body.plan_id || '').trim();
    const planDayIndex = Number(body.plan_day_index);
    if (!planId || !Number.isFinite(planDayIndex)) {
      return res.status(400).json({ error: 'Chybí plan_id nebo plan_day_index.' });
    }

    const muscleValidation = validateMuscleSelection({
      selectedMuscleGroups: body.selected_muscle_groups,
      durationMinutes: [15, 30, 45, 60].includes(Number(body.duration_minutes))
        ? Number(body.duration_minutes)
        : 30,
    });
    if (!muscleValidation.valid) {
      return res.status(400).json({
        error: 'invalid_muscle_selection',
        error_code: muscleValidation.errorCode,
        message: muscleValidation.message,
      });
    }
    const normalizedMuscles = Array.isArray(body.selected_muscle_groups)
      ? [...new Set(body.selected_muscle_groups.map((g) => String(g || '').trim()).filter(Boolean))]
      : [];
    if (normalizedMuscles.includes('full_body')) {
      normalizedMuscles.splice(0, normalizedMuscles.length, 'full_body');
    }
    const workoutCategory = muscleValidation.category;

    const setup = normalizeTrainingSetupInput(body);
    if (!setup.ok) {
      return res.status(400).json({ error: setup.error || 'Neplatné nastavení tréninku.' });
    }
    const { training_location, equipment_level } = setup;
    const location = legacyLocationField(training_location);
    const durationMinutes = [15, 30, 45, 60].includes(Number(body.duration_minutes))
      ? Number(body.duration_minutes)
      : 30;
    const intensity = ['light', 'medium', 'hard'].includes(body.intensity) ? body.intensity : 'medium';

    const planCtx = await loadOwnedPlanDay(user.id, planId, planDayIndex);
    if (planCtx.error) return res.status(planCtx.status).json({ error: planCtx.error });
    if (!planCtx.hasWorkout) return res.status(400).json({ error: 'Dnes není naplánovaný trénink.' });

    const completed = await isTodayWorkoutCompleted(user.id, planId, planDayIndex);
    if (completed) return res.status(409).json({ error: 'Trénink je již dokončený.' });

    const regenCount = await countTodayRegenerations(supabaseServer, user.id, planId, planDayIndex);
    if (!canRegenerateToday(regenCount)) {
      return res.status(429).json({ error: 'Dnes už nelze vytvořit další variantu.' });
    }

    const { data: bmRows } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const bodyMetrics = bmRows?.[0] || { user_id: user.id };

    const originalWorkout = JSON.parse(JSON.stringify(planCtx.workout));
    const generationAttempt = regenCount + 1;

    const generated = await generateTodayWorkoutAlternative({
      muscleGroups: normalizedMuscles,
      category: workoutCategory,
      training_location,
      equipment_level,
      location,
      durationMinutes,
      intensity,
      bodyMetrics,
      generationAttempt,
    });

    const previewPayload = {
      ...generated.preview,
      replacement_id: null,
    };

    const { data: inserted, error: insErr } = await supabaseServer
      .from('workout_replacements')
      .insert({
        user_id: user.id,
        plan_id: planId,
        plan_day: String(planDayIndex),
        original_workout: originalWorkout,
        replacement_workout: generated.structuredWorkout,
        selected_muscle_groups: normalizedMuscles,
        location,
        training_location,
        equipment_level,
        duration_minutes: durationMinutes,
        intensity,
        status: 'generated',
        generation_attempt: generationAttempt,
        prompt_version: generated.promptVersion,
        expires_at: generated.preview.expires_at,
      })
      .select('id')
      .single();

    if (insErr || !inserted?.id) {
      return res.status(500).json({ error: 'Nepodařilo uložit náhled.' });
    }

    previewPayload.replacement_id = inserted.id;
    const validated = validateReplacementPreview(previewPayload);
    if (!validated.ok) {
      await supabaseServer.from('workout_replacements').update({ status: 'rejected' }).eq('id', inserted.id);
      return res.status(500).json({ error: 'Nevalidní náhled tréninku.' });
    }

    recordProductEvent({
      user_id: user.id,
      event_name: 'workout_alternative_generated',
      properties: {
        muscle_group_count: normalizedMuscles.length,
        training_location,
        equipment_level,
        location,
        duration_bucket: String(durationMinutes),
        intensity,
        generation_attempt: generationAttempt,
        success: true,
      },
      source: 'workout_replace_today',
    }).catch(() => {});

    return res.status(200).json({ ok: true, ...validated.value });
  } catch (err) {
    recordProductEvent({
      user_id: user.id,
      event_name: 'workout_change_failed',
      properties: {
        success: false,
        error_category: String(err?.message || 'unknown').slice(0, 40),
      },
      source: 'workout_replace_today',
    }).catch(() => {});
    if (String(err?.message) === 'GENERATION_FAILED') {
      return res.status(503).json({ error: 'Alternativu se nepodařilo vytvořit. Zkus to znovu nebo ponech původní trénink.' });
    }
    return res.status(500).json({ error: 'Alternativu se nepodařilo vytvořit. Zkus to znovu nebo ponech původní trénink.' });
  }
}
