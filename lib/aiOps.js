import crypto from 'crypto';
import { supabaseServer } from './supabaseServer';

const CACHE_TTL_HOURS = 24;
const DEFAULT_DAILY_BUDGET_USD = 8;

export class AIBudgetReachedError extends Error {
  constructor(message = 'OpenAI daily budget reached') {
    super(message);
    this.name = 'AIBudgetReachedError';
    this.code = 'AI_BUDGET_REACHED';
  }
}

function isMissingSchemaError(message) {
  return /does not exist|neexistuje|relation .* does not exist|column .* does not exist/i.test(
    message || ''
  );
}

export function getAgentTimeoutMs() {
  const n = Number(process.env.AI_AGENT_TIMEOUT_MS || 70000);
  if (!Number.isFinite(n) || n < 1000) return 70000;
  return Math.min(n, 120000);
}

export function getMaxTaskAttempts() {
  const n = Number(process.env.AI_TASK_MAX_ATTEMPTS || 3);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.floor(n);
}

/**
 * Cache key must include all inputs that affect output so DB/config changes invalidate cache.
 */
export function buildAgentCacheKey({
  agentSlug,
  model,
  systemPrompt,
  userContent,
  temperature,
  agentVersion,
  promptVersion,
  taskType = null,
  contractVersion = null,
}) {
  const base = JSON.stringify({
    agentSlug,
    model,
    systemPrompt: systemPrompt || '',
    userContent: userContent || '',
    temperature: temperature ?? 0.2,
    agentVersion: agentVersion ?? 1,
    promptVersion: promptVersion ?? 1,
    taskType: taskType ?? '',
    contractVersion: contractVersion ?? '',
  });
  return crypto.createHash('sha256').update(base).digest('hex');
}

export async function readOpenAICache(cacheKey) {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseServer
      .from('openai_response_cache')
      .select('cache_key, raw_content')
      .eq('cache_key', cacheKey)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error.message)) return null;
      return null;
    }

    if (!data?.raw_content) return null;
    return { rawContent: data.raw_content };
  } catch {
    return null;
  }
}

export async function writeOpenAICache(cacheKey, rawContent) {
  if (!cacheKey || !rawContent) return;
  try {
    const now = new Date();
    const expires = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);
    await supabaseServer.from('openai_response_cache').upsert(
      {
        cache_key: cacheKey,
        raw_content: rawContent,
        expires_at: expires.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'cache_key' }
    );
  } catch {
    // Cache write must never break scheduler flow.
  }
}

export function estimateOpenAICostUSD(model, inputTokens = 0, outputTokens = 0) {
  // Approximate pricing guardrail for budget control.
  const lowerModel = String(model || '').toLowerCase();
  const isMini = lowerModel.includes('mini');
  const inputPerMillion = isMini ? 0.15 : 5.0;
  const outputPerMillion = isMini ? 0.6 : 15.0;
  return (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
}

export async function assertOpenAIDailyBudget() {
  const budget = Number(process.env.OPENAI_DAILY_BUDGET_USD || DEFAULT_DAILY_BUDGET_USD);
  if (!Number.isFinite(budget) || budget <= 0) return { allowed: true, spent: 0, budget };

  const usageDate = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await supabaseServer
      .from('openai_daily_usage')
      .select('spent_usd')
      .eq('usage_date', usageDate)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error.message)) return { allowed: true, spent: 0, budget };
      return { allowed: true, spent: 0, budget };
    }

    const spent = Number(data?.spent_usd || 0);
    if (spent >= budget) {
      return { allowed: false, spent, budget };
    }
    return { allowed: true, spent, budget };
  } catch {
    return { allowed: true, spent: 0, budget };
  }
}

export async function recordOpenAIUsage({ inputTokens = 0, outputTokens = 0, costUsd = 0 }) {
  const usageDate = new Date().toISOString().slice(0, 10);
  try {
    const { data: existing } = await supabaseServer
      .from('openai_daily_usage')
      .select('spent_usd, input_tokens, output_tokens, requests_count')
      .eq('usage_date', usageDate)
      .maybeSingle();

    const next = {
      usage_date: usageDate,
      spent_usd: Number(existing?.spent_usd || 0) + Number(costUsd || 0),
      input_tokens: Number(existing?.input_tokens || 0) + Number(inputTokens || 0),
      output_tokens: Number(existing?.output_tokens || 0) + Number(outputTokens || 0),
      requests_count: Number(existing?.requests_count || 0) + 1,
      updated_at: new Date().toISOString(),
    };

    await supabaseServer.from('openai_daily_usage').upsert(next, { onConflict: 'usage_date' });
  } catch {
    // Usage tracking should never break AI flow.
  }
}

/**
 * Write to ai_logs. Supports both legacy format (agent usage metrics) and
 * new domain format (action, event_id, result, error for task/event audit trail).
 * Non-blocking – never throws.
 */
export async function writeAILog(entry) {
  try {
    await supabaseServer.from('ai_logs').insert({
      created_at: new Date().toISOString(),
      ...entry,
    });
  } catch {
    // Observability must never block AI pipeline.
  }
}

/**
 * Exponential backoff: 1m, 2m, 4m, 8m, 16m
 * attempt=1 → 1 min, attempt=2 → 2 min, attempt=3 → 4 min, attempt=4 → 8 min, attempt≥5 → 16 min
 */
export function getRetryBackoffMinutes(attempt) {
  const n = Math.max(1, Math.min(Number.isFinite(attempt) ? attempt : 1, 5));
  return Math.pow(2, n - 1); // 1,2,4,8,16
}
