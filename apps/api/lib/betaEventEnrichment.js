/**
 * Server-side cohort attribution for product events — never trust client cohort_code.
 */
import { getCohortCodeForUser } from './betaParticipantMilestones';

/**
 * @param {string|null} userId
 * @param {object} properties
 * @returns {Promise<object>}
 */
export async function enrichEventProperties(userId, properties = {}) {
  const base = properties && typeof properties === 'object' && !Array.isArray(properties)
    ? { ...properties }
    : {};
  if (!userId) return base;
  if (base.cohort_code) delete base.cohort_code;
  const cohortCode = await getCohortCodeForUser(userId);
  if (cohortCode) base.cohort_code = cohortCode;
  return base;
}
