/**
 * Client helpers for registration funnel product_events (no PII).
 */
import { trackProductEvent, trackProductEventBeacon } from './productAnalytics';

/**
 * @param {number} step 1..5
 * @param {string} program
 * @param {string} source
 */
export function trackOnboardingStepCompleted(step, program, source) {
  return trackProductEvent(
    'onboarding_step_completed',
    { step: Number(step), program: String(program || 'START').toUpperCase() },
    { source, pagePath: typeof window !== 'undefined' ? window.location.pathname : undefined },
  );
}

/**
 * @param {number} step last visible step
 * @param {string} program
 * @param {string} source
 */
export function trackOnboardingAbandoned(step, program, source) {
  return trackProductEventBeacon(
    'onboarding_abandoned',
    { step: Number(step), program: String(program || 'START').toUpperCase() },
    { source, pagePath: typeof window !== 'undefined' ? window.location.pathname : undefined },
  );
}

/**
 * @param {string} program
 * @param {string} source
 */
export function trackRegistrationEmailConflict(program, source) {
  return trackProductEvent(
    'registration_email_conflict',
    { program: String(program || 'START').toUpperCase() },
    { source, pagePath: typeof window !== 'undefined' ? window.location.pathname : undefined },
  );
}

/**
 * @param {string[]} devices e.g. ['scale','watch']
 * @param {string} program
 * @param {string} source
 */
export function trackDeviceInterestSelected(devices, program, source) {
  const list = Array.isArray(devices)
    ? devices.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean)
    : [];
  return trackProductEvent(
    'device_interest_selected',
    { devices: list, program: String(program || 'START').toUpperCase() },
    { source, pagePath: typeof window !== 'undefined' ? window.location.pathname : undefined },
  );
}
