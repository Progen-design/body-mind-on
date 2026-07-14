import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import DailyCheckinPanel from './DailyCheckinPanel';
import BetaFeedbackButton from './BetaFeedbackButton';
import {
  HabitUiCard,
  HabitUiCheckboxRow,
  HabitUiProgressBar,
} from '../habit/HabitUiPrimitives';

function mealKey(meal, index) {
  const type = String(meal?.type || meal?.meal_type || `meal_${index}`).toLowerCase();
  return type.slice(0, 80);
}

/**
 * Sekce „Dnes“ — dokončování jídel a tréninku, progress, check-in.
 * Návyky jsou pouze v sekci Denní návyky (habit_logs), ne zde.
 */
export default function BetaTodaySection({
  planId = null,
  planDay = 0,
  meals = [],
  hasWorkout = false,
  feedbackContext = 'daily_use',
  onCompletionsChange = null,
}) {
  const [completions, setCompletions] = useState([]);
  const [optimistic, setOptimistic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingKeys, setPendingKeys] = useState(new Set());
  const [errorMsg, setErrorMsg] = useState(null);

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
    loadCompletions();
  }, [loadCompletions]);

  const effectiveCompletions = optimistic ?? completions;

  const completedSet = useMemo(() => {
    const s = new Set();
    for (const c of effectiveCompletions) {
      s.add(`${c.activity_type}:${c.activity_key}`);
    }
    return s;
  }, [effectiveCompletions]);

  const totalActivities = meals.length + (hasWorkout ? 1 : 0);
  const doneCount = useMemo(() => {
    let n = 0;
    meals.forEach((m, i) => {
      if (completedSet.has(`meal:${mealKey(m, i)}`)) n += 1;
    });
    if (hasWorkout && completedSet.has('workout:plan_day')) n += 1;
    return n;
  }, [meals, hasWorkout, completedSet]);

  const workoutCompleted = hasWorkout && completedSet.has('workout:plan_day');

  useEffect(() => {
    onCompletionsChange?.({
      doneCount,
      totalActivities,
      workoutCompleted,
      completions: effectiveCompletions,
    });
  }, [doneCount, totalActivities, workoutCompleted, effectiveCompletions, onCompletionsChange]);

  const applyOptimisticToggle = (activityType, activityKey, wasCompleted) => {
    const base = optimistic ?? completions;
    const key = `${activityType}:${activityKey}`;
    if (wasCompleted) {
      return base.filter((c) => `${c.activity_type}:${c.activity_key}` !== key);
    }
    return [...base, { activity_type: activityType, activity_key: activityKey, completed_at: new Date().toISOString() }];
  };

  const toggleActivity = async (activityType, activityKey, completed) => {
    const pendingKey = `${activityType}:${activityKey}`;
    if (pendingKeys.has(pendingKey)) return;

    setErrorMsg(null);
    setOptimistic(applyOptimisticToggle(activityType, activityKey, completed));
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
          action: completed ? 'uncomplete' : 'complete',
          activity_type: activityType,
          activity_key: activityKey,
          plan_id: planId,
          plan_day: planDay,
          source_component: 'BetaTodaySection',
        }),
      });
      if (!res.ok) throw new Error('api_failed');
      const json = await res.json().catch(() => ({}));
      if (!json.ok) throw new Error('api_failed');
      setCompletions((prev) => applyOptimisticToggle(activityType, activityKey, completed));
      setOptimistic(null);
    } catch {
      setOptimistic(null);
      await loadCompletions();
      setErrorMsg('Změnu se nepodařilo uložit. Zkus to znovu.');
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });
    }
  };

  if (loading && totalActivities === 0) return null;

  return (
    <HabitUiCard as="section" aria-labelledby="beta-today-heading" className="beta-today-section">
      <div className="habit-ui-card-header">
        <h2 id="beta-today-heading" className="habit-ui-card-title">Dnes</h2>
        {totalActivities > 0 ? <HabitUiProgressBar done={doneCount} total={totalActivities} /> : null}
      </div>

      {errorMsg ? (
        <p className="beta-today-error" role="alert">{errorMsg}</p>
      ) : null}

      {meals.length > 0 && (
        <div className="habit-ui-group">
          <h3 className="habit-ui-group-title">Jídla</h3>
          <ul className="habit-ui-list">
            {meals.map((meal, i) => {
              const key = mealKey(meal, i);
              const done = completedSet.has(`meal:${key}`);
              const pending = pendingKeys.has(`meal:${key}`);
              const label = meal?.display_name_cs || meal?.name_cs || meal?.type || `Jídlo ${i + 1}`;
              return (
                <li key={key}>
                  <HabitUiCheckboxRow
                    checked={done}
                    pending={pending}
                    emoji="🍽️"
                    label={label}
                    onToggle={() => toggleActivity('meal', key, done)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasWorkout && (
        <div className="habit-ui-group">
          <h3 className="habit-ui-group-title">Trénink</h3>
          <HabitUiCheckboxRow
            checked={workoutCompleted}
            pending={pendingKeys.has('workout:plan_day')}
            emoji="🏋️"
            label="Dokončil/a jsem dnešní trénink"
            onToggle={() => toggleActivity('workout', 'plan_day', workoutCompleted)}
          />
        </div>
      )}

      <DailyCheckinPanel />

      <div className="beta-today-feedback-row">
        <BetaFeedbackButton context={feedbackContext} />
      </div>

      <style jsx>{`
        .beta-today-section { margin: 0 0 1.25rem; }
        .beta-today-error {
          margin: 0 0 0.5rem;
          font-size: 0.85rem;
          color: #fca5a5;
        }
        .beta-today-feedback-row {
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </HabitUiCard>
  );
}
