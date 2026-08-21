/**
 * POST /api/plan-replace-meal
 * Nahradí jídlo ve structured plánu alternativou ze START knihovny a uloží do DB.
 */
import { supabaseServer } from '../../lib/supabaseServer';
import { replaceMealInStructuredPlan } from '../../lib/planMealReplace.js';
import { recordProductEvent } from '../../lib/recordProductEvent';

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
    const mealIndex = Number(body.meal_index);
    if (!planId || !Number.isFinite(daySlotIndex) || !Number.isFinite(mealIndex)) {
      return res.status(400).json({ ok: false, error: 'Chybí plan_id, day_slot_index nebo meal_index' });
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

    const result = await replaceMealInStructuredPlan(structured, daySlotIndex, mealIndex, bodyMetrics);

    const { error: updateErr } = await supabaseServer
      .from('ai_generated_plans')
      .update({
        structured_plan_json: result.structuredPlan,
        plan_html: result.planHtml,
      })
      .eq('id', planId)
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('[plan-replace-meal] update error', updateErr);
      return res.status(500).json({ ok: false, error: 'Nepodařilo uložit plán' });
    }

    console.info('[plan-replace-meal] replaced', {
      plan_id: planId,
      day_slot_index: daySlotIndex,
      day_index: daySlotIndex,
      meal_index: mealIndex,
      from: result.previous_title,
      to: result.new_title,
      day_kcal: result.day_kcal,
    });

    await recordProductEvent({
      user_id: user.id,
      event_name: 'meal_replaced',
      properties: {
        day_number: daySlotIndex + 1,
        source_component: 'plan_replace_meal',
        success: true,
      },
      source: 'plan_replace_meal',
    });

    return res.status(200).json({
      ok: true,
      meal: result.meal,
      previous_title: result.previous_title,
      new_title: result.new_title,
      day_kcal: result.day_kcal,
      structured_plan_json: result.structuredPlan,
      plan_html: result.planHtml,
    });
  } catch (err) {
    const code = String(err?.message || '');
    if (code === 'NO_ALTERNATIVE') {
      return res.status(409).json({
        ok: false,
        error: 'Teď nemáme vhodnou náhradu, která by držela tvoje kalorie a omezení. Zkus jiné jídlo nebo uprav omezení v profilu.',
      });
    }
    if (code === 'DAY_KCAL_OUT_OF_TOLERANCE') {
      return res.status(409).json({ ok: false, error: 'Náhrada by rozbila denní kalorie — zkus jiné jídlo.' });
    }
    console.error('[plan-replace-meal]', err);
    return res.status(500).json({ ok: false, error: 'Nepodařilo nahradit jídlo' });
  }
}
