/**
 * Generic agent runner: load config from Supabase, build context, call OpenAI Responses API.
 * Keeps existing planner flow working by sending input.prompt as the user message when present.
 * New agents (trainer, coach, marketing, social) only need a row in ai_agents and optional context in buildAgentContext.
 */
import { openai } from './openai';
import { getAgentConfig } from './getAgentConfig';
import { buildAgentContext } from './buildAgentContext';
import {
  AIBudgetReachedError,
  assertOpenAIDailyBudget,
  buildAgentCacheKey,
  estimateOpenAICostUSD,
  getAgentTimeoutMs,
  readOpenAICache,
  recordOpenAIUsage,
  writeAILog,
  writeOpenAICache,
} from './aiOps';

/**
 * Run an AI agent by slug.
 * @param {string} agentSlug - e.g. 'trainer', 'coach', 'marketing', 'social'
 * @param {{ userId?: string | null, input?: { prompt?: string, [k: string]: unknown } | null }} options
 * @returns {Promise<{ rawContent: string, agentSlug: string, model: string }>}
 */
export async function runAgent(agentSlug, { userId = null, input = null } = {}) {
  const startedAt = Date.now();
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

  const cacheKey = buildAgentCacheKey({
    agentSlug,
    model: config.model,
    systemPrompt: config.system_prompt,
    userContent,
  });
  const cached = await readOpenAICache(cacheKey);
  if (cached?.rawContent) {
    await writeAILog({
      agent_slug: config.slug,
      user_id: userId,
      status: 'completed',
      cache_hit: true,
      duration_ms: Date.now() - startedAt,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      message: 'cache_hit',
    });
    return {
      rawContent: cached.rawContent.trim(),
      agentSlug: config.slug,
      model: config.model,
    };
  }

  const budgetState = await assertOpenAIDailyBudget();
  if (!budgetState.allowed) {
    await writeAILog({
      agent_slug: config.slug,
      user_id: userId,
      status: 'blocked',
      cache_hit: false,
      duration_ms: Date.now() - startedAt,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      message: `daily_budget_reached spent=${budgetState.spent} budget=${budgetState.budget}`,
    });
    throw new AIBudgetReachedError('OpenAI daily budget reached. Task deferred.');
  }

  // Force structured JSON output so planner parsing is stable
  const timeoutMs = getAgentTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await openai.responses.create(
      {
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
      },
      { signal: controller.signal }
    );
  } catch (err) {
    const isAbort = err?.name === 'AbortError' || /aborted|abort|timed out|timeout/i.test(err?.message || '');
    const failMessage = isAbort
      ? `runAgent timeout after ${timeoutMs}ms (request aborted)`
      : err?.message || String(err);
    await writeAILog({
      agent_slug: config.slug,
      user_id: userId,
      status: 'failed',
      cache_hit: false,
      duration_ms: Date.now() - startedAt,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      message: failMessage,
    });
    throw new Error(failMessage);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const rawContent =
    response.output_text ||
    response.output?.[0]?.content?.[0]?.text ||
    '';

  if (!rawContent || !rawContent.trim()) {
    throw new Error('OpenAI returned empty response');
  }

  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  const estimatedCost = estimateOpenAICostUSD(config.model, inputTokens, outputTokens);
  await recordOpenAIUsage({
    inputTokens,
    outputTokens,
    costUsd: estimatedCost,
  });
  await writeOpenAICache(cacheKey, rawContent.trim());
  await writeAILog({
    agent_slug: config.slug,
    user_id: userId,
    status: 'completed',
    cache_hit: false,
    duration_ms: Date.now() - startedAt,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimatedCost,
    message: 'ok',
  });

  return {
    rawContent: rawContent.trim(),
    agentSlug: config.slug,
    model: config.model,
  };
}
