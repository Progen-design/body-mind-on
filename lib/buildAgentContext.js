/**
 * Build structured context for an agent: user data, plans, memory, extra input.
 * Context profile can be driven by DB (ai_context_profiles) or by slug/profile slug.
 * When context_profile_slug is set on agent (from ai_agents), use it to decide what to load.
 * See docs/AI_ARCHITECTURE_REFACTOR_ANALYSIS.md
 */
import { supabaseServer } from './supabaseServer';
import { analyzeUserProgress } from './analyzeUserProgress';
import { getAIRuntimeCapabilities } from './aiRuntimeCapabilities';

const MAX_PLANS = 3;
const MAX_MEMORY_RECORDS = 5;
const MAX_CHECKINS = 2;
const MAX_PLAN_HTML_CHARS = 12000;

function truncatePlanHtml(planHtml) {
  if (!planHtml || typeof planHtml !== 'string') return planHtml ?? null;
  if (planHtml.length <= MAX_PLAN_HTML_CHARS) return planHtml;
  return `${planHtml.slice(0, MAX_PLAN_HTML_CHARS)}\n<!-- truncated_for_ai_context -->`;
}

/** Resolve which context branch to use: DB profile slug or legacy agent slug. */
function resolveContextBranch(profileSlugOrAgentSlug, agentSlugHint) {
  const s = (profileSlugOrAgentSlug || agentSlugHint || '').toLowerCase().trim();
  if (s === 'trainer_coach' || s === 'trainer' || s === 'coach') return 'trainer_coach';
  if (s === 'marketing') return 'marketing';
  if (s === 'social') return 'social';
  if (s === 'validator' || s === 'nutrition_validator' || s === 'training_validator') return 'validator';
  return s || null;
}

/**
 * Build context for an agent. First arg can be context_profile_slug (from DB) or agent_slug.
 * @param {string} profileSlugOrAgentSlug - from ai_agents.context_profile_slug or agent slug
 * @param {string|null} userId
 * @param {object} extraInput
 * @param {string} [agentSlugHint] - agent slug (for memory query and when first arg is profile slug)
 */
export async function buildAgentContext(profileSlugOrAgentSlug, userId, extraInput = {}, agentSlugHint = null) {
  const agentSlug = agentSlugHint || profileSlugOrAgentSlug;
  const branch = resolveContextBranch(profileSlugOrAgentSlug, agentSlug);

  const base = {
    agent_slug: agentSlug,
    user_context: {},
    extra_input: extraInput,
    runtime_capabilities: getAIRuntimeCapabilities(),
  };

  if (!branch) return base;

  if (branch === 'trainer_coach') {
    if (userId) {
      const [metricsRes, plansRes, memoryRes, progressResult] = await Promise.all([
        supabaseServer
          .from('body_metrics')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseServer
          .from('ai_generated_plans')
          .select('plan_html, plan_type, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(MAX_PLANS),
        supabaseServer
          .from('user_ai_memory')
          .select('memory_type, content, created_at')
          .eq('user_id', userId)
          .eq('agent_slug', agentSlug || 'trainer')
          .order('created_at', { ascending: false })
          .limit(MAX_MEMORY_RECORDS),
        analyzeUserProgress(userId),
      ]);

      const plans = (plansRes?.data ?? []).map((p) => ({
        ...p,
        plan_html: truncatePlanHtml(p.plan_html),
      }));
      const progress = progressResult ?? {};
      const recentCheckins = (progress.recent_checkins ?? []).slice(0, MAX_CHECKINS);

      base.user_context = {
        body_metrics: metricsRes?.data ?? null,
        latest_plan: plans[0] ?? null,
        previous_plans: plans.slice(1, MAX_PLANS),
        user_ai_memory: (memoryRes?.data ?? []).map((r) => ({
          type: r.memory_type,
          content: r.content,
          at: r.created_at,
        })),
        user_checkins: recentCheckins,
        progress_analysis: {
          weight_change: progress.weight_change ?? null,
          adherence_score: progress.adherence_score ?? null,
          stress_level: progress.stress_level ?? null,
          recommendation_hint: progress.recommendation_hint ?? null,
        },
      };
    } else {
      base.user_context = {
        body_metrics: null,
        latest_plan: null,
        previous_plans: [],
        user_ai_memory: [],
        user_checkins: [],
        progress_analysis: {
          weight_change: null,
          adherence_score: null,
          stress_level: null,
          recommendation_hint: null,
        },
      };
    }
    return base;
  }

  if (branch === 'marketing') {
    base.user_context = {
      campaign_context: {
        campaign_input: extraInput.campaign_input ?? extraInput,
        target_audience: extraInput.target_audience ?? null,
      },
    };
    return base;
  }

  if (branch === 'social') {
    base.user_context = {
      campaign_context: {
        campaign_theme: extraInput.campaign_theme ?? null,
        product: extraInput.product ?? null,
        target_audience: extraInput.target_audience ?? null,
        platform: extraInput.platform ?? null,
      },
    };
    return base;
  }

  if (branch === 'validator') {
    if (userId) {
      const [metricsRes, plansRes] = await Promise.all([
        supabaseServer
          .from('body_metrics')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseServer
          .from('ai_generated_plans')
          .select('plan_html, plan_type, valid_from, valid_until')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      base.user_context = {
        body_metrics: metricsRes?.data ?? null,
        latest_plan: plansRes?.data ? { ...plansRes.data, plan_html: truncatePlanHtml(plansRes.data.plan_html) } : null,
        plan_to_validate: extraInput.plan_html ?? extraInput.plan_html ?? null,
      };
    } else {
      base.user_context = {
        body_metrics: null,
        latest_plan: null,
        plan_to_validate: extraInput.plan_html ?? null,
      };
    }
    return base;
  }

  return base;
}
