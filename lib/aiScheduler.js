/**
 * Process pending ai_tasks: call runAgent() for each, store result, mark completed or failed.
 * Called by cron or /api/ai/run-scheduler.
 * Future expansion: AI push notifications, automated weekly coaching, webhook delivery of results to marketing/social pipelines.
 */
import { supabaseServer } from './supabaseServer';
import { runAgent } from './runAgent';

export async function runAIScheduler() {
  const { data: tasks, error: fetchError } = await supabaseServer
    .from('ai_tasks')
    .select('id, user_id, agent_slug, payload')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to load ai_tasks: ${fetchError.message}`);
  }

  if (!tasks?.length) {
    return { processed: 0, completed: 0, failed: 0 };
  }

  let completed = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      const result = await runAgent(task.agent_slug, {
        userId: task.user_id ?? null,
        input: task.payload ?? {},
      });

      await supabaseServer
        .from('ai_tasks')
        .update({
          status: 'completed',
          result: {
            rawContent: result.rawContent,
            agent_slug: result.agentSlug,
            model: result.model,
          },
          processed_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      completed++;
    } catch (err) {
      await supabaseServer
        .from('ai_tasks')
        .update({
          status: 'failed',
          result: { error: err?.message || String(err) },
          processed_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      failed++;
    }
  }

  return { processed: tasks.length, completed, failed };
}
