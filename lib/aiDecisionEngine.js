/**
 * AI Decision Engine = missing autonomy layer.
 *
 * Agents do not act randomly. All autonomous reactions are converted into
 * structured decisions, then into ai_tasks, and finally executed by scheduler.
 * Flow: decisions -> ai_tasks -> runAIScheduler -> runAgent.
 *
 * This keeps behavior predictable and scalable while preserving existing planner flow.
 */
import { supabaseServer } from './supabaseServer';
import { analyzeUserProgress } from './analyzeUserProgress';

const RECENT_PLAN_DAYS = 10;
const TRAINER_PLAN_COOLDOWN_DAYS = 5;

function buildDecision(agent_slug, task_type, reason, prompt, extraPayload = {}) {
  return {
    agent_slug,
    task_type,
    reason,
    payload: {
      prompt,
      ...extraPayload,
    },
  };
}

function buildEventPayload(eventContext) {
  if (!eventContext || typeof eventContext !== 'object') return {};
  return {
    event_context: {
      event_type: eventContext.event_type ?? null,
      payload: eventContext.payload ?? null,
    },
  };
}

function isRecentIsoDate(isoString, days) {
  if (!isoString) return false;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return false;
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= threshold;
}

/**
 * Evaluate current user state and produce deterministic AI task decisions.
 * @param {string} userId
 * @returns {Promise<{
 *   userId: string,
 *   goal: string | null,
 *   has_plan: boolean,
 *   progress_analysis: object,
 *   decisions: Array<{ agent_slug: string, task_type: string, reason: string, payload: object }>
 * }>}
 */
export async function evaluateUserState(userId, options = {}) {
  const eventPayload = buildEventPayload(options?.eventContext);
  if (!userId) {
    return {
      userId,
      goal: null,
      has_plan: false,
      progress_analysis: {
        weight_change: null,
        adherence_score: null,
        stress_level: null,
        recommendation_hint: null,
      },
      decisions: [],
    };
  }

  const [metricsRes, latestPlanRes, sharedFactsRes, progress] = await Promise.all([
    supabaseServer
      .from('body_metrics')
      .select('goal, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseServer
      .from('ai_generated_plans')
      .select('id, is_active, created_at, valid_until')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseServer
      .from('user_ai_memory')
      .select('memory_type, content, created_at')
      .eq('user_id', userId)
      .ilike('memory_type', 'shared%')
      .order('created_at', { ascending: false })
      .limit(1),
    analyzeUserProgress(userId),
  ]);

  const goal = metricsRes?.data?.goal ?? null;
  const latestPlan = latestPlanRes?.data ?? null;
  const sharedFact = sharedFactsRes?.data?.[0] ?? null;
  const progress_analysis = progress ?? {
    weight_change: null,
    adherence_score: null,
    stress_level: null,
    recommendation_hint: null,
  };

  const hasActivePlan = Boolean(latestPlan?.is_active);
  const hasRecentPlan = isRecentIsoDate(latestPlan?.created_at, RECENT_PLAN_DAYS);
  const hasVeryRecentPlan = isRecentIsoDate(latestPlan?.created_at, TRAINER_PLAN_COOLDOWN_DAYS);
  const hasPlan = hasActivePlan || hasRecentPlan;

  const decisions = [];

  // Rule 1: missing active/recent plan -> initial trainer plan
  if (!hasPlan) {
    decisions.push(
      buildDecision(
        'trainer',
        'initial_plan',
        'missing_plan',
        'Vygeneruj první personalizovaný plán pro uživatele.',
        { goal, shared_fact: sharedFact?.content ?? null, ...eventPayload }
      )
    );
  }

  const hint = progress_analysis?.recommendation_hint ?? null;

  // Rule 2: fat loss stagnation -> adjust trainer plan
  if (hint === 'fat_loss_not_working' && !hasVeryRecentPlan) {
    decisions.push(
      buildDecision(
        'trainer',
        'adjust_plan',
        'weight_stagnation_detected',
        'Uprav plán podle stagnace váhy a aktuálního kontextu uživatele.',
        { goal, shared_fact: sharedFact?.content ?? null, ...eventPayload }
      )
    );
  }

  // Rule 3: low adherence -> coach motivation
  if (hint === 'low_adherence') {
    decisions.push(
      buildDecision(
        'coach',
        'motivation_message',
        'low_adherence_detected',
        'Vytvoř krátkou motivační zprávu a doporuč zjednodušení režimu.',
        { goal, shared_fact: sharedFact?.content ?? null, ...eventPayload }
      )
    );
  }

  // Rule 4: high stress -> trainer reduction + coach recovery
  if (hint === 'reduce_training_load') {
    if (!hasVeryRecentPlan) {
      decisions.push(
        buildDecision(
          'trainer',
          'reduce_training_load',
          'high_stress_detected',
          'Uprav plán se sníženým objemem tréninku a větším důrazem na regeneraci.',
          { goal, shared_fact: sharedFact?.content ?? null, ...eventPayload }
        )
      );
    }
    decisions.push(
      buildDecision(
        'coach',
        'recovery_message',
        'high_stress_detected',
        'Vytvoř krátkou podpůrnou zprávu zaměřenou na regeneraci, spánek a snížení stresu.',
        { goal, shared_fact: sharedFact?.content ?? null, ...eventPayload }
      )
    );
  }

  // Rule 5: good progress -> optional positive reinforcement
  if (hint === 'fat_loss_progress_good') {
    decisions.push(
      buildDecision(
        'coach',
        'positive_reinforcement',
        'progress_good',
        'Pochval uživatele za dobrý progres a podpoř pokračování.',
        { goal, shared_fact: sharedFact?.content ?? null, ...eventPayload }
      )
    );
  }

  return {
    userId,
    goal,
    has_plan: hasPlan,
    last_plan_age_days:
      latestPlan?.created_at
        ? Math.floor((Date.now() - new Date(latestPlan.created_at).getTime()) / (24 * 60 * 60 * 1000))
        : null,
    progress_analysis,
    decisions,
  };
}
