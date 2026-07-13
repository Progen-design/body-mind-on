/** Server-side allowlist for product funnel events. */

export const PRODUCT_EVENT_NAMES = Object.freeze([
  'onboarding_started',
  'onboarding_completed',
  'plan_generation_started',
  'plan_generation_completed',
  'plan_generation_failed',
  'plan_viewed',
  'daily_plan_viewed',
  'meal_completed',
  'workout_completed',
  'habit_completed',
  'meal_replaced',
  'daily_checkin_completed',
  'feedback_submitted',
  'paywall_viewed',
  'checkout_started',
  'subscription_activated',
]);

export const ANONYMOUS_ALLOWED_EVENTS = Object.freeze([
  'onboarding_started',
  'paywall_viewed',
]);

export const BETA_FEEDBACK_CONTEXTS = Object.freeze([
  'onboarding',
  'first_plan',
  'meal_plan',
  'workout_plan',
  'daily_use',
  'general',
]);

export const BETA_FEEDBACK_CATEGORIES = Object.freeze([
  'confusing',
  'unrealistic',
  'missing_feature',
  'technical_problem',
  'useful',
  'other',
]);

export const CHECKIN_RATINGS = Object.freeze(['great', 'good', 'partial', 'none']);

export const CHECKIN_BLOCKERS = Object.freeze([
  'no_time',
  'food_mismatch',
  'workout_too_hard',
  'workout_too_easy',
  'no_motivation',
  'technical_problem',
  'other',
]);

export const CHECKIN_RATING_SCORE = Object.freeze({
  great: 4,
  good: 3,
  partial: 2,
  none: 1,
});

export function isAllowedProductEvent(name) {
  return PRODUCT_EVENT_NAMES.includes(String(name || '').trim());
}

export function isAnonymousAllowedEvent(name) {
  return ANONYMOUS_ALLOWED_EVENTS.includes(String(name || '').trim());
}
