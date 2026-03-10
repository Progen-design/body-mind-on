/**
 * AI Decision Engine: produces AI task decisions from user state.
 * Trigger rules are DB-driven (ai_trigger_rules) with hardcoded fallback.
 * Flow: event -> decisions -> ai_tasks -> runAIScheduler -> runAgent.
 * See docs/AI_ARCHITECTURE_REFACTOR_ANALYSIS.md
 */
import { supabaseServer } from './supabaseServer';
import { analyzeUserProgress } from './analyzeUserProgress';

const RECENT_PLAN_DAYS = 10;
const TRAINER_PLAN_COOLDOWN_DAYS = 5;

const DEFAULT_PROMPTS = {
  'trainer:initial_plan': 'Vygeneruj první personalizovaný plán pro uživatele.',
  'trainer:adjust_plan': 'Uprav plán podle stagnace váhy a aktuálního kontextu uživatele.',
  'trainer:reduce_training_load': 'Uprav plán se sníženým objemem tréninku a větším důrazem na regeneraci.',
  'coach:motivation_message': 'Vytvoř krátkou motivační zprávu a doporuč zjednodušení režimu.',
  'coach:recovery_message': 'Vytvoř krátkou podpůrnou zprávu zaměřenou na regeneraci, spánek a snížení stresu.',
  'coach:positive_reinforcement': 'Pochval uživatele za dobrý progres a podpoř pokračování.',
};

function buildDecision(agent_slug, task_type, reason, prompt, extraPayload = {}) {
  return {
    agent_slug,
    task_type,
    reason,
    payload: {
      prompt: prompt || DEFAULT_PROMPTS[`${agent_slug}:${task_type}`] || '',
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

/** Build state flags for trigger matching. */
function buildTriggerState(hasPlan, hasVeryRecentPlan, hint, eventType) {
  return {
    missing_plan: !hasPlan,
    user_registered: eventType === 'user_registered',
    weight_stagnation: hint === 'fat_loss_not_working',
    weight_stagnation_value: hint === 'fat_loss_not_working' ? 'fat_loss_not_working' : null,
    low_adherence: hint === 'low_adherence',
    high_stress: hint === 'reduce_training_load',
    high_stress_value: hint === 'reduce_training_load' ? 'reduce_training_load' : null,
    progress_good: hint === 'fat_loss_progress_good',
    progress_good_value: hint === 'fat_loss_progress_good' ? 'fat_loss_progress_good' : null,
  };
}

/** Hardcoded decisions (used when DB has no rules or as fallback). */
function getHardcodedDecisions(state, basePayload) {
  const decisions = [];
  if (state.missing_plan) {
    decisions.push(
      buildDecision('trainer', 'initial_plan', 'missing_plan', DEFAULT_PROMPTS['trainer:initial_plan'], basePayload)
    );
  }
  if (state.weight_stagnation && !state.hasVeryRecentPlan) {
    decisions.push(
      buildDecision('trainer', 'adjust_plan', 'weight_stagnation_detected', DEFAULT_PROMPTS['trainer:adjust_plan'], basePayload)
    );
  }
  if (state.low_adherence) {
    decisions.push(
      buildDecision('coach', 'motivation_message', 'low_adherence_detected', DEFAULT_PROMPTS['coach:motivation_message'], basePayload)
    );
  }
  if (state.high_stress) {
    decisions.push(
      buildDecision('trainer', 'reduce_training_load', 'high_stress_detected', DEFAULT_PROMPTS['trainer:reduce_training_load'], basePayload)
    );
    decisions.push(
      buildDecision('coach', 'recovery_message', 'high_stress_detected', DEFAULT_PROMPTS['coach:recovery_message'], basePayload)
    );
  }
  if (state.progress_good) {
    decisions.push(
      buildDecision('coach', 'positive_reinforcement', 'progress_good', DEFAULT_PROMPTS['coach:positive_reinforcement'], basePayload)
    );
  }
  return decisions;
}

/** Load enabled trigger rules from DB. Returns [] on error or missing table. */
async function loadTriggerRules() {
  try {
    const { data, error } = await supabaseServer
      .from('ai_trigger_rules')
      .select('trigger_type, trigger_value, agent_slug, task_type, priority, conditions_json')
      .eq('enabled', true)
      .order('priority', { ascending: true });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

/** Check if a rule matches current trigger state. */
function ruleMatches(rule, state) {
  const triggerType = rule.trigger_type;
  if (!triggerType) return false;
  const stateValue = state[`${triggerType}_value`] ?? state[triggerType];
  const active = triggerType === 'missing_plan' ? state.missing_plan
    : triggerType === 'user_registered' ? state.user_registered
    : triggerType === 'weight_stagnation' ? state.weight_stagnation
    : triggerType === 'low_adherence' ? state.low_adherence
    : triggerType === 'high_stress' ? state.high_stress
    : triggerType === 'progress_good' ? state.progress_good
    : false;
  if (!active) return false;
  if (rule.trigger_value == null || rule.trigger_value === '') return true;
  return rule.trigger_value === stateValue;
}

/**
 * Evaluate current user state and produce AI task decisions.
 * Uses ai_trigger_rules when available; otherwise hardcoded rules.
 */
export async function evaluateUserState(userId, options = {}) {
  const eventPayload = buildEventPayload(options?.eventContext);
  const eventType = options?.eventContext?.event_type ?? null;

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

  const [metricsRes, latestPlanRes, sharedFactsRes, progress, dbRules] = await Promise.all([
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
    loadTriggerRules(),
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
  const hint = progress_analysis?.recommendation_hint ?? null;

  const basePayload = {
    goal,
    shared_fact: sharedFact?.content ?? null,
    ...eventPayload,
  };

  const state = {
    ...buildTriggerState(hasPlan, hasVeryRecentPlan, hint, eventType),
    hasVeryRecentPlan,
  };

  let decisions = [];

  if (dbRules.length > 0) {
    const seen = new Set();
    for (const rule of dbRules) {
      if (!ruleMatches(rule, state)) continue;
      const key = `${rule.agent_slug}:${rule.task_type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const prompt = rule.conditions_json?.prompt ?? DEFAULT_PROMPTS[key] ?? '';
      decisions.push(
        buildDecision(
          rule.agent_slug,
          rule.task_type,
          rule.trigger_type,
          prompt,
          basePayload
        )
      );
    }
    if (state.missing_plan && !decisions.some((d) => d.agent_slug === 'trainer' && d.task_type === 'initial_plan')) {
      decisions.unshift(
        buildDecision('trainer', 'initial_plan', 'missing_plan', DEFAULT_PROMPTS['trainer:initial_plan'], basePayload)
      );
    }
  } else {
    decisions = getHardcodedDecisions(state, basePayload);
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
