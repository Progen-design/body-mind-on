/**
 * Generate ai_tasks for users who need automated actions.
 *
 * SAFE MODE (2026-06-02):
 * - createInitialAITasks: ACTIVE (registration -> initial_plan + onboarding)
 * - generateAITasks (weekly loop): FROZEN (loop hell prevention)
 *
 * Background: an infinite-loop pattern (missing_plan trigger + 5min cron)
 * burned through 7,405 Spoonacular calls/month with 0% success rate.
 * Weekly auto-generation stays paused until the underlying validation
 * bugs are fixed. Registration flow is back ON.
 */
import { supabaseServer } from './supabaseServer';

/**
 * Create initial AI tasks for a newly registered user (after body_metrics insert).
 * Inserts ONE trainer initial_plan and ONE coach onboarding_message.
 * No retries, no duplicates - simple and clean.
 */
export async function createInitialAITasks(userId) {
      if (!userId) return { created: 0 };

  try {
          // Check if user already has initial_plan task (avoid duplicates)
        const { data: existing } = await supabaseServer
            .from('ai_tasks')
            .select('id')
            .eq('user_id', userId)
            .eq('task_type', 'initial_plan')
            .in('status', ['pending', 'processing', 'completed'])
            .limit(1)
            .maybeSingle();

        if (existing) {
                  console.info('[generateAITasks] initial_plan already exists, skipping', { userId });
                  return { created: 0, reason: 'already_exists' };
        }

        const inserts = [
            {
                        user_id: userId,
                        agent_slug: 'trainer',
                        task_type: 'initial_plan',
                        payload: { prompt: 'Vygeneruj uvodni tydenni plan na zaklade kontextu uzivatele.' },
                        status: 'pending',
            },
            {
                        user_id: userId,
                        agent_slug: 'coach',
                        task_type: 'onboarding_message',
                        payload: { prompt: 'Posli uvitaci / onboarding zpravu na zaklade kontextu uzivatele.' },
                        status: 'pending',
            },
                ];

        const { data, error } = await supabaseServer
            .from('ai_tasks')
            .insert(inserts)
            .select('id');

        if (error) {
                  console.error('[generateAITasks] createInitialAITasks insert failed', error);
                  return { created: 0, error: error.message };
        }

        console.info('[generateAITasks] createInitialAITasks created', {
                  userId,
                  count: data?.length || 0,
        });
          return { created: data?.length || 0 };
  } catch (err) {
          console.error('[generateAITasks] createInitialAITasks error', err);
          return { created: 0, error: String(err) };
  }
}

/**
 * Generate weekly AI tasks (scheduler-driven, runs every 5 min in cron mode).
 * FROZEN: returns 0 created. To re-enable, fix missing_days_structure bug
 * in weekly_plan_update path and remove this hard return.
 */
export async function generateAITasks() {
      console.warn('[generateAITasks] weekly task generation FROZEN (loop hell prevention).');
      return { created: 0, legacy_regen_queued: 0, frozen: true };
}
