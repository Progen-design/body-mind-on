// POST /api/workout/confirm-replacement — apply generated replacement to today's plan day
import { supabaseServer } from '../../../lib/supabaseServer';
import { recordProductEvent } from '../../../lib/recordProductEvent';
import {
  getWorkoutReplaceAuth,
  loadOwnedPlanDay,
  isTodayWorkoutCompleted,
} from '../../../lib/workoutReplaceAuth';
import { renderPlanHtmlFromStructured } from '../../../lib/planRenderer';
import { stripPlanMediaAttrsFromHtml } from '../../../lib/emailTemplates.js';
import { normalizePublishableWorkoutExercisesInPlan } from '../../../lib/planDataIntegrity';
import { validateWorkoutExerciseIntegrity, normalizeExerciseDisplayFromCanonical } from '../../../lib/exerciseIntegrity';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await getWorkoutReplaceAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { user } = auth;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const replacementId = String(body.replacement_id || '').trim();
    const planId = String(body.plan_id || '').trim();
    const planDayIndex = Number(body.plan_day_index);
    if (!replacementId || !planId || !Number.isFinite(planDayIndex)) {
      return res.status(400).json({ error: 'Chybí replacement_id, plan_id nebo plan_day_index.' });
    }

    const { data: repl, error: replErr } = await supabaseServer
      .from('workout_replacements')
      .select('*')
      .eq('id', replacementId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (replErr || !repl) return res.status(404).json({ error: 'Náhled nenalezen.' });
    if (repl.plan_id !== planId || repl.plan_day !== String(planDayIndex)) {
      return res.status(403).json({ error: 'Náhled nepatří k tomuto plánu.' });
    }
    if (repl.status !== 'generated') return res.status(409).json({ error: 'Náhled již není platný.' });
    if (repl.expires_at && new Date(repl.expires_at) < new Date()) {
      await supabaseServer.from('workout_replacements').update({ status: 'expired' }).eq('id', replacementId);
      return res.status(410).json({ error: 'Náhled vypršel. Vytvoř novou variantu.' });
    }

    const completed = await isTodayWorkoutCompleted(user.id, planId, planDayIndex);
    if (completed) return res.status(409).json({ error: 'Trénink je již dokončený.' });

    const planCtx = await loadOwnedPlanDay(user.id, planId, planDayIndex);
    if (planCtx.error) return res.status(planCtx.status).json({ error: planCtx.error });

    const structured = planCtx.structured;
    const replacement = repl.replacement_workout;
    if (!replacement?.exercises?.length) return res.status(400).json({ error: 'Neplatná náhrada.' });

    const normalizedExercises = replacement.exercises.map((ex) => normalizeExerciseDisplayFromCanonical(ex));
    const integrity = validateWorkoutExerciseIntegrity(normalizedExercises);
    if (!integrity.valid) {
      return res.status(400).json({ error: 'Neplatná kombinace cviků v náhradě.' });
    }

    structured.days[planCtx.dayIdx].workout = {
      ...structured.days[planCtx.dayIdx].workout,
      ...replacement,
      exercises: normalizedExercises,
      replaced_today_id: replacementId,
      original_workout_backup: repl.original_workout,
    };

    normalizePublishableWorkoutExercisesInPlan(structured);

    const { data: bmRows } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const bodyMetrics = bmRows?.[0] || null;
    const planHtml = stripPlanMediaAttrsFromHtml(renderPlanHtmlFromStructured(structured, bodyMetrics));

    const { error: updErr } = await supabaseServer
      .from('ai_generated_plans')
      .update({ structured_plan_json: structured, plan_html: planHtml })
      .eq('id', planId)
      .eq('user_id', user.id);

    if (updErr) return res.status(500).json({ error: 'Nepodařilo uložit plán.' });

    await supabaseServer
      .from('workout_replacements')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', replacementId);

    recordProductEvent({
      user_id: user.id,
      event_name: 'workout_alternative_confirmed',
      properties: {
        muscle_group_count: (repl.selected_muscle_groups || []).length,
        location: repl.location,
        duration_bucket: String(repl.duration_minutes || ''),
        intensity: repl.intensity,
        generation_attempt: repl.generation_attempt,
        success: true,
      },
      source: 'workout_confirm_replacement',
    }).catch(() => {});

    return res.status(200).json({
      ok: true,
      workout: structured.days[planCtx.dayIdx].workout,
      structured_plan_json: structured,
      plan_html: planHtml,
    });
  } catch {
    return res.status(500).json({ error: 'Nepodařilo potvrdit náhradu.' });
  }
}
