import { supabaseServer } from './supabaseServer';
import { evaluateUserState } from './aiDecisionEngine';
import { createAITasksFromDecisions } from './createAITasksFromDecisions';

const EVENT_BATCH_LIMIT = 100;

/**
 * Event queue for autonomous AI reactions.
 * Predictable path: user event -> ai_events -> decisions -> ai_tasks -> scheduler.
 */
export async function enqueueAIEvent(eventType, userId, payload = {}) {
  if (!eventType || !userId) return { ok: false, reason: 'missing_event_or_user' };
  const { error } = await supabaseServer.from('ai_events').insert({
    event_type: eventType,
    user_id: userId,
    payload,
    status: 'pending',
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Immediate autonomous reaction path for important user events.
 * Still deterministic because it only creates structured ai_tasks.
 */
export async function triggerImmediateDecision(userId) {
  if (!userId) return { created: 0, skipped: 0 };
  const decisionResult = await evaluateUserState(userId);
  return createAITasksFromDecisions(decisionResult);
}

/**
 * Processes queued AI events and converts them to ai_tasks.
 */
export async function processPendingAIEvents() {
  const { data: rows, error } = await supabaseServer
    .from('ai_events')
    .select('id, event_type, user_id, payload')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(EVENT_BATCH_LIMIT);

  if (error) {
    // Backward compatibility for environments where migration was not applied yet.
    if (/does not exist|neexistuje|relation .*ai_events/i.test(error.message || '')) {
      return { processed: 0, claimed: 0, created_tasks: 0, skipped_tasks: 0, failed: 0 };
    }
    throw new Error(`Failed to load ai_events: ${error.message}`);
  }

  if (!rows?.length) {
    return { processed: 0, claimed: 0, created_tasks: 0, skipped_tasks: 0, failed: 0 };
  }

  let claimed = 0;
  let created_tasks = 0;
  let skipped_tasks = 0;
  let failed = 0;

  for (const eventRow of rows) {
    const { data: claimRow, error: claimErr } = await supabaseServer
      .from('ai_events')
      .update({ status: 'processing' })
      .eq('id', eventRow.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimErr || !claimRow?.id) continue;
    claimed++;

    try {
      const decisionResult = await evaluateUserState(eventRow.user_id);
      const taskResult = await createAITasksFromDecisions(decisionResult);
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
      failed++;
      await supabaseServer
        .from('ai_events')
        .update({
          status: 'failed',
          result: { error: err?.message || String(err) },
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventRow.id);
    }
  }

  return {
    processed: rows.length,
    claimed,
    created_tasks,
    skipped_tasks,
    failed,
  };
}
