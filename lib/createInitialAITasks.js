/**
 * Dedicated module for creating initial AI tasks after user registration.
 * Called from body-metrics API after body_metrics insert and user_id is available.
 * Activates the AI pipeline: trainer generates first plan, coach sends onboarding message.
 * Single path: event → decision → task → agent → side effect (email).
 * CORE FLOW: Do not remove – registration must lead to real AI output. See docs/CORE_FLOW_REGISTRACE_AI_PLAN.md
 */
import { supabaseServer } from './supabaseServer';
import { SPOONACULAR_REGISTRATION_PAYLOAD_KEY } from './spoonacularQuotaGate';

function buildRegistrationTaskKey(userId, agentSlug, taskType) {
  return `registration:${userId}:${agentSlug}:${taskType}`;
}

/**
 * Insert initial ai_tasks for a newly registered user.
 * @param {string} userId - Required. Throws if missing.
 * @param {Object} [emailOptions] - For initial_plan: loginPassword, loginUrl, existingAccount, loginUnavailable, userChosePassword
 * @param {{ spoonacularRegistrationOnly?: boolean }} [opts] - true jen z body-metrics (registrace); jinde žádné placené Spoonacular
 * @returns {Promise<{ ok: true }>}
 */
export async function createInitialAITasks(userId, emailOptions = {}, opts = {}) {
  if (!userId) {
    console.error('[createInitialAITasks] userId is required');
    throw new Error('[createInitialAITasks] userId is required');
  }
  console.info('[createInitialAITasks] called', { userId, hasEmailOptions: !!emailOptions?.loginUrl });

  const inserts = [
    {
      user_id: userId,
      agent_slug: 'trainer',
      task_type: 'initial_plan',
      idempotency_key: buildRegistrationTaskKey(userId, 'trainer', 'initial_plan'),
      payload: {
        prompt: 'Vygeneruj první personalizovaný 7denní plán pro nového uživatele: jídelníček, trénink a denní návyky.',
        plan_scope: 'initial_7_day_trial',
        required_modules: ['nutrition', 'training', 'habits'],
        output_mode: 'nutrition_training_habits',
        ...(opts.spoonacularRegistrationOnly === true
          ? { [SPOONACULAR_REGISTRATION_PAYLOAD_KEY]: true }
          : {}),
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
      console.info('[createInitialAITasks] tasks already exist (idempotency)', { userId });
      return { ok: true, tasksCreated: false };
    }
    if (/idempotency_key|does not exist|neexistuje/i.test(error.message || '')) {
      console.info('[createInitialAITasks] fallback insert without idempotency_key', { userId });
      const { error: fallbackError } = await supabaseServer.from('ai_tasks').insert(
        inserts.map(({ idempotency_key, ...rest }) => rest)
      );
      if (!fallbackError) {
        console.info('[createInitialAITasks] fallback insert ok', { userId });
        return { ok: true, tasksCreated: true };
      }
      if (/duplicate key|unique constraint/i.test(fallbackError.message || '')) {
        console.info('[createInitialAITasks] fallback duplicate', { userId });
        return { ok: true, tasksCreated: false };
      }
      console.error('[createInitialAITasks] fallback failed', { userId, error: fallbackError.message });
      throw new Error('[createInitialAITasks] ' + fallbackError.message);
    }
    console.error('[createInitialAITasks] insert failed', { userId, error: error.message });
    throw new Error('[createInitialAITasks] ' + error.message);
  }

  console.info('[createInitialAITasks] tasks created', { userId });
  return { ok: true, tasksCreated: true };
}
