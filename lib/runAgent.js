/**
 * Generic agent runner: load config from Supabase, build context, call OpenAI Responses API.
 * Keeps existing planner flow working by sending input.prompt as the user message when present.
 * New agents (trainer, coach, marketing, social) only need a row in ai_agents and optional context in buildAgentContext.
 */
import { openai } from './openai';
import { getAgentConfig } from './getAgentConfig';
import { buildAgentContext } from './buildAgentContext';

/**
 * Run an AI agent by slug.
 * @param {string} agentSlug - e.g. 'trainer', 'coach', 'marketing', 'social'
 * @param {{ userId?: string | null, input?: { prompt?: string, [k: string]: unknown } | null }} options
 * @returns {Promise<{ rawContent: string, agentSlug: string, model: string }>}
 */
export async function runAgent(agentSlug, { userId = null, input = null } = {}) {
  const config = await getAgentConfig(agentSlug);
  if (!config.enabled) {
    throw new Error(`Agent "${agentSlug}" is disabled.`);
  }

  const context = await buildAgentContext(agentSlug, userId, input ?? {});

  // For planner compatibility: if input.prompt is provided, use it as the user message (unchanged behavior).
  // Otherwise send stringified context for agents that consume context-only.
  const userContent =
    (input && typeof input.prompt === 'string' && input.prompt.trim()) ||
    JSON.stringify(context);

  // Force structured JSON output so planner parsing is stable
  const response = await openai.responses.create({
    model: config.model,
    instructions: config.system_prompt,
    temperature: config.temperature,
    response_format: { type: 'json_object' },
    input: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const rawContent =
    response.output_text ||
    response.output?.[0]?.content?.[0]?.text ||
    '';

  if (!rawContent || !rawContent.trim()) {
    throw new Error('OpenAI returned empty response');
  }

  return {
    rawContent: rawContent.trim(),
    agentSlug: config.slug,
    model: config.model,
  };
}
