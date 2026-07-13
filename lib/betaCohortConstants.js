/** Closed beta cohort constants. */

export const COHORT_STATUSES = Object.freeze([
  'draft', 'recruiting', 'active', 'analyzing', 'completed', 'canceled', 'paused',
]);

export const PARTICIPANT_STATUSES = Object.freeze([
  'invited', 'registered', 'onboarding', 'active', 'completed', 'dropped', 'excluded',
]);

export const SESSION_MODES = Object.freeze(['remote', 'in_person', 'unmoderated']);

export const SESSION_STATUSES = Object.freeze([
  'planned', 'confirmed', 'completed', 'no_show', 'canceled',
]);

export const ISSUE_CATEGORIES = Object.freeze([
  'onboarding', 'plan_generation', 'meal_plan', 'workout_plan', 'daily_use',
  'feedback', 'technical', 'trust', 'content', 'other',
]);

export const ISSUE_SEVERITIES = Object.freeze(['blocker', 'high', 'medium', 'low']);

export const ISSUE_STATUSES = Object.freeze([
  'open', 'investigating', 'planned', 'fixed', 'accepted', 'rejected',
]);

export const BETA_TERMS_VERSION = '2026-07-cohort-1';

export const DEFAULT_BETA_COHORT_CODE = 'START-C1';

export const DIRECT_BETA_SOURCE = 'direct_beta_link';

export const COHORT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
