/**
 * Process pending ai_tasks: call runAgent() for each, store result, mark completed or failed.
 * Called by cron or /api/ai/run-scheduler.
 * Future expansion: AI push notifications, automated weekly coaching, webhook delivery of results to marketing/social pipelines.
 */
import { supabaseServer } from './supabaseServer';
import { runAgent } from './runAgent';
import { generatePlanForEmail } from './generatePlan';
const MAX_TASKS_PER_RUN = 30;

/** Placeholder for future event processing (e.g. webhooks, notifications). Called in pipeline between generateAITasks and runAIScheduler. */
export async function processAIEvents() {
  return { processed: 0 };
}

export async function runAIScheduler() {
  const { data: tasks, error: fetchError } = await supabaseServer
    .from('ai_tasks')
    .select('id, user_id, agent_slug, task_type, payload')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_TASKS_PER_RUN);

  if (fetchError) {
    throw new Error(`Failed to load ai_tasks: ${fetchError.message}`);
  }

  if (!tasks?.length) {
    return { processed: 0, completed: 0, failed: 0, claimed: 0 };
  }

  let completed = 0;
  let failed = 0;
  let claimed = 0;

  for (const task of tasks) {
    // Claim task first so concurrent scheduler runs do not process the same item twice.
    // This is the deterministic autonomy path: pending -> processing -> completed|failed.
    const { data: claimRow, error: claimErr } = await supabaseServer
      .from('ai_tasks')
      .update({ status: 'processing' })
      .eq('id', task.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimErr || !claimRow?.id) {
      continue;
    }
    claimed++;

    try {
      if (task.agent_slug === 'trainer' && task.task_type === 'initial_plan' && task.user_id) {
        const { data: bm } = await supabaseServer
          .from('body_metrics')
          .select('*')
          .eq('user_id', task.user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bm?.email) {
          const planResult = await generatePlanForEmail(bm.email, { skipEmail: true, bmOverride: bm });
          await supabaseServer
            .from('ai_tasks')
            .update({
              status: planResult.ok ? 'completed' : 'failed',
              result: planResult.ok ? { ok: true, message: planResult.message } : { error: planResult.message },
              processed_at: new Date().toISOString(),
            })
            .eq('id', task.id);
          if (planResult.ok) completed++;
          else failed++;
        } else {
          await supabaseServer
            .from('ai_tasks')
            .update({
              status: 'failed',
              result: { error: 'No body_metrics for user' },
              processed_at: new Date().toISOString(),
            })
            .eq('id', task.id);
          failed++;
        }
      } else {
        const result = await runAgent(task.agent_slug, {
          userId: task.user_id ?? null,
          input: task.payload ?? {},
        });

        await supabaseServer
          .from('ai_tasks')
          .update({
            status: 'completed',
            result: {
              rawContent: result.rawContent,
              agent_slug: result.agentSlug,
              model: result.model,
            },
            processed_at: new Date().toISOString(),
          })
          .eq('id', task.id);

        completed++;
      }
    } catch (err) {
      await supabaseServer
        .from('ai_tasks')
        .update({
          status: 'failed',
          result: { error: err?.message || String(err) },
          processed_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      failed++;
    }
  }

  return { processed: tasks.length, claimed, completed, failed };
}
