/**
 * lib/onboardingMetrics.js
 * P1 – Onboarding audit trail a metriky.
 * Zapisuje do ai_logs s action='onboarding_complete' pro vyhodnocení:
 * - registration → plan ready rate
 * - AI success vs fallback rate
 * - failed rate
 * - time to plan ready
 */
import { writeAILog } from './aiOps';

/**
 * @param {Object} params
 * @param {string|null} params.userId
 * @param {string|null} params.bodyMetricsId
 * @param {string} params.registrationStartedAt - ISO
 * @param {string} params.registrationCompletedAt - ISO
 * @param {string|null} params.initialPlanTaskId
 * @param {string|null} params.initialPlanTaskCreatedAt - ISO
 * @param {string|null} params.initialPlanTaskCompletedAt - ISO
 * @param {string} params.onboardingResult - ai_success | fallback_success | failed
 * @param {string|null} params.finalPublishSource
 * @param {string|null} params.generationSource
 * @param {boolean} params.lastResortRan
 * @param {boolean} params.lastResortFailed
 * @param {string|null} params.savedPlanId
 * @param {boolean} params.savedPlanExists
 * @param {string} params.planState
 * @param {boolean} params.planSent
 * @param {boolean} params.planPending
 * @param {string} params.finalResponseReason
 */
export async function writeOnboardingEvent(params) {
  const payload = {
    registration_started_at: params.registrationStartedAt ?? null,
    registration_completed_at: params.registrationCompletedAt ?? null,
    initial_plan_task_id: params.initialPlanTaskId ?? null,
    initial_plan_task_created_at: params.initialPlanTaskCreatedAt ?? null,
    initial_plan_task_completed_at: params.initialPlanTaskCompletedAt ?? null,
    plan_ready_at: params.onboardingResult !== 'failed' ? params.registrationCompletedAt : null,
    onboarding_result: params.onboardingResult,
    final_publish_source: params.finalPublishSource ?? null,
    generation_source: params.generationSource ?? null,
    last_resort_ran: params.lastResortRan ?? false,
    last_resort_failed: params.lastResortFailed ?? false,
    saved_plan_id: params.savedPlanId ?? null,
    saved_plan_exists: params.savedPlanExists ?? false,
    plan_state: params.planState ?? null,
    plan_sent: params.planSent ?? false,
    plan_pending: params.planPending ?? false,
    final_response_reason: params.finalResponseReason ?? null,
    body_metrics_id: params.bodyMetricsId ?? null,
  };

  const timeToPlanMs =
    params.registrationStartedAt && params.initialPlanTaskCompletedAt
      ? new Date(params.initialPlanTaskCompletedAt) - new Date(params.registrationStartedAt)
      : null;

  if (timeToPlanMs != null && Number.isFinite(timeToPlanMs)) {
    payload.time_to_plan_ready_ms = timeToPlanMs;
  }

  await writeAILog({
    user_id: params.userId ?? null,
    agent_slug: 'onboarding',
    action: 'registration_complete',
    status: params.onboardingResult === 'failed' ? 'failed' : 'completed',
    message: `onboarding_result=${params.onboardingResult} plan_state=${params.planState}`,
    payload,
  });
}
