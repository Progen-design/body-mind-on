import crypto from 'crypto';
import { supabaseServer } from './supabaseServer.js';
import { sanitizeErrorMessage } from './safeLog.js';

const CACHE_TTL_HOURS = 24;

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

/*
 * `estimateOpenAICostUSD()` A `assertOpenAIDailyBudget()` TU UŽ NEJSOU —
 * PROMPT_NAKLADY_AI.md (2026-09-18) je přesunul do `lib/openai.js`, do
 * `volejModel()`. Byly tu proto, že o cenu a rozpočet se dřív staral každý
 * volající zvlášť — přesně ten stav, co dovolil `lib/recipeGeneratorRun.js`
 * postavit si vlastního klienta a `lib/openai.js` úplně obejít. Teď je
 * volá `volejModel()` sama, na každé volání, takže je nejde vynechat.
 *
 * `recordOpenAIUsage()` tu taky není a nemá se vracet — `openai_daily_usage`
 * je od migrace 20260828100000 pohled nad `ai_runs` + `ai_logs`. Kdo zapíše
 * účtenku do jedné z nich (`volejModel()` to dělá vždy), pohled sedí sám.
 */

/**
 * Write to ai_logs. Supports both legacy format (agent usage metrics) and
 * new domain format (action, event_id, result, error for task/event audit trail).
 * Non-blocking – never throws.
 */
export async function writeAILog(entry) {
  try {
    const safeEntry = { ...entry };
    if (typeof safeEntry.message === 'string') {
      safeEntry.message = sanitizeErrorMessage(safeEntry.message);
    }
    if (safeEntry.result && typeof safeEntry.result === 'object') {
      const result = { ...safeEntry.result };
      if (typeof result.error === 'string') result.error = sanitizeErrorMessage(result.error);
      safeEntry.result = result;
    }
    await supabaseServer.from('ai_logs').insert({
      created_at: new Date().toISOString(),
      ...safeEntry,
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
