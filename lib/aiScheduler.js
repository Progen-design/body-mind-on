/**
 * Process pending ai_tasks: call runAgent() for each, store result, mark completed or failed.
 * Called by cron or /api/ai/run-scheduler.
 * Future expansion: AI push notifications, automated weekly coaching, webhook delivery of results to marketing/social pipelines.
 */
import { supabaseServer } from './supabaseServer';
import { processPendingAIEvents } from './aiEvents';
import { getMaxTaskAttempts, getRetryBackoffMinutes, writeAILog } from './aiOps';
import { executeAITask } from './taskExecutors';
const MAX_TASKS_PER_RUN = 30;
const MAX_TASK_ATTEMPTS = getMaxTaskAttempts();

/** Event-driven autonomy bridge: ai_events -> decisions -> ai_tasks. */
export async function processAIEvents() {
  return processPendingAIEvents();
}

/** Reset tasks stuck in processing beyond threshold (stale recovery). */
async function recoverStaleProcessingTasks() {
  const staleMinutes = Number(process.env.AI_TASK_PROCESSING_STALE_MINUTES || 15);
  const threshold = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  try {
    const { data: stale } = await supabaseServer
      .from('ai_tasks')
      .select('id')
      .eq('status', 'processing')
      .not('processing_started_at', 'is', null)
      .lt('processing_started_at', threshold);
    if (!stale?.length) return;
    await supabaseServer
      .from('ai_tasks')
      .update({ status: 'pending', processing_started_at: null })
      .in('id', stale.map((t) => t.id));
  } catch (_) {
    // Column processing_started_at may not exist
  }
}

