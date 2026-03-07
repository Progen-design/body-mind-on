/**
 * AI routing: map action to agent slug and delegate to runAgent().
 * Compatible with Supabase multi-agent architecture (ai_agents, buildAgentContext).
 * Add new actions here to support future agents without changing runAgent.
 */
import { runAgent } from './runAgent';

/** action → agent_slug. Extend this map to add new agents. */
const ACTION_TO_AGENT = {
  generate_plan: 'trainer',
  progress_question: 'coach',
  marketing_text: 'marketing',
  social_post: 'social',
};

/**
 * Route a request to the appropriate AI agent and return the result.
 * @param {string} action - e.g. 'generate_plan', 'progress_question', 'marketing_text', 'social_post'
 * @param {{ userId?: string | null, payload?: object }} options
 * @returns {Promise<{ rawContent: string, agentSlug: string, model: string }>}
 * @throws {Error} if action is unknown or runAgent fails
 */
export async function routeAIRequest(action, { userId = null, payload = {} } = {}) {
  const agentSlug = ACTION_TO_AGENT[action];
  if (!agentSlug) {
    throw new Error(`Unknown action: "${action}". Supported: ${Object.keys(ACTION_TO_AGENT).join(', ')}`);
  }
  return runAgent(agentSlug, {
    userId: userId ?? null,
    input: payload && typeof payload === 'object' ? payload : {},
  });
}

/** Return supported actions (for validation or docs). */
export function getSupportedActions() {
  return Object.keys(ACTION_TO_AGENT);
}
