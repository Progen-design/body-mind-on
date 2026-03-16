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
 * @param {string} agentSlug - e.g. 'trainer', 'coach', 'marketing', 'social', 'nutrition_validator', 'training_validator'
 * @param {{ userId?: string | null, input?: { prompt?: string, task_contract?: object, task_type?: string, [k: string]: unknown } | null, taskType?: string, contractVersion?: string }} options
 * @returns {Promise<{ rawContent: string, parsedContent?: object, agentSlug: string, model: string }>}
 */
export async function runAgent(agentSlug, { userId = null, input = null, taskType = null, contractVersion = null } = {}) {
  const startedAt = Date.now();
  const config = await getAgentConfig(agentSlug);
  if (!config.enabled) {
    throw new Error(`Agent "${agentSlug}" is disabled.`);
  }

  const context = await buildAgentContext(config.context_profile_slug || agentSlug, userId, input ?? {}, agentSlug);

  const userContent = JSON.stringify({
    request: input ?? {},
    context,
    runtime_contract: input?.task_contract ?? null,
    instructions: input?.prompt
      ? 'Pouzij request.prompt jako hlavni zadani, ale zachovej personalizaci podle context a runtime_contract.'
      : 'Vychazej z context a runtime_contract. Vrat pouze validni JSON.',
    integration_rules: [
      'Pouzivej pouze integrace uvedene v context.runtime_capabilities.',
      'Pokud ma nejaka integrace enabled=false, netvrd, ze byla pouzita.',
      'Nevymyslej file-search ani retrieval, pokud runtime_capabilities.ai.file_search_runtime=false.',
      'Kdyz enrichment zdroje nejsou dostupne, pracuj jen s internim kontextem a bez falesnych tvrzeni.',
      (context.supporting_documents?.length > 0
        ? 'V contextu byly predany supporting_documents – pouzij je jako prioritu pred obecnymi znalostmi.'
        : null),
    ].filter(Boolean),
  });

  const docs = context.supporting_documents ?? [];
  const diagnosticPayload = {
    prompt_version: config.prompt_version ?? null,
    prompt_source: config.prompt_source ?? null,
    supporting_documents_count: docs.length,
    document_titles: docs.map((d) => d.title).filter(Boolean),
    source_ids: docs.map((d) => d.source_id).filter(Boolean),
  };

  const cacheKey = buildAgentCacheKey({
    agentSlug,
    model: config.model,
    systemPrompt: config.system_prompt,
    userContent,
    temperature: config.temperature,
    agentVersion: config.version ?? 1,
    promptVersion: config.prompt_version ?? 1,
    taskType: taskType ?? input?.task_type ?? null,
    contractVersion: contractVersion ?? null,
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
      payload: diagnosticPayload,
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
      payload: diagnosticPayload,
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
        text: { format: { type: 'json_object' } },
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
      payload: diagnosticPayload,
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
    payload: diagnosticPayload,
  });

  let parsedContent = null;
  try {
    parsedContent = JSON.parse(rawContent.trim());
  } catch (_) {}

  return {
    rawContent: rawContent.trim(),
    parsedContent,
    agentSlug: config.slug,
    model: config.model,
  };
}
