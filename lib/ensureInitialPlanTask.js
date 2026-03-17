/**
 * Ensures trainer/initial_plan (and coach/onboarding_message) exist for a user.
 * Used for self-healing when profile finds body_metrics but no initial_plan task
 * (e.g. legacy users or missed creation). Idempotent – uses same createInitialAITasks.
 */
import { supabaseServer } from './supabaseServer';
import { createInitialAITasks } from './createInitialAITasks';

/**
 * If no trainer/initial_plan task exists for userId, create it (and coach task).
 * @param {string} userId
 * @param {Object} [emailOptions] - optional, for initial_plan payload (loginUrl etc.)
 * @returns {Promise<{ created: boolean, reason?: string, error?: string }>}
 */
export async function ensureInitialPlanTask(userId, emailOptions = {}) {
  if (!userId) return { created: false, reason: 'missing_user_id' };

  const { data: existing } = await supabaseServer
    .from('ai_tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('agent_slug', 'trainer')
    .eq('task_type', 'initial_plan')
    .limit(1)
    .maybeSingle();

  if (existing?.id) return { created: false, reason: 'task_already_exists' };

  try {
    await createInitialAITasks(userId, emailOptions);
    console.info('[ensureInitialPlanTask] created initial_plan (and coach) for user', userId);
    return { created: true, reason: 'recovery_task_created' };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/duplicate|unique|idempotency/i.test(msg)) {
      return { created: false, reason: 'task_created_by_race' };
    }
    console.warn('[ensureInitialPlanTask] createInitialAITasks failed', { userId, error: msg });
    return { created: false, reason: 'create_failed', error: msg };
  }
}
