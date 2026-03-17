/**
 * Profile API client – unified fetch for profile data.
 * Used by useProfileData hook for consistent data orchestration.
 */

const FETCH_OPTIONS = { cache: 'no-store' };

/**
 * Normalizes raw API response into profile shape used by the app.
 * @param {Object} data - Raw response from /api/profile
 * @returns {Object} Normalized profile object
 */
export function normalizeProfilePayload(data) {
  const sortedWorkouts = Array.isArray(data.workouts)
    ? [...data.workouts].sort((a, b) => {
        const dateA = (a.workout_date || '').toString();
        const dateB = (b.workout_date || '').toString();
        return dateB.localeCompare(dateA);
      })
    : [];
  const sortedMetrics = Array.isArray(data.body_metrics)
    ? [...data.body_metrics].sort((a, b) => {
        const dateA = (a.created_at || '').toString();
        const dateB = (b.created_at || '').toString();
        return dateB.localeCompare(dateA);
      })
    : [];

  return {
    user: data.user ? { ...data.user } : null,
    body_metrics: sortedMetrics,
    user_habits: Array.isArray(data.user_habits) ? [...data.user_habits] : [],
    workouts: sortedWorkouts,
    plans: Array.isArray(data.plans) ? [...data.plans] : [],
    weight_history: Array.isArray(data.weight_history) ? [...data.weight_history] : [],
    stats: data.stats ? { ...data.stats } : {},
    habit_summary_7d: data.habit_summary_7d ? { ...data.habit_summary_7d } : null,
    program: data.program || 'START',
    membershipStatus: data.membershipStatus || 'active',
    membershipSince: data.membershipSince || null,
    trialEndsAt: data.trialEndsAt || null,
    isTrialExpired: data.isTrialExpired === true,
    daysUntilTrialEnd: data.daysUntilTrialEnd != null ? data.daysUntilTrialEnd : null,
    can_create_calendar_events: data.can_create_calendar_events === true,
    _diagnostics: data._diagnostics && typeof data._diagnostics === 'object' ? { ...data._diagnostics } : undefined,
    _updated: Date.now(),
  };
}

/**
 * Fetches profile data from /api/profile.
 * @param {string} accessToken - Supabase access token
 * @returns {Promise<{ ok: boolean, profile?: Object, error?: string }>}
 */
export async function fetchProfile(accessToken) {
  const res = await fetch(`/api/profile?t=${Date.now()}`, {
    ...FETCH_OPTIONS,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();

  if (data.error) {
    return { ok: false, error: data.error };
  }

  const profile = normalizeProfilePayload(data);
  return { ok: true, profile };
}
