/**
 * Idempotent beta participant milestone updates (server-side only).
 */
import { supabaseServer } from './supabaseServer';
import { calendarDateIsoInPrague } from './czechCalendar';

/**
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getActiveParticipant(userId) {
  if (!userId) return null;
  const { data, error } = await supabaseServer.rpc('get_beta_participant_for_user', {
    p_user_id: userId,
  });
  if (error || !data?.found) return null;
  return {
    id: data.id,
    cohort_id: data.cohort_id,
    cohort_code: data.cohort_code || null,
    cohort_name: data.cohort_name || null,
    cohort_status: data.cohort_status || null,
    registered_at: data.registered_at,
    onboarding_completed_at: data.onboarding_completed_at,
    first_plan_viewed_at: data.first_plan_viewed_at,
    first_action_at: data.first_action_at,
    first_return_at: data.first_return_at,
    status: data.status,
  };
}

/**
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function getCohortCodeForUser(userId) {
  const p = await getActiveParticipant(userId);
  return p?.cohort_code || null;
}

/**
 * @param {string} userId
 * @param {object} patch
 */
async function patchParticipantMilestone(userId, patch) {
  const { error } = await supabaseServer.rpc('patch_beta_participant_milestone', {
    p_user_id: userId,
    p_patch: patch,
  });
  if (error) {
    console.error('[betaParticipantMilestones] update failed');
  }
}

/**
 * @param {string} userId
 */
export async function markOnboardingCompleted(userId) {
  const p = await getActiveParticipant(userId);
  if (!p?.id || p.onboarding_completed_at) return;
  await patchParticipantMilestone(userId, {
    onboarding_completed_at: new Date().toISOString(),
    status: 'active',
  });
}

/**
 * @param {string} userId
 */
export async function markFirstPlanViewed(userId) {
  const p = await getActiveParticipant(userId);
  if (!p?.id || p.first_plan_viewed_at) return;
  await patchParticipantMilestone(userId, {
    first_plan_viewed_at: new Date().toISOString(),
    status: p.status === 'registered' || p.status === 'onboarding' ? 'active' : p.status,
  });
}

/**
 * @param {string} userId
 */
export async function markFirstAction(userId) {
  const p = await getActiveParticipant(userId);
  if (!p?.id || p.first_action_at) return;
  await patchParticipantMilestone(userId, {
    first_action_at: new Date().toISOString(),
    status: 'active',
  });
}

/**
 * @param {string} userId
 */
export async function markFirstReturn(userId) {
  const p = await getActiveParticipant(userId);
  if (!p?.id || p.first_return_at) return;
  const registeredDay = p.registered_at
    ? calendarDateIsoInPrague(new Date(p.registered_at))
    : null;
  const today = calendarDateIsoInPrague();
  if (!registeredDay || registeredDay === today) return;
  await patchParticipantMilestone(userId, {
    first_return_at: new Date().toISOString(),
  });
}

/**
 * Call on any meaningful daily activity for return tracking.
 * @param {string} userId
 */
export async function markActivityDay(userId) {
  await markFirstReturn(userId);
}
