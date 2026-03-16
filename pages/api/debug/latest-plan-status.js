// GET /api/debug/latest-plan-status?email=...
// Interní debug helper – vrací stav flow pro daný e-mail (bez dalších PII).
// Vyžaduje ADMIN_TOKEN v Authorization header.
import { supabaseServer } from '../../../lib/supabaseServer';
import { validatePublishedPlanHtml } from '../../../lib/validatePlanHtml';

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Neoprávněný přístup' });
  }

  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Chybí parametr email' });
  }

  try {
    const { data: { users }, error: listErr } = await supabaseServer.auth.admin.listUsers({ perPage: 1000 });
    const authUser = listErr ? null : (users || []).find((u) => (u.email || '').toLowerCase() === email);
    const userId = authUser?.id ?? null;

    const bodyMetricsLatest = userId
      ? await supabaseServer.from('body_metrics').select('id, user_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : await supabaseServer.from('body_metrics').select('id, user_id, created_at').eq('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle();

    const trainerTaskLatest = userId
      ? await supabaseServer
          .from('ai_tasks')
          .select('id, status, last_error, result, created_at, processed_at')
          .eq('user_id', userId)
          .eq('agent_slug', 'trainer')
          .eq('task_type', 'initial_plan')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const planLatest = userId
      ? await supabaseServer
          .from('ai_generated_plans')
          .select('id, is_active, plan_html, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const bm = bodyMetricsLatest.data;
    const task = trainerTaskLatest.data;
    const plan = planLatest.data;

    const html = plan?.plan_html || '';
    const mealKeysInHtml = html ? (html.match(/data-meal-key\s*=\s*["'][^"']*["']/gi) || []).length : 0;
    const exerciseKeysInHtml = html ? (html.match(/data-exercise-key\s*=\s*["'][^"']*["']/gi) || []).length : 0;
    const planValidation = html ? validatePublishedPlanHtml(html) : { ok: false };
    const planSummary = plan
      ? {
          id: plan.id,
          is_active: plan.is_active,
          html_length: html.length,
          meal_keys_in_html: mealKeysInHtml,
          exercise_keys_in_html: exerciseKeysInHtml,
          parse_success: planValidation.ok,
          rendering_mode: planValidation.ok ? 'parsed' : 'raw_fallback',
          created_at: plan.created_at,
        }
      : null;

    const taskExists = !!task;
    const taskSummary = task
      ? {
          id: task.id,
          status: task.status,
          last_error: task.last_error || null,
          result_summary: task.result?.summary ?? null,
          result_reason: task.result?.reason ?? null,
          result_skip_reason: task.result?.skip_reason ?? null,
          result_validation_warning: task.result?.validation_warning ?? null,
          result_email_sent: task.result?.email_sent ?? null,
          result_plan_id: task.result?.plan_id ?? null,
          result_html_length: task.result?.html_length ?? null,
          result_selected_html_source: task.result?.selected_html_source ?? null,
          result_matched_sections: task.result?.matched_sections ?? null,
          result_missing_core_sections: task.result?.missing_core_sections ?? null,
          result_validator_replacement_applied: task.result?.validatorReplacementApplied ?? null,
          result_validator_replacement_reason: task.result?.validatorReplacementReason ?? null,
          result_generation_source: task.result?.generation_source ?? null,
          result_fallback_used: task.result?.fallback_used ?? null,
          result_final_publish_source: task.result?.final_publish_source ?? null,
          result_structure: task.result?.structure ?? null,
          result_raw_ai_html_length: task.result?.raw_ai_html_length ?? null,
          result_final_html_length: task.result?.final_html_length ?? null,
          result_ai_output_was_used: task.result?.ai_output_was_used ?? null,
          result_retry_output_was_used: task.result?.retry_output_was_used ?? null,
          result_fallback_output_was_used: task.result?.fallback_output_was_used ?? null,
          result_weak_quality_flags: task.result?.weak_quality_flags ?? null,
          result_media_exact_count: task.result?.media_exact_count ?? null,
          result_media_none_count: task.result?.media_none_count ?? null,
          result_truth_check_passed: task.result?.truth_check?.truth_check_passed ?? null,
          result_soft_gate_passed: task.result?.truth_check?.soft_gate_passed ?? null,
          result_truth_retry_triggered: task.result?.truth_retry_triggered ?? null,
          result_truth_retry_reason: task.result?.truth_retry_reason ?? null,
          result_prompt_source: task.result?.prompt_source ?? null,
          result_prompt_version: task.result?.prompt_version ?? null,
          result_supporting_documents_count: task.result?.supporting_documents_count ?? null,
          result_document_titles: task.result?.document_titles ?? null,
          result_source_ids: task.result?.source_ids ?? null,
          result_keys: task.result && typeof task.result === 'object' ? Object.keys(task.result) : [],
          created_at: task.created_at,
          processed_at: task.processed_at,
        }
      : null;

    const bodyMetricsSummary = bm
      ? {
          id: bm.id,
          user_id: bm.user_id,
          created_at: bm.created_at,
        }
      : null;

    const trainerLogLatest = userId
      ? await supabaseServer
          .from('ai_logs')
          .select('id, status, payload, created_at')
          .eq('user_id', userId)
          .eq('agent_slug', 'trainer')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    const logRow = trainerLogLatest.data;
    const agentDiagnostic = logRow?.payload
      ? {
          prompt_version: logRow.payload.prompt_version ?? null,
          prompt_source: logRow.payload.prompt_source ?? null,
          supporting_documents_count: logRow.payload.supporting_documents_count ?? null,
          document_titles: logRow.payload.document_titles ?? null,
          source_ids: logRow.payload.source_ids ?? null,
          log_created_at: logRow.created_at,
        }
      : null;

    const hasValidPlan = planValidation.ok;
    const saved_plan_exists = !!(plan?.plan_html && plan.plan_html.length > 0);
    let debug_plan_state = 'missing';
    let debug_plan_state_reason = 'no_task_no_plan';
    if (hasValidPlan) {
      debug_plan_state = 'ready';
      debug_plan_state_reason = 'valid_plan_exists';
    } else if (task) {
      if (task.status === 'pending' || task.status === 'processing') {
        debug_plan_state = 'processing';
        debug_plan_state_reason = 'task_pending_or_processing';
      } else if (task.status === 'failed' || task.status === 'dlq') {
        debug_plan_state = 'failed';
        debug_plan_state_reason = 'task_failed_or_dlq';
      } else if (task.status === 'completed') {
        debug_plan_state = 'invalid';
        debug_plan_state_reason = 'task_completed_but_no_valid_plan';
      } else {
        debug_plan_state = 'invalid';
        debug_plan_state_reason = 'task_exists_unknown_status';
      }
    } else if (saved_plan_exists) {
      debug_plan_state = 'invalid';
      debug_plan_state_reason = 'plan_exists_but_invalid';
    }

    return res.status(200).json({
      auth_user_exists: !!authUser,
      user_id: userId,
      body_metrics: bodyMetricsSummary,
      trainer_task: taskSummary,
      initialPlanTaskExists: taskExists,
      ai_generated_plan: planSummary,
      saved_plan_exists,
      saved_plan_id: plan?.id ?? null,
      saved_plan_is_active: !!plan?.is_active,
      rendered_plan_exists: hasValidPlan,
      debug_plan_state,
      debug_plan_state_reason,
      agent_diagnostic: agentDiagnostic,
    });
  } catch (err) {
    console.error('[debug/latest-plan-status]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
