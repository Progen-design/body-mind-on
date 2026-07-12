/**
 * Self-heal: plan_html zabalený jako e-mail → čistý fragment ze structured_plan_json.
 * TODO(runbook): dlouhodobě přesunout do maintenance jobu / admin repair, ne GET /api/profile.
 */

import { isWrappedEmailDocument } from '../validatePlanHtml.js';
import { renderPlanHtmlFromStructured } from '../planRenderer.js';
import { sortMealsChronologically } from '../mealOrder.js';

/**
 * @param {Array<object>} plansData — mutuje položky in-place
 * @param {object|null} latestBodyMetricsForRender
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ applied: number, plan_ids: string[] }>}
 */
export async function repairWrappedPlanHtmlIfNeeded(plansData, latestBodyMetricsForRender, supabaseClient) {
  const appliedIds = [];
  if (!Array.isArray(plansData)) return { applied: 0, plan_ids: [] };

  for (const p of plansData) {
    const hasStructuredDays =
      p?.structured_plan_json && typeof p.structured_plan_json === 'object' &&
      Array.isArray(p.structured_plan_json.days) && p.structured_plan_json.days.length > 0;
    if (!hasStructuredDays || !isWrappedEmailDocument(p?.plan_html)) continue;

    const structuredSorted = {
      ...p.structured_plan_json,
      days: p.structured_plan_json.days.map((d) => ({
        ...d,
        meals: sortMealsChronologically(d?.meals ?? []),
      })),
    };
    const cleanHtml = renderPlanHtmlFromStructured(structuredSorted, latestBodyMetricsForRender ?? undefined);
    if (!cleanHtml || typeof cleanHtml !== 'string') continue;

    p.plan_html = cleanHtml;
    p.structured_plan_json = structuredSorted;

    const { error: healPlanHtmlErr } = await supabaseClient
      .from('ai_generated_plans')
      .update({ plan_html: cleanHtml, structured_plan_json: structuredSorted })
      .eq('id', p.id);

    if (healPlanHtmlErr) {
      console.warn('[profile] plan_html self-heal update failed', { plan_id: p.id, error: healPlanHtmlErr.message });
    } else {
      console.info('[profile] profile_self_heal_applied', {
        plan_id: p.id,
        reason: 'wrapped_email_document',
      });
      appliedIds.push(p.id);
    }
  }

  return { applied: appliedIds.length, plan_ids: appliedIds };
}
