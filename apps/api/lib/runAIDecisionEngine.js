import { supabaseServer } from './supabaseServer';
import { evaluateUserState } from './aiDecisionEngine';
import { createAITasksFromDecisions } from './createAITasksFromDecisions';

const USER_BATCH_LIMIT = 50;
const METRICS_PAGE_SIZE = 500;
const MAX_PAGES_PER_RUN = 12;

/**
 * Run autonomous decision pass for a batch of users.
 *
 * This is the autonomy layer entrypoint:
 * user state -> structured decisions -> ai_tasks.
 * Agents still execute only via scheduler, which keeps system predictable.
 */
export async function runAIDecisionEngine() {
  const seen = new Set();
  const userIds = [];
  let cursor = 0;
  let pages = 0;
  let exhausted = false;

  while (userIds.length < USER_BATCH_LIMIT && pages < MAX_PAGES_PER_RUN && !exhausted) {
    const from = cursor;
    const to = cursor + METRICS_PAGE_SIZE - 1;
    const { data: metricsRows, error } = await supabaseServer
      .from('body_metrics')
      .select('user_id, created_at')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load users for decision engine: ${error.message}`);
    }

    if (!metricsRows?.length) {
      exhausted = true;
      break;
    }

    for (const row of metricsRows) {
      const uid = row?.user_id;
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      userIds.push(uid);
      if (userIds.length >= USER_BATCH_LIMIT) break;
    }

    cursor += METRICS_PAGE_SIZE;
    pages += 1;
    if (metricsRows.length < METRICS_PAGE_SIZE) exhausted = true;
  }
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