export async function runAIScheduler() {
  const nowIso = new Date().toISOString();
  await recoverStaleProcessingTasks();

  let tasks = null;
  let fetchError = null;
  const dueFilter = `next_retry_at.is.null,next_retry_at.lte.${nowIso}`;
  const primaryFetch = await supabaseServer
    .from('ai_tasks')
    .select('id, user_id, agent_slug, task_type, payload, attempts')
    .eq('status', 'pending')
    .or(dueFilter)
    .order('created_at', { ascending: true })
    .limit(MAX_TASKS_PER_RUN);
  tasks = primaryFetch.data;
  fetchError = primaryFetch.error;

  if (fetchError && /next_retry_at|attempts|does not exist|neexistuje/i.test(fetchError.message || '')) {
    const fallbackFetch = await supabaseServer
      .from('ai_tasks')
      .select('id, user_id, agent_slug, task_type, payload')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_TASKS_PER_RUN);
    tasks = fallbackFetch.data;
    fetchError = fallbackFetch.error;
  }

  if (fetchError) {
    throw new Error(`Failed to load ai_tasks: ${fetchError.message}`);
  }

  if (!tasks?.length) {
    return { processed: 0, completed: 0, failed: 0, claimed: 0, retried: 0, dlq: 0, deferred_budget: 0 };
  }

  let completed = 0;
  let failed = 0;
  let claimed = 0;
  let retried = 0;
  let dlq = 0;
  let deferred_budget = 0;

  for (const task of tasks) {
    // Claim task: set status to processing and processing_started_at (for stale recovery).
    let claimRow = null;
    let claimErr = null;
    let res = await supabaseServer
      .from('ai_tasks')
      .update({ status: 'processing', processing_started_at: nowIso })
      .eq('id', task.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    claimRow = res.data;
    claimErr = res.error;
    if (claimErr && /processing_started_at|does not exist|neexistuje/i.test(claimErr.message || '')) {
      res = await supabaseServer
        .from('ai_tasks')
        .update({ status: 'processing' })
        .eq('id', task.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      claimRow = res.data;
      claimErr = res.error;
    }

    if (claimErr || !claimRow?.id) {
      continue;
    }
    claimed++;

    try {
      const execution = await executeAITask(task);

      // Runtime contract: trainer/initial_plan must never be marked completed without persisted plan_id
      const isTrainerInitialPlan = task.agent_slug === 'trainer' && task.task_type === 'initial_plan';
      const result = execution?.result ?? {};
      const hasPlanId = result.outcome_type === 'plan_generated' && (result.plan_id != null && result.plan_id !== '');
      const mustFailCompleted = execution?.ok && isTrainerInitialPlan && !hasPlanId;

      const finalStatus = mustFailCompleted ? 'failed' : (execution?.ok ? 'completed' : 'failed');
      const finalResult = mustFailCompleted
        ? { ...result, error: 'Completed without persisted plan_id – marked failed by scheduler guard', outcome_type: 'plan_generation_failed' }
        : (execution?.result ?? { error: 'Task executor returned no result' });

      await supabaseServer
        .from('ai_tasks')
        .update({
          status: finalStatus,
          result: finalResult,
          processed_at: new Date().toISOString(),
          attempts: 0,
          next_retry_at: null,
          last_error: mustFailCompleted ? 'Completed without plan_id' : null,
        })
        .eq('id', task.id);

      await writeAILog({
        agent_slug: task.agent_slug,
        user_id: task.user_id,
        task_id: task.id,
        status: finalStatus,
        cache_hit: false,
        duration_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        message: finalResult?.summary ?? finalResult?.side_effect ?? task.task_type,
      });

      if (finalStatus === 'completed') completed++;
      else failed++;
    } catch (err) {
      const errMsg = err?.message || String(err);
      const isBudgetReached = err?.code === 'AI_BUDGET_REACHED' || /daily budget reached/i.test(errMsg);
      if (isBudgetReached) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 5, 0, 0);
        const deferPayload = {
          status: 'pending',
          next_retry_at: tomorrow.toISOString(),
          result: { error: errMsg, deferred_for_budget: true },
          last_error: errMsg,
          processed_at: null,
        };
        const deferUpdate = await supabaseServer.from('ai_tasks').update(deferPayload).eq('id', task.id);
        if (deferUpdate.error && /next_retry_at|last_error|does not exist|neexistuje|invalid input value for enum/i.test(deferUpdate.error.message || '')) {
          await supabaseServer
            .from('ai_tasks')
            .update({
              status: 'pending',
              result: { error: errMsg, deferred_for_budget: true },
              processed_at: null,
            })
            .eq('id', task.id);
        }
        deferred_budget++;
        await writeAILog({
          agent_slug: task.agent_slug,
          user_id: task.user_id,
          task_id: task.id,
          status: 'deferred',
          cache_hit: false,
          duration_ms: 0,
          input_tokens: 0,
          output_tokens: 0,
          estimated_cost_usd: 0,
          message: `Deferred due to budget until ${tomorrow.toISOString()}`,
        });
        continue;
      }

      const currentAttempts = Number(task?.attempts || 0);
      const nextAttempts = currentAttempts + 1;
      const isDeadLetter = nextAttempts >= MAX_TASK_ATTEMPTS;
      const backoffMinutes = getRetryBackoffMinutes(nextAttempts);
      const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

      const retryPayload = isDeadLetter
        ? {
            status: 'dlq',
            attempts: nextAttempts,
            result: { error: errMsg, dlq: true },
            last_error: errMsg,
            next_retry_at: null,
            dead_lettered_at: new Date().toISOString(),
            processed_at: new Date().toISOString(),
          }
        : {
            status: 'pending',
            attempts: nextAttempts,
            result: { error: errMsg, retry_scheduled_for: retryAt },
            last_error: errMsg,
            next_retry_at: retryAt,
            processed_at: null,
          };

      const retryUpdate = await supabaseServer.from('ai_tasks').update(retryPayload).eq('id', task.id);
      if (
        retryUpdate.error &&
        /attempts|next_retry_at|dead_lettered_at|last_error|does not exist|neexistuje|invalid input value for enum/i.test(
          retryUpdate.error.message || ''
        )
      ) {
        await supabaseServer
          .from('ai_tasks')
          .update({
            status: 'failed',
            result: { error: errMsg },
            processed_at: new Date().toISOString(),
          })
          .eq('id', task.id);
      }

      await writeAILog({
        agent_slug: task.agent_slug,
        user_id: task.user_id,
        task_id: task.id,
        status: isDeadLetter ? 'dlq' : 'retry',
        cache_hit: false,
        duration_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        message: isDeadLetter
          ? `Moved to DLQ after ${nextAttempts} attempts: ${errMsg}`
          : `Retry ${nextAttempts}/${MAX_TASK_ATTEMPTS} at ${retryAt}: ${errMsg}`,
      });

      if (isDeadLetter) dlq++;
      else retried++;
      failed++;
    }
  }

  return { processed: tasks.length, claimed, completed, failed, retried, dlq, deferred_budget };
}
