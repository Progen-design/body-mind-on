/**
 * Dedicated module for creating initial AI tasks after user registration.
 * Called from body-metrics API after body_metrics insert and user_id is available.
 * Activates the AI pipeline: trainer generates first plan, coach sends onboarding message.
 * Single path: event → decision → task → agent → side effect (email).
 * CORE FLOW: Do not remove – registration must lead to real AI output. See docs/CORE_FLOW_REGISTRACE_AI_PLAN.md
 */
import { supabaseServer } from './supabaseServer';

function buildRegistrationTaskKey(userId, agentSlug, taskType) {
  return `registration:${userId}:${agentSlug}:${taskType}`;
}

/**
 * Insert initial ai_tasks for a newly registered user.
 * @param {string} userId - Required. Throws if missing.
 * @param {Object} [emailOptions] - For initial_plan: loginPassword, loginUrl, existingAccount, loginUnavailable, userChosePassword
 * @returns {Promise<{ ok: true }>}
 */
export async function createInitialAITasks(userId, emailOptions = {}) {
  if (!userId) {
    throw new Error('[createInitialAITasks] userId is required');
  }

  const inserts = [
    {
      user_id: userId,
      agent_slug: 'trainer',
      task_type: 'initial_plan',
      idempotency_key: buildRegistrationTaskKey(userId, 'trainer', 'initial_plan'),
      payload: {
        prompt: 'Vygeneruj první personalizovaný plán pro nového uživatele.',
        emailOptions: {
          loginPassword: emailOptions.loginPassword ?? null,
          loginUrl: emailOptions.loginUrl ?? null,
          existingAccount: emailOptions.existingAccount === true,
          loginUnavailable: emailOptions.loginUnavailable === true,
          userChosePassword: emailOptions.userChosePassword === true,
        },
      },
      status: 'pending',
    },
    {
      user_id: userId,
      agent_slug: 'coach',
      task_type: 'onboarding_message',
      idempotency_key: buildRegistrationTaskKey(userId, 'coach', 'onboarding_message'),
      payload: { prompt: 'Vytvoř krátkou motivační onboarding zprávu pro nového uživatele.' },
      status: 'pending',
    },
  ];

  const { error } = await supabaseServer.from('ai_tasks').insert(inserts);
  if (error) {
    if (/duplicate key|unique constraint|idx_ai_tasks_idempotency/i.test(error.message || '')) {
      return { ok: true };
    }
    if (/idempotency_key|does not exist|neexistuje/i.test(error.message || '')) {
      const { error: fallbackError } = await supabaseServer.from('ai_tasks').insert(
        inserts.map(({ idempotency_key, ...rest }) => rest)
      );
      if (!fallbackError) return { ok: true };
      if (/duplicate key|unique constraint/i.test(fallbackError.message || '')) return { ok: true };
      throw new Error('[createInitialAITasks] ' + fallbackError.message);
    }
    throw new Error('[createInitialAITasks] ' + error.message);
  }

  return { ok: true };
}
