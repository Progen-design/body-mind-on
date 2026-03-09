import { supabaseServer } from './supabaseServer';

/**
 * Convert structured decisions into ai_tasks queue entries.
 * Deduplicates against existing pending tasks by user + agent + task_type.
 *
 * This keeps autonomous behavior deterministic:
 * decision engine -> ai_tasks -> scheduler -> runAgent.
 */
export async function createAITasksFromDecisions(decisionResult) {
  const userId = decisionResult?.userId ?? null;
  const decisions = Array.isArray(decisionResult?.decisions)
    ? decisionResult.decisions
    : [];

  if (!userId || decisions.length === 0) {
    return { created: 0, skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const decision of decisions) {
    const agentSlug = decision?.agent_slug;
    const taskType = decision?.task_type;

    if (!agentSlug || !taskType) {
      skipped++;
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
      // Backward compatibility for environments where retry columns are not migrated yet.
      if (/attempts|next_retry_at|last_error|does not exist|neexistuje/i.test(insertErr.message || '')) {
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
      }
      skipped++;
      continue;
    }

    created++;
  }

  return { created, skipped };
}
