import crypto from 'crypto';
import { supabaseServer } from './supabaseServer.js';
import { sanitizeErrorMessage } from './safeLog.js';

const CACHE_TTL_HOURS = 24;
/*
 * DENNI STROP UTRATY ZA OPENAI, kdyz neni nastaveny OPENAI_DAILY_BUDGET_USD.
 *
 * Bylo 8 USD. Skutecna utrata byla 1,10-1,93 USD za den (zmereno 9. 9. 2026
 * na `openai_daily_usage` po oprave dvojiho pocitani), takze pojistka nemohla
 * sepnout nikdy — a taky nesepla, kdyz 9. 9. dosel kredit.
 *
 * 3 USD je strop, ne rozpocet: pri stropu 10 receptu denne vychazi bezny den
 * na ~0,3 USD, takze je tu sest az desetinasobna rezerva. Kdyz se na nej
 * narazi, deje se neco nechteneho.
 *
 * Pozor pri zvysovani stropu generatoru: pri 50 receptech denne je bezny den
 * ~1,5 USD a 3 USD uz je blizko. Obe cisla se hybou spolu.
 */
const DEFAULT_DAILY_BUDGET_USD = 3;

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
  // Sazby v USD za milion tokenu. OVERIT pri zmene modelu — ceny se meni.
  //
  // Sazby pro plny model byly 5/15, coz nesedelo na zadny model, ktery appka
  // pouziva: gpt-4o stoji 2,50 za milion vstupnich a 10 za milion vystupnich.
  // Odhad tim nadhodnocoval utratu dvojnasobne a `assertOpenAIDailyBudget()`
  // by na nej sepla pri polovine skutecne utraty. Cisla ted sedi
  // s `RECIPE_GEN_RATES_USD_PER_MTOK` v lib/recipeGenerator.js — jedna cena
  // pro tentyz model na obou mistech.
  const lowerModel = String(model || '').toLowerCase();
  const isMini = lowerModel.includes('mini');
  const inputPerMillion = isMini ? 0.15 : 2.5;
  const outputPerMillion = isMini ? 0.6 : 10.0;
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

/*
 * `recordOpenAIUsage()` TU UŽ NENÍ — a nemá se vracet.
 *
 * Zapisovala denní součet do `openai_daily_usage`, ale volal ji JEDINÝ
 * volající (`lib/runAgent.js`), takže tabulka nikdy neobsahovala útratu
 * generátoru receptů. Ten si píše účtenky do `ai_runs`. Rozpočtová pojistka
 * níž tedy měřila jen polovinu útraty a 23.–28. 8. 2026 nezachytila, že došel
 * kredit — generátor stál čtyři dny.
 *
 * Od migrace 20260828100000 je `openai_daily_usage` POHLED nad účtenkami
 * (`ai_runs` + `ai_logs`). Součet se tím odvozuje z toho, co se zapisuje samo
 * u každého volání, takže na něj nejde zapomenout. Do pohledu se nezapisuje;
 * kdo přidá nové volání OpenAI, musí jen zapsat účtenku do jedné z těch dvou
 * tabulek, což už dělá.
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
