/**
 * Jednorázový / admin přepočet plan_html z uloženého structured_plan_json (bez Spoonacular).
 * Sjednotí data-recipe-id, odkazy „Recept“, makra a součty s JSONem po opravách v resolve/rendereru.
 */
import { supabaseServer } from './supabaseServer';
import { renderPlanHtmlFromStructured } from './planRenderer';
import { stripPlanMediaAttrsFromHtml } from './emailTemplates';

/**
 * @param {{ dryRun?: boolean, onlyActive?: boolean, skipUnchanged?: boolean }} [opts]
 * @returns {Promise<{ examined: number, updated: number, skipped: number, unchanged: number, errors: number, dryRun: boolean, onlyActive: boolean }>}
 */
export async function backfillPlanHtmlFromStructuredJson(opts = {}) {
  const dryRun = opts.dryRun === true;
  const onlyActive = opts.onlyActive !== false;
  const skipUnchanged = opts.skipUnchanged !== false;

  let q = supabaseServer
    .from('ai_generated_plans')
    .select('id, user_id, structured_plan_json, plan_html, user_context')
    .not('structured_plan_json', 'is', null);
  if (onlyActive) q = q.eq('is_active', true);

  const { data: plans, error } = await q;
  if (error) throw new Error(error.message);

  let examined = 0;
  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  let errors = 0;

  for (const row of plans || []) {
    examined++;
    const json = row?.structured_plan_json;
    if (!json || typeof json !== 'object') {
      skipped++;
      continue;
    }
    const days = json.days;
    if (!Array.isArray(days) || days.length === 0) {
      skipped++;
      continue;
    }

    let rendered;
    try {
      rendered = renderPlanHtmlFromStructured(json, row.user_context || null);
    } catch (e) {
      console.warn('[backfillPlanHtmlFromStructuredJson] render skip id=', row.id, e?.message || e);
      skipped++;
      continue;
    }

    const clean = stripPlanMediaAttrsFromHtml(String(rendered || '').trim());
    if (!clean) {
      skipped++;
      continue;
    }

    const prev = typeof row.plan_html === 'string' ? row.plan_html.trim() : '';
    if (skipUnchanged && prev === clean) {
      unchanged++;
      continue;
    }

    if (dryRun) {
      updated++;
      continue;
    }

    const { error: uErr } = await supabaseServer.from('ai_generated_plans').update({ plan_html: clean }).eq('id', row.id);
    if (uErr) {
      console.error('[backfillPlanHtmlFromStructuredJson] update failed id=', row.id, uErr.message);
      errors++;
    } else {
      updated++;
    }
  }

  return { examined, updated, skipped, unchanged, errors, dryRun, onlyActive };
}
