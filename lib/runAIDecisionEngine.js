import { supabaseServer } from './supabaseServer';
import { evaluateUserState } from './aiDecisionEngine';
import { createAITasksFromDecisions } from './createAITasksFromDecisions';

const USER_BATCH_LIMIT = 50;

/**
 * Run autonomous decision pass for a batch of users.
 *
 * This is the autonomy layer entrypoint:
 * user state -> structured decisions -> ai_tasks.
 * Agents still execute only via scheduler, which keeps system predictable.
 */
export async function runAIDecisionEngine() {
  const { data: metricsRows, error } = await supabaseServer
    .from('body_metrics')
    .select('user_id, created_at')
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load users for decision engine: ${error.message}`);
  }

  const seen = new Set();
  const userIds = [];
  for (const row of metricsRows ?? []) {
    const uid = row?.user_id;
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    userIds.push(uid);
    if (userIds.length >= USER_BATCH_LIMIT) break;
  }

  // TODO: Add cursor-based pagination for batches > 50 users.
  let created_tasks = 0;
  let skipped_tasks = 0;

  for (const userId of userIds) {
    const decisionResult = await evaluateUserState(userId);
    const taskResult = await createAITasksFromDecisions(decisionResult);
    created_tasks += taskResult.created;
    skipped_tasks += taskResult.skipped;
  }

  return {
    processed_users: userIds.length,
    created_tasks,
    skipped_tasks,
  };
}
