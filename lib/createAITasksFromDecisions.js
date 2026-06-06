import { supabaseServer } from './supabaseServer';
import { canRunPlanTask } from './planGenerationGate';

/**
 * Convert structured decisions into ai_tasks queue entries.
 * Deduplicates against existing pending tasks by user + agent + task_type.
 *
 * This keeps autonomous behavior deterministic:
 * decision engine -> ai_tasks -> scheduler -> runAgent.
 * When sourceEventId is provided, idempotency_key guarantees replay-safe inserts.
 */
function buildEventScopedIdempotencyKey(sourceEventId, agentSlug, taskType) {
  if (!sourceEventId || !agentSlug || !taskType) return null;
  return `event:${sourceEventId}:${agentSlug}:${taskType}`;
}

export async function createAITasksFromDecisions(decisionResult, options = {}) {
  const userId = decisionResult?.userId ?? null;
  const decisions = Array.isArray(decisionResult?.decisions)
    ? decisionResult.decisions
    : [];
  const sourceEventId = options?.sourceEventId ?? null;

  if (!userId || decisions.length === 0) {
    return { created: 0, skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const decision of decisions) {
    const agentSlug = decision?.agent_slug;
    const taskType = decision?.task_type;
    const idempotencyKey =
      decision?.idempotency_key ??
      buildEventScopedIdempotencyKey(sourceEventId, agentSlug, taskType);

    if (!agentSlug || !taskType) {
      skipped++;
      continue;
    }

    const gate = await canRunPlanTask(userId, agentSlug, taskType);
    if (!gate.allowed) {
      skipped++;
      console.info('[createAITasksFromDecisions] skipped by membership gate', {
        userId,
        agentSlug,
        taskType,
        reason: gate.reason,
      });
      continue;
    }

    const { data: existing, error: existingErr } = await supabaseServer
      .from('ai_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_slug', agentSlug)
      .eq('task_type', taskType)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      // Fail-safe: do not create potentially duplicated autonomous tasks.
      skipped++;
      continue;
    }

    if (existing) {
      skipped++;
      continue;
    }

    const { error: insertErr } = await supabaseServer.from('ai_tasks').insert({
      user_id: userId,
      agent_slug: agentSlug,
      task_type: taskType,
      idempotency_key: idempotencyKey,
      source_event_id: sourceEventId,
      payload: {
        ...(decision.payload ?? {}),
        reason: decision.reason ?? null,
      },
      status: 'pending',
      attempts: 0,
      next_retry_at: null,
      last_error: null,
    });

    if (insertErr) {
      if (/duplicate key|unique constraint|idx_ai_tasks_idempotency/i.test(insertErr.message || '')) {
        skipped++;
        continue;
      }

      // Backward compatibility for environments where new runtime columns are not migrated yet.
      if (/attempts|next_retry_at|last_error|idempotency_key|source_event_id|does not exist|neexistuje/i.test(insertErr.message || '')) {
        const { error: fallbackErr } = await supabaseServer.from('ai_tasks').insert({
          user_id: userId,
          agent_slug: agentSlug,
          task_type: taskType,
          payload: {
            ...(decision.payload ?? {}),
            reason: decision.reason ?? null,
          },
          status: 'pending',
        });
        if (!fallbackErr) {
          created++;
          continue;
        }
        if (/duplicate key|unique constraint/i.test(fallbackErr?.message || '')) {
          skipped++;
          continue;
        }
      }
      skipped++;
      continue;
    }

    created++;
  }

  return { created, skipped };
}
