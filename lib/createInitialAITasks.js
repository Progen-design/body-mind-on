/**
 * Dedicated module for creating initial AI tasks after user registration.
 * Called from body-metrics API after body_metrics insert and user_id is available.
 * Activates the AI pipeline: trainer generates first plan, coach sends onboarding message.
 */
import { supabaseServer } from './supabaseServer';

/**
 * Insert initial ai_tasks for a newly registered user.
 * @param {string} userId - Required. Throws if missing.
 * @returns {Promise<{ ok: true }>}
 */
export async function createInitialAITasks(userId) {
  if (!userId) {
    throw new Error('[createInitialAITasks] userId is required');
  }

  const inserts = [
    {
      user_id: userId,
      agent_slug: 'trainer',
      task_type: 'initial_plan',
      payload: { prompt: 'Vygeneruj první personalizovaný plán pro nového uživatele.' },
      status: 'pending',
    },
    {
      user_id: userId,
      agent_slug: 'coach',
      task_type: 'onboarding_message',
      payload: { prompt: 'Vytvoř krátkou motivační onboarding zprávu pro nového uživatele.' },
      status: 'pending',
    },
  ];

  const { error } = await supabaseServer.from('ai_tasks').insert(inserts);
  if (error) {
    throw new Error('[createInitialAITasks] ' + error.message);
  }

  return { ok: true };
}
