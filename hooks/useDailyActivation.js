import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  applyOptimisticToggle,
  completionsToSet,
  mealActivityKey,
} from '../lib/dailyActivationClient';

/**
 * Load + toggle daily meal/workout completions via /api/daily-activation.
 * Workout completion is also derived from get_daily_adherence (Apple Watch / movement).
 */
export function useDailyActivation({ planId, planDay, meals, hasWorkout }) {
  const [completions, setCompletions] = useState([]);
  const [adherence, setAdherence] = useState(null);
  const [optimistic, setOptimistic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adherenceLoading, setAdherenceLoading] = useState(true);
  const [pendingKeys, setPendingKeys] = useState(() => new Set());
  const [errorMsg, setErrorMsg] = useState(null);

  const loadAdherence = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/stats/adherence', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setAdherence(json.adherence || null);
      }
    } catch {
      /* silent */
    } finally {
      setAdherenceLoading(false);
    }
  }, []);

  const loadCompletions = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const q = new URLSearchParams({
        plan_day: String(planDay),
        ...(planId ? { plan_id: planId } : {}),
      });
      const res = await fetch(`/api/daily-activation?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setCompletions(json.completions || []);
        setOptimistic(null);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [planId, planDay]);

  useEffect(() => {
    setLoading(true);
    setAdherenceLoading(true);
    loadCompletions();
    loadAdherence();
  }, [loadCompletions, loadAdherence]);

  const effectiveCompletions = optimistic ?? completions;
  const completedSet = useMemo(
    () => completionsToSet(effectiveCompletions),
    [effectiveCompletions],
  );

  const mealKeys = useMemo(
    () => (meals || []).map((m, i) => mealActivityKey(m, i)),
    [meals],
  );

  const manualWorkoutDone = completedSet.has('workout:plan_day');
  const watchWorkoutDetected = (adherence?.watch_workout_count ?? 0) > 0;
  const treninkSplnen = adherence?.trenink_splnen === true;
  const workoutCompleted = hasWorkout && (treninkSplnen || manualWorkoutDone);
  const workoutAutoFromMovement = treninkSplnen
    && !watchWorkoutDetected
    && !manualWorkoutDone
    && (adherence?.pohyb_min ?? 0) >= 30;

  const totalActivities = mealKeys.length + (hasWorkout ? 1 : 0);
  const doneCount = useMemo(() => {
    let n = 0;
    for (const key of mealKeys) {
      if (completedSet.has(`meal:${key}`)) n += 1;
    }
    if (hasWorkout && workoutCompleted) n += 1;
    return n;
  }, [mealKeys, hasWorkout, workoutCompleted, completedSet]);

  const isMealCompleted = useCallback(
    (meal, index) => completedSet.has(`meal:${mealActivityKey(meal, index)}`),
    [completedSet],
  );

  const isPending = useCallback(
    (activityType, activityKey) => pendingKeys.has(`${activityType}:${activityKey}`),
    [pendingKeys],
  );

  const refreshAfterChange = useCallback(async () => {
    await Promise.all([loadCompletions(), loadAdherence()]);
  }, [loadCompletions, loadAdherence]);

  const toggleActivity = useCallback(async (activityType, activityKey, wasCompleted) => {
    const pendingKey = `${activityType}:${activityKey}`;
    if (pendingKeys.has(pendingKey)) return;

    setErrorMsg(null);
    setOptimistic(applyOptimisticToggle(optimistic ?? completions, activityType, activityKey, wasCompleted));
    setPendingKeys((prev) => new Set(prev).add(pendingKey));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('no_session');
      const res = await fetch('/api/daily-activation', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: wasCompleted ? 'uncomplete' : 'complete',
          activity_type: activityType,
          activity_key: activityKey,
          plan_id: planId,
          plan_day: planDay,
          source_component: 'ProfileTodayPanels',
        }),
      });
      if (!res.ok) throw new Error('api_failed');
      const json = await res.json().catch(() => ({}));
      if (!json.ok) throw new Error('api_failed');
      setCompletions((prev) => applyOptimisticToggle(prev, activityType, activityKey, wasCompleted));
      setOptimistic(null);
      await loadAdherence();
    } catch {
      setOptimistic(null);
      await refreshAfterChange();
      setErrorMsg('Změnu se nepodařilo uložit. Zkus to znovu.');
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });
    }
  }, [pendingKeys, optimistic, completions, planId, planDay, loadAdherence, refreshAfterChange]);

  const toggleMeal = useCallback((meal, index) => {
    const key = mealActivityKey(meal, index);
    const done = completedSet.has(`meal:${key}`);
    return toggleActivity('meal', key, done);
  }, [completedSet, toggleActivity]);

  const toggleWorkout = useCallback(() => {
    return toggleActivity('workout', 'plan_day', manualWorkoutDone);
  }, [toggleActivity, manualWorkoutDone]);

  return {
    loading: loading || adherenceLoading,
    errorMsg,
    doneCount,
    totalActivities,
    workoutCompleted,
    manualWorkoutDone,
    watchWorkoutDetected,
    workoutAutoFromMovement,
    manualWorkoutDone,
    adherence,
    adherenceLoading,
    isMealCompleted,
    isPending,
    toggleMeal,
    toggleWorkout,
    refetchAdherence: loadAdherence,
  };
}
