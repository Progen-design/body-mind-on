/**
 * Mapování legacy agent slugů na kanonické názvy (bez DB migrace).
 * Produkcí stále používá trainer/coach v ai_tasks — canonical jen pro logy/dokumentaci.
 */

export const LEGACY_AGENT_SLUG_TRAINER = 'trainer';
export const LEGACY_AGENT_SLUG_COACH = 'coach';

export const CANONICAL_AGENT_SLUG_PLAN_GENERATOR = 'plan_generator';
export const CANONICAL_AGENT_SLUG_COACH = 'coach';

export const LEGACY_TASK_INITIAL_PLAN = 'initial_plan';
export const CANONICAL_TASK_INITIAL_PLAN = 'initial_plan';

/** @param {string|null|undefined} legacySlug */
export function canonicalAgentSlug(legacySlug) {
  const s = String(legacySlug || '').trim().toLowerCase();
  if (s === LEGACY_AGENT_SLUG_TRAINER) return CANONICAL_AGENT_SLUG_PLAN_GENERATOR;
  if (s === LEGACY_AGENT_SLUG_COACH) return CANONICAL_AGENT_SLUG_COACH;
  return s || null;
}

export const AGENT_SLUG_DOCUMENTATION = Object.freeze({
  [LEGACY_AGENT_SLUG_TRAINER]: {
    canonical: CANONICAL_AGENT_SLUG_PLAN_GENERATOR,
    note: 'Legacy ai_tasks.agent_slug; orchestrace přes unifiedPlanPipeline, ne přímý OpenAI trainer.',
  },
  [LEGACY_AGENT_SLUG_COACH]: {
    canonical: CANONICAL_AGENT_SLUG_COACH,
    note: 'OpenAI coach onboarding_message + cron fallback.',
  },
});
