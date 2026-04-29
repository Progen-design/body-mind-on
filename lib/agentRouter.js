/**
 * AI routing: map action to agent slug and delegate to runAgent().
 *
 * DŮLEŽITÉ: action === 'generate_plan' NESMÍ volat runAgent — pouze runUnifiedPlanPipeline
 * (Chat Completions v planOrchestrator → Spoonacular → wger). Hodnota agentSlug: 'trainer' v odpovědi
 * je jen produktová / historická nálepka pro klienty API, ne skutečný běh trainer agenta přes Responses API.
 *
 * Ostatní akce (coach, marketing, social): runAgent → OpenAI Responses API, json_object.
 *
 * generate_plan → rawContent je JSON string objektu:
 * { ok, planHtml, planJson, valid_from, valid_until, generation_source, validation?, _diagnostics? }
 */
import { runAgent } from './runAgent';
import { runUnifiedPlanPipeline } from './unifiedPlanPipeline';
import { supabaseServer } from './supabaseServer';
import { getOpenAiPlanModel } from './openaiModels';

/**
 * action → agent_slug pro runAgent.
 * Pozn.: generate_plan je v routeAIRequest vyřešen zvlášť (unified pipeline); 'trainer' zde držíme jen kvůli
 * přehlednosti mapy — samotné generate_plan tuto větev nevolí (breaking change pro externí klienty nechceme).
 */
const ACTION_TO_AGENT = {
  generate_plan: 'trainer',
  progress_question: 'coach',
  marketing_text: 'marketing',
  social_post: 'social',
};

async function resolveBodyMetricsForPlan(userId, payload = {}) {
  const direct = payload?.bm ?? payload?.body_metrics;
  if (direct && typeof direct === 'object') {
    const uid = userId ?? direct.user_id ?? null;
    return { ...direct, ...(uid ? { user_id: uid } : {}) };
  }
  if (!userId) {
    throw new Error('generate_plan vyžaduje userId nebo payload.bm / payload.body_metrics');
  }
  const { data: rows, error } = await supabaseServer
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`body_metrics: ${error.message}`);
  if (!rows?.length) throw new Error('Žádné body_metrics pro uživatele — doplň profil nebo pošli payload.bm');
  return { ...rows[0], user_id: userId };
}

/**
 * Route a request to the appropriate AI agent and return the result.
 * @param {string} action - e.g. 'generate_plan', 'progress_question', 'marketing_text', 'social_post'
 * @param {{ userId?: string | null, payload?: object }} options
 * @returns {Promise<{ rawContent: string, agentSlug: string, model: string }>}
 * @throws {Error} if action is unknown or runAgent fails
 */
export async function routeAIRequest(action, { userId = null, payload = {} } = {}) {
  if (action === 'generate_plan') {
    const bm = await resolveBodyMetricsForPlan(userId, payload);
    const useOpenAI = payload?.useOpenAI !== false;
    const pipeline = await runUnifiedPlanPipeline({
      bm,
      useOpenAI,
      validFrom: payload?.validFrom ?? payload?.valid_from ?? null,
      validUntil: payload?.validUntil ?? payload?.valid_until ?? null,
      mealsOnly: payload?.mealsOnly === true,
    });
    if (!pipeline?.ok) {
      throw new Error(pipeline?.error || 'Unified plan pipeline failed');
    }
    const out = {
      ok: true,
      planHtml: pipeline.planHtml ?? null,
      planJson: pipeline.planJson ?? null,
      valid_from: pipeline.valid_from ?? null,
      valid_until: pipeline.valid_until ?? null,
      generation_source: pipeline.generation_source ?? null,
      validation: pipeline.validation ?? null,
      _diagnostics: pipeline._diagnostics ?? null,
    };
    return {
      rawContent: JSON.stringify(out),
      agentSlug: 'trainer',
      model: `unified-pipeline+${getOpenAiPlanModel()}`,
    };
  }

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
