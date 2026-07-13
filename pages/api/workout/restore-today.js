// POST /api/workout/restore-today — restore original workout for today
import { supabaseServer } from '../../../lib/supabaseServer';
import { recordProductEvent } from '../../../lib/recordProductEvent';
import {
  getWorkoutReplaceAuth,
  loadOwnedPlanDay,
  isTodayWorkoutCompleted,
} from '../../../lib/workoutReplaceAuth';
import { renderPlanHtmlFromStructured } from '../../../lib/planRenderer';
import { stripPlanMediaAttrsFromHtml } from '../../../lib/emailTemplates.js';

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

    const completed = await isTodayWorkoutCompleted(user.id, planId, planDayIndex);
    if (completed) return res.status(409).json({ error: 'Trénink je již dokončený.' });

    const planCtx = await loadOwnedPlanDay(user.id, planId, planDayIndex);
    if (planCtx.error) return res.status(planCtx.status).json({ error: planCtx.error });

    const dayWorkout = planCtx.day?.workout;
    const backup = dayWorkout?.original_workout_backup;
    if (!backup) return res.status(400).json({ error: 'Původní trénink není k dispozici.' });

    const structured = planCtx.structured;
    structured.days[planCtx.dayIdx].workout = JSON.parse(JSON.stringify(backup));

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

    if (updErr) return res.status(500).json({ error: 'Nepodařilo obnovit trénink.' });

    const replId = dayWorkout?.replaced_today_id;
    if (replId) {
      await supabaseServer
        .from('workout_replacements')
        .update({ status: 'restored', restored_at: new Date().toISOString() })
        .eq('id', replId)
        .eq('user_id', user.id);
    }

    recordProductEvent({
      user_id: user.id,
      event_name: 'workout_original_restored',
      properties: { success: true },
      source: 'workout_restore_today',
    }).catch(() => {});

    return res.status(200).json({
      ok: true,
      workout: structured.days[planCtx.dayIdx].workout,
      structured_plan_json: structured,
      plan_html: planHtml,
    });
  } catch {
    return res.status(500).json({ error: 'Nepodařilo obnovit trénink.' });
  }
}
