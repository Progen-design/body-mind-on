/**
 * POST /api/plan-replace-workout-exercise
 * Nahradí jeden cvik ve structured plánu alternativou ze šablon + wger resolve.
 */
import { supabaseServer } from '../../lib/supabaseServer';
import { replaceWorkoutExerciseInStructuredPlan } from '../../lib/planWorkoutReplace.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Pouze POST' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ ok: false, error: 'Neplatná session' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const planId = body.plan_id;
    const daySlotIndex = body.day_slot_index != null ? Number(body.day_slot_index) : Number(body.day_index);
    const exerciseIndex = Number(body.exercise_index);
    if (!planId || !Number.isFinite(daySlotIndex) || !Number.isFinite(exerciseIndex)) {
      return res.status(400).json({ ok: false, error: 'Chybí plan_id, day_slot_index nebo exercise_index' });
    }

    const { data: planRow, error: planErr } = await supabaseServer
      .from('ai_generated_plans')
      .select('id, user_id, structured_plan_json, plan_html')
      .eq('id', planId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (planErr || !planRow) {
      return res.status(404).json({ ok: false, error: 'Plán nenalezen' });
    }

    const structured = planRow.structured_plan_json && typeof planRow.structured_plan_json === 'object'
      ? JSON.parse(JSON.stringify(planRow.structured_plan_json))
      : null;
    if (!structured?.days?.length) {
      return res.status(400).json({ ok: false, error: 'Plán nemá structured data' });
    }

    const { data: bmRows } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const bodyMetrics = bmRows?.[0] || { user_id: user.id };

    const result = await replaceWorkoutExerciseInStructuredPlan(
      structured,
      daySlotIndex,
      exerciseIndex,
      bodyMetrics
    );

    const { error: updateErr } = await supabaseServer
      .from('ai_generated_plans')
      .update({
        structured_plan_json: result.structuredPlan,
        plan_html: result.planHtml,
      })
      .eq('id', planId)
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('[plan-replace-workout-exercise] update error', updateErr);
      return res.status(500).json({ ok: false, error: 'Nepodařilo uložit plán' });
    }

    console.info('[plan-replace-workout-exercise] replaced', {
      plan_id: planId,
      day_slot_index: daySlotIndex,
      exercise_index: exerciseIndex,
      from: result.previous_title,
      to: result.new_title,
    });

    return res.status(200).json({
      ok: true,
      exercise: result.exercise,
      previous_title: result.previous_title,
      new_title: result.new_title,
      structured_plan_json: result.structuredPlan,
      plan_html: result.planHtml,
    });
  } catch (err) {
    const code = String(err?.message || '');
    if (code === 'NO_ALTERNATIVE') {
      return res.status(409).json({
        ok: false,
        error: 'Teď nemáme vhodný náhradní cvik pro tento den. Zkus jiný cvik nebo uprav prostředí tréninku v nastavení.',
      });
    }
    if (code === 'NOT_REPLACEABLE') {
      return res.status(400).json({
        ok: false,
        error: 'Tento úsek tréninku nelze nahradit (např. rozcvička nebo pauza).',
      });
    }
    console.error('[plan-replace-workout-exercise]', err);
    return res.status(500).json({ ok: false, error: 'Nepodařilo nahradit cvik' });
  }
}
