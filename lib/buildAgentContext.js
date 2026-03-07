/**
 * Build structured context for an agent: user data, plans, memory, extra input.
 * Used by runAgent() to pass into the model (or to build the user message).
 *
 * Future extensions:
 * - marketing: load campaign/brand voice from ai_agent_settings or content CMS
 * - social: load content calendar, brand voice, generate posts/stories/carousels
 * - coach: use check-ins, adherence data, and user_ai_memory for personalized follow-ups
 * - trainer: use richer user_ai_memory and plan history for continuity across weeks
 */
import { supabaseServer } from './supabaseServer';
import { analyzeUserProgress } from './analyzeUserProgress';

// Safe limits for context size (avoid token overflow)
const MAX_PLANS = 3;
const MAX_MEMORY_RECORDS = 5;
const MAX_CHECKINS = 2;

export async function buildAgentContext(agentSlug, userId, extraInput = {}) {
  const base = {
    agent_slug: agentSlug,
    user_context: {},
    extra_input: extraInput,
  };

  if (!agentSlug) return base;

  // Trainer & coach: body_metrics, recent plans, user_ai_memory, check-ins, progress_analysis
  // Trainer agent can adapt macros and training volume based on progress_analysis
  if (agentSlug === 'trainer' || agentSlug === 'coach') {
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
          .eq('agent_slug', agentSlug)
          .order('created_at', { ascending: false })
          .limit(MAX_MEMORY_RECORDS),
        analyzeUserProgress(userId),
      ]);

      const plans = plansRes?.data ?? [];
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

  // Marketing: campaign_input, target audience; future: brand voice table, marketing campaigns
  if (agentSlug === 'marketing') {
    base.user_context = {
      campaign_context: {
        campaign_input: extraInput.campaign_input ?? extraInput,
        target_audience: extraInput.target_audience ?? null,
        // TODO: load brand voice from ai_agent_settings or dedicated brand_voice table
      },
    };
    return base;
  }

  // Social: campaign theme, product, platform; AI output expected: post_text, hashtags, caption, call_to_action
  // Future: social calendar, content calendar, platform-specific templates
  if (agentSlug === 'social') {
    base.user_context = {
      campaign_context: {
        campaign_theme: extraInput.campaign_theme ?? null,
        product: extraInput.product ?? null,
        target_audience: extraInput.target_audience ?? null,
        platform: extraInput.platform ?? null, // e.g. instagram, linkedin, tiktok
      },
    };
    return base;
  }

  return base;
}
