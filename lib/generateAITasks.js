/**
 * Generate ai_tasks for users who need automated actions.
 *
 * NUCLEAR SHUTDOWN MODE (2026-06-02):
 * Owner Honza decided to freeze all auto-task creation until BMON is
 * properly tested and ready for paid users. Both exported functions
 * are now no-ops. To re-enable, set env BMON_TASK_CREATION_ENABLED=true
 * AND remove the `|| true` hard override below.
 *
 * Background: an infinite-loop pattern (missing_plan trigger + 5min cron)
 * burned through 7,405 Spoonacular calls/month with 0% success rate.
 * DB-level firewall (block_auto_task_creation trigger) backs this up,
 * Vercel crons removed in vercel.json, all ai_trigger_rules disabled.
 */

const TASK_CREATION_FROZEN =
    process.env.BMON_TASK_CREATION_ENABLED !== 'true' || true;

/**
 * Create initial AI tasks for a newly registered user.
 * NO-OP while TASK_CREATION_FROZEN.
 */
export async function createInitialAITasks(userId) {
    if (TASK_CREATION_FROZEN) {
          console.warn(
                  '[generateAITasks] createInitialAITasks skipped (FROZEN mode).',
            { userId, ts: new Date().toISOString() },
                );
          return { created: 0, frozen: true };
    }
    return { created: 0, frozen: true };
}

/**
 * Generate weekly AI tasks for active users (scheduler-driven).
 * NO-OP while TASK_CREATION_FROZEN.
 */
export async function generateAITasks() {
    if (TASK_CREATION_FROZEN) {
          console.warn(
                  '[generateAITasks] generateAITasks skipped (FROZEN mode).',
            { ts: new Date().toISOString() },
                );
          return { created: 0, legacy_regen_queued: 0, frozen: true };
    }
    return { created: 0, legacy_regen_queued: 0, frozen: true };
}
