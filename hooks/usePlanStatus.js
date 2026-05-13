import { useMemo } from 'react';
import { getCurrentAndNextPlansFromList } from '../lib/planSelection';

/**
 * Jednotný stav plánu pro profil (shodný s _diagnostics.plan_state z /api/profile).
 * @param {object|null} profile – odpověď z fetchProfile
 * @param {{ loading?: boolean }} [opts]
 */
export function usePlanStatus(profile, opts = {}) {
  const { loading = false } = opts;

  return useMemo(() => {
    if (loading && !profile) {
      return {
        status: 'loading',
        planState: 'loading',
        currentPlan: null,
        nextPlan: null,
        showReadyBanner: false,
      };
    }
    const planState = profile?._diagnostics?.plan_state ?? 'missing';
    const { currentPlan, nextPlan } = getCurrentAndNextPlansFromList(profile?.plans);
    const showReadyBanner =
      planState === 'ready' &&
      !profile?.can_create_calendar_events;

    return {
      status: planState,
      planState,
      currentPlan,
      nextPlan,
      showReadyBanner,
    };
  }, [profile, loading]);
}
