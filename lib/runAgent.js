/**
 * Generic agent runner: load config from Supabase, build context, call OpenAI Responses API.
 * Keeps existing planner flow working by sending input.prompt as the user message when present.
 * New agents (trainer, coach, marketing, social) only need a row in ai_agents and optional context in buildAgentContext.
 */
import { volejModel, AIBudgetReachedError } from './openai.js';
import { getAgentConfig } from './getAgentConfig.js';
import { buildAgentContext } from './buildAgentContext.js';
import {
  buildAgentCacheKey,
  getAgentTimeoutMs,
  writeAILog,
} from './aiOps.js';

/**
 * `purpose` pro `ai_runs` podle role agenta — PROMPT_NAKLADY_AI.md žádá
 * rozlišit aspoň TEDa/kouče od "ostatních agentů", ne jeden `purpose: 'agent'`
 * pro všechno.
 * @param {string} agentSlug
 */
function purposeProAgenta(agentSlug) {
  const slug = String(agentSlug || '').toLowerCase().trim();
  if (slug === 'trainer') return 'agent_trener';
  if (slug === 'coach') return 'agent_kouc';
  if (slug === 'coach_chat') return 'agent_ted_chat';
  return `agent_${slug || 'ostatni'}`;
}

/**
 * Run an AI agent by slug.
 * @param {string} agentSlug - e.g. 'trainer', 'coach', 'marketing', 'social', 'nutrition_validator', 'training_validator'
 * @param {{ userId?: string | null, input?: { prompt?: string, task_contract?: object, task_type?: string, [k: string]: unknown } | null, taskType?: string, contractVersion?: string }} options
 * @returns {Promise<{ rawContent: string, parsedContent?: object, agentSlug: string, model: string }>}
 */
export async function runAgent(agentSlug, { userId = null, input = null, taskType = null, contractVersion = null, maxOutputTokens = null } = {}) {
  const startedAt = Date.now();
  if (String(agentSlug || '').toLowerCase().trim() === 'trainer') {
    console.warn(
      '[runAgent] slug "trainer" = legacy OpenAI Responses + json_object. Produkční týdenní plán generuje runUnifiedPlanPipeline (Chat Completions), ne runAgent(trainer).'
    );
  }
  const config = await getAgentConfig(agentSlug);
  if (!config.enabled) {
    throw new Error(`Agent "${agentSlug}" is disabled.`);
  }

  const context = await buildAgentContext(config.context_profile_slug || agentSlug, userId, input ?? {}, agentSlug);

  // OpenAI Responses API: web_search tool cannot be combined with text.format json_object (400:
  // "Web Search cannot be used with JSON mode."). This runner always uses json_object for stable parsing.
  // Coach/trainer must not receive web_search here; DB web_search_enabled is for future non-JSON flows.
  const webSearchEnabled = false;

  // OpenAI json_object format vyžaduje slovo "json" v user message – viz https://platform.openai.com/docs/guides/structured-outputs
  const userContent = JSON.stringify({
    request: input ?? {},
    context,
    runtime_contract: input?.task_contract ?? null,
    instructions: input?.prompt
      ? 'Pouzij request.prompt jako hlavni zadani, ale zachovej personalizaci podle context a runtime_contract. Vrat platny JSON.'
      : 'Vychazej z context a runtime_contract. Vrat pouze validni JSON (json_object format).',
    integration_rules: [
      'Pouzivej pouze integrace uvedene v context.runtime_capabilities.',
      'Pokud ma nejaka integrace enabled=false, netvrd, ze byla pouzita.',
      (context.runtime_capabilities?.ai?.web_search_runtime === true
        ? 'Máš k dispozici web search – můžeš ho využít pro aktuální informace o výživě, suplementaci, tréninkových trendech. Výsledky vyhledávání použij jako podporu, ale vždy vracej platný JSON podle struktury.'
        : 'Nevymyslej file-search ani web search – v runtime není zapojen. Kdyz enrichment zdroje nejsou dostupne, pracuj jen s internim kontextem a bez falesnych tvrzeni.'),
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
    web_search_enabled: webSearchEnabled,
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
  const useCache = !webSearchEnabled;

  // Force structured JSON output so planner parsing is stable
  const timeoutMs = getAgentTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const requestBody = {
    purpose: purposeProAgenta(config.slug),
    api: 'responses',
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
    // Cache i rozpočet teď hlídá volejModel() sama — na KAŽDÉ volání, ne jen
    // na tohle (PROMPT_NAKLADY_AI.md bod A+D). `ai_runs` je od téhle chvíle
    // jediný sloupec se skutečnou cenou; `ai_logs` níž zůstává jako
    // orchestrační deník (status, agent_slug, cache_hit) s nulovanými
    // dolarovými poli, ať `openai_daily_usage` (součet přes ai_runs+ai_logs)
    // nesečte totéž volání dvakrát.
    cacheKey: useCache ? cacheKey : null,
  };

  // STROP DÉLKY ODPOVĚDI. Volitelný — agenti, kteří vracejí celý týdenní plán,
  // ho nesmí dostat, jinak by se JSON utnul uprostřed. Posílá ho jen volající,
  // který ví, že jeho odpověď je krátká (chat s TEDem).
  if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
    requestBody.max_output_tokens = Math.round(maxOutputTokens);
  }
  // Intentionally no tools: json_object + web_search are mutually exclusive on Responses API.

  let response;
  try {
    response = await volejModel(requestBody, { signal: controller.signal });
  } catch (err) {
    if (err instanceof AIBudgetReachedError) {
      await writeAILog({
        agent_slug: config.slug,
        user_id: userId,
        status: 'blocked',
        cache_hit: false,
        duration_ms: Date.now() - startedAt,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        message: err.message,
        payload: diagnosticPayload,
      });
      throw err;
    }
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

  if (response?.fromCache === true) {
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
      rawContent: response.rawContent.trim(),
      agentSlug: config.slug,
      model: config.model,
    };
  }

  let rawContent =
    response.output_text ||
    response.output?.[0]?.content?.[0]?.text ||
    '';
  if (!rawContent && Array.isArray(response.output)) {
    const lastMessage = [...response.output].reverse().find((o) => o.type === 'message' && o.content);
    if (lastMessage?.content) {
      const textBlock = Array.isArray(lastMessage.content)
        ? lastMessage.content.find((c) => c.type === 'output_text' && c.text)
        : null;
      if (textBlock?.text) rawContent = textBlock.text;
    }
  }
  rawContent = rawContent || '';

  if (!rawContent || !rawContent.trim()) {
    throw new Error('OpenAI returned empty response');
  }

  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  // Skutečná cena i tokeny už jsou zapsané v ai_runs (volejModel() výš,
  // purpose = purposeProAgenta()) — sem jde jen nulový součet, ať
  // openai_daily_usage nesečte totéž volání podruhé (viz komentář u
  // requestBody.cacheKey výš).
  await writeAILog({
    agent_slug: config.slug,
    user_id: userId,
    status: 'completed',
    cache_hit: false,
    duration_ms: Date.now() - startedAt,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    message: 'ok',
    payload: { ...diagnosticPayload, skutecne_input_tokens: inputTokens, skutecne_output_tokens: outputTokens },
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
