// GET /api/debug/latest-plan-status?email=...
// Interní debug helper – vrací stav flow pro daný e-mail (bez dalších PII).
// Vyžaduje ADMIN_TOKEN v Authorization header.
import { supabaseServer } from '../../../lib/supabaseServer';

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

    const planSummary = plan
      ? {
          id: plan.id,
          is_active: plan.is_active,
          html_length: plan.plan_html ? plan.plan_html.length : 0,
          created_at: plan.created_at,
        }
      : null;

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
          result_html_length: task.result?.html_length ?? null,
          result_selected_html_source: task.result?.selected_html_source ?? null,
          result_matched_sections: task.result?.matched_sections ?? null,
          result_missing_core_sections: task.result?.missing_core_sections ?? null,
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

    return res.status(200).json({
      auth_user_exists: !!authUser,
      user_id: userId,
      body_metrics: bodyMetricsSummary,
      trainer_task: taskSummary,
      ai_generated_plan: planSummary,
    });
  } catch (err) {
    console.error('[debug/latest-plan-status]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
