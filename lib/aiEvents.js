import { supabaseServer } from './supabaseServer';
import { evaluateUserState } from './aiDecisionEngine';
import { createAITasksFromDecisions } from './createAITasksFromDecisions';
import { getRetryBackoffMinutes } from './aiOps';

const EVENT_BATCH_LIMIT = 100;
const MAX_EVENT_ATTEMPTS = 3;

/**
 * Event queue for autonomous AI reactions.
 * Predictable path: user event -> ai_events -> decisions -> ai_tasks -> scheduler.
 */
export async function enqueueAIEvent(eventType, userId, payload = {}) {
  if (!eventType || !userId) return { ok: false, reason: 'missing_event_or_user' };
  const { data, error } = await supabaseServer.from('ai_events').insert({
    event_type: eventType,
    user_id: userId,
    payload,
    status: 'pending',
  }).select('id').maybeSingle();
  if (error) return { ok: false, reason: error.message };
  return { ok: true, id: data?.id ?? null };
}

/**
 * Immediate autonomous reaction path for important user events.
 * Still deterministic because it only creates structured ai_tasks.
 */
export async function triggerImmediateDecision(userId, options = {}) {
  if (!userId) return { created: 0, skipped: 0 };
  const decisionResult = await evaluateUserState(userId, options);
  return createAITasksFromDecisions(decisionResult, {
    sourceEventId: options?.sourceEventId ?? null,
  });
}

/**
 * Processes queued AI events and converts them to ai_tasks.
 */
export async function processPendingAIEvents() {
  const nowIso = new Date().toISOString();
  let rows = null;
  let error = null;

  const retryAwareQuery = await supabaseServer
    .from('ai_events')
    .select('id, event_type, user_id, payload, attempts, next_retry_at')
    .eq('status', 'pending')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(EVENT_BATCH_LIMIT);

  rows = retryAwareQuery.data;
  error = retryAwareQuery.error;

  if (error && /next_retry_at|attempts|column .* does not exist|neexistuje/i.test(error.message || '')) {
    const fallbackQuery = await supabaseServer
      .from('ai_events')
      .select('id, event_type, user_id, payload')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(EVENT_BATCH_LIMIT);
    rows = fallbackQuery.data;
    error = fallbackQuery.error;
  }

  if (error) {
    // Backward compatibility for environments where migration was not applied yet.
    if (/does not exist|neexistuje|relation .*ai_events/i.test(error.message || '')) {
      return { processed: 0, claimed: 0, created_tasks: 0, skipped_tasks: 0, failed: 0, retried: 0, dlq: 0 };
    }
    throw new Error(`Failed to load ai_events: ${error.message}`);
  }

  if (!rows?.length) {
    return { processed: 0, claimed: 0, created_tasks: 0, skipped_tasks: 0, failed: 0, retried: 0, dlq: 0 };
  }

  let claimed = 0;
  let created_tasks = 0;
  let skipped_tasks = 0;
  let failed = 0;
  let retried = 0;
  let dlq = 0;

  for (const eventRow of rows) {
    const claimPayload = {
      status: 'processing',
      processed_at: null,
    };

    const { data: claimRow, error: claimErr } = await supabaseServer
      .from('ai_events')
      .update(claimPayload)
      .eq('id', eventRow.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimErr || !claimRow?.id) continue;
    claimed++;

    try {
      const decisionResult = await evaluateUserState(eventRow.user_id, {
        eventContext: {
          event_type: eventRow.event_type,
          payload: eventRow.payload ?? null,
        },
      });
      const taskResult = await createAITasksFromDecisions(decisionResult, {
        sourceEventId: eventRow.id,
      });
      created_tasks += taskResult.created;
      skipped_tasks += taskResult.skipped;

      await supabaseServer
        .from('ai_events')
        .update({
          status: 'processed',
          result: {
            event_type: eventRow.event_type,
            created_tasks: taskResult.created,
            skipped_tasks: taskResult.skipped,
          },
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventRow.id);
    } catch (err) {
      const errMsg = err?.message || String(err);
      const currentAttempts = Number(eventRow?.attempts || 0);
      const nextAttempts = currentAttempts + 1;
      const isDeadLetter = nextAttempts >= MAX_EVENT_ATTEMPTS;
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

      const retryUpdate = await supabaseServer.from('ai_events').update(retryPayload).eq('id', eventRow.id);
      if (retryUpdate.error && /next_retry_at|attempts|last_error|dead_lettered_at|column .* does not exist|neexistuje/i.test(retryUpdate.error.message || '')) {
        await supabaseServer
          .from('ai_events')
          .update({
            status: isDeadLetter ? 'failed' : 'pending',
            result: isDeadLetter ? { error: errMsg, dlq: true } : { error: errMsg, retry_scheduled_for: retryAt },
            processed_at: isDeadLetter ? new Date().toISOString() : null,
          })
          .eq('id', eventRow.id);
      }

      failed++;
      if (isDeadLetter) dlq++;
      else retried++;
    }
  }

  return {
    processed: rows.length,
    claimed,
    created_tasks,
    skipped_tasks,
    failed,
    retried,
    dlq,
  };
}
