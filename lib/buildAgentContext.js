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

export async function buildAgentContext(agentSlug, userId, extraInput = {}) {
  const base = {
    agent_slug: agentSlug,
    user_context: {},
    extra_input: extraInput,
  };

  if (!agentSlug) return base;

  // Trainer & coach: body_metrics, latest plan, user_ai_memory
  if (agentSlug === 'trainer' || agentSlug === 'coach') {
    if (userId) {
      const [metricsRes, plansRes, memoryRes] = await Promise.all([
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
          .limit(1)
          .maybeSingle(),
        supabaseServer
          .from('user_ai_memory')
          .select('memory_type, content, created_at')
          .eq('user_id', userId)
          .eq('agent_slug', agentSlug)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      base.user_context = {
        body_metrics: metricsRes?.data ?? null,
        latest_plan: plansRes?.data ?? null,
        user_ai_memory: (memoryRes?.data ?? []).map((r) => ({
          type: r.memory_type,
          content: r.content,
          at: r.created_at,
        })),
      };
    } else {
      base.user_context = { body_metrics: null, latest_plan: null, user_ai_memory: [] };
    }
    return base;
  }

  // Marketing / social: for now only extraInput; TODO load campaign/brand voice, content calendar
  if (agentSlug === 'marketing' || agentSlug === 'social') {
    base.user_context = {};
    return base;
  }

  return base;
}
