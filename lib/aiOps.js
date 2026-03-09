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
  const n = Number(process.env.AI_AGENT_TIMEOUT_MS || 30000);
  if (!Number.isFinite(n) || n < 1000) return 30000;
  return n;
}

export function getMaxTaskAttempts() {
  const n = Number(process.env.AI_TASK_MAX_ATTEMPTS || 3);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.floor(n);
}

export function buildAgentCacheKey({ agentSlug, model, systemPrompt, userContent }) {
  const base = JSON.stringify({
    agentSlug,
    model,
    systemPrompt: systemPrompt || '',
    userContent: userContent || '',
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

export async function writeAILog(entry) {
  try {
    await supabaseServer.from('ai_logs').insert({
      created_at: new Date().toISOString(),
      ...entry,
    });
  } catch {
    // Observability should be non-blocking.
  }
}

export function getRetryBackoffMinutes(attempt) {
  if (attempt <= 1) return 1;
  if (attempt === 2) return 5;
  return 15;
}
