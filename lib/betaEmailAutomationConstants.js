/** Beta lifecycle email automation constants. */

export const BETA_EMAIL_TRIGGERS = Object.freeze([
  'beta_welcome',
  'beta_plan_ready',
  'beta_no_plan_view_24h',
  'beta_no_first_action_48h',
  'beta_day3_feedback',
  'beta_day7_feedback',
]);

export const BETA_EMAIL_COHORT_CODE = 'START-C1';

export const BETA_EMAIL_MAX_PER_7_DAYS = 5;
export const BETA_EMAIL_MIN_HOURS_BETWEEN = 24;
export const BETA_EMAIL_DISPATCH_BATCH = 20;
export const BETA_EMAIL_MAX_ATTEMPTS = 3;
export const BETA_EMAIL_STALE_PROCESSING_MINUTES = 15;

export const BETA_EMAIL_QUIET_START_HOUR = 21;
export const BETA_EMAIL_QUIET_END_HOUR = 8;

export const BETA_EMAIL_MS_24H = 24 * 60 * 60 * 1000;
export const BETA_EMAIL_MS_48H = 48 * 60 * 60 * 1000;
