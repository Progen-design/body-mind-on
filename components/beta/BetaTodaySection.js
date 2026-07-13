import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { getHabitDisplayLabel } from '../../lib/habitLabels';
import DailyCheckinPanel from './DailyCheckinPanel';
import BetaFeedbackButton from './BetaFeedbackButton';

function mealKey(meal, index) {
  const type = String(meal?.type || meal?.meal_type || `meal_${index}`).toLowerCase();
  return type.slice(0, 80);
}

/**
 * Sekce „Dnes“ — dokončování aktivit, progress, check-in.
 */
export default function BetaTodaySection({
  planId = null,
  planDay = 0,
  meals = [],
  hasWorkout = false,
  habitIds = [],
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

  const totalActivities = meals.length + (hasWorkout ? 1 : 0) + habitIds.length;
  const doneCount = useMemo(() => {
    let n = 0;
    meals.forEach((m, i) => {
      if (completedSet.has(`meal:${mealKey(m, i)}`)) n += 1;
    });
    if (hasWorkout && completedSet.has('workout:plan_day')) n += 1;
    habitIds.forEach((hid) => {
      if (completedSet.has(`habit:${hid}`)) n += 1;
    });
    return n;
  }, [meals, hasWorkout, habitIds, completedSet]);

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
    <section className="beta-today-section" aria-labelledby="beta-today-heading">
      <div className="beta-today-header">
        <h2 id="beta-today-heading" className="beta-today-title">Dnes</h2>
        <p className="beta-today-progress" aria-live="polite">
          {doneCount} z {totalActivities || '—'} hotovo
        </p>
      </div>

      {errorMsg ? (
        <p className="beta-today-error" role="alert">{errorMsg}</p>
      ) : null}

      {meals.length > 0 && (
        <div className="beta-today-group">
          <h3 className="beta-today-group-title">Jídla</h3>
          <ul className="beta-today-list">
            {meals.map((meal, i) => {
              const key = mealKey(meal, i);
              const done = completedSet.has(`meal:${key}`);
              const pending = pendingKeys.has(`meal:${key}`);
              const label = meal?.display_name_cs || meal?.name_cs || meal?.type || `Jídlo ${i + 1}`;
              return (
                <li key={key}>
                  <label className={`beta-today-check ${done ? 'beta-today-check--done' : ''} ${pending ? 'beta-today-check--pending' : ''}`}>
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggleActivity('meal', key, done)}
                      aria-busy={pending}
                    />
                    <span>{label}</span>
                    {pending ? <span className="beta-today-spinner" aria-hidden="true" /> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasWorkout && (
        <div className="beta-today-group">
          <h3 className="beta-today-group-title">Trénink</h3>
          <label className={`beta-today-check ${workoutCompleted ? 'beta-today-check--done' : ''} ${pendingKeys.has('workout:plan_day') ? 'beta-today-check--pending' : ''}`}>
            <input
              type="checkbox"
              checked={workoutCompleted}
              onChange={() => toggleActivity('workout', 'plan_day', workoutCompleted)}
              aria-busy={pendingKeys.has('workout:plan_day')}
            />
            <span>Dokončil/a jsem dnešní trénink</span>
            {pendingKeys.has('workout:plan_day') ? <span className="beta-today-spinner" aria-hidden="true" /> : null}
          </label>
        </div>
      )}

      {habitIds.length > 0 && (
        <div className="beta-today-group">
          <h3 className="beta-today-group-title">Návyky</h3>
          <ul className="beta-today-list">
            {habitIds.map((hid) => {
              const done = completedSet.has(`habit:${hid}`);
              const pending = pendingKeys.has(`habit:${hid}`);
              return (
                <li key={hid}>
                  <label className={`beta-today-check ${done ? 'beta-today-check--done' : ''} ${pending ? 'beta-today-check--pending' : ''}`}>
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggleActivity('habit', hid, done)}
                      aria-busy={pending}
                    />
                    <span>{getHabitDisplayLabel(hid)}</span>
                    {pending ? <span className="beta-today-spinner" aria-hidden="true" /> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <DailyCheckinPanel />

      <div className="beta-today-feedback-row">
        <BetaFeedbackButton context={feedbackContext} />
      </div>

      <style jsx>{`
        .beta-today-section {
          margin: 0 0 1.25rem;
          padding: 1rem 1.1rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .beta-today-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 0.75rem;
        }
        .beta-today-title {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
        }
        .beta-today-progress {
          margin: 0;
          font-size: 0.9rem;
          opacity: 0.85;
        }
        .beta-today-error {
          margin: 0 0 0.5rem;
          font-size: 0.85rem;
          color: #fca5a5;
        }
        .beta-today-group {
          margin-top: 0.75rem;
        }
        .beta-today-group-title {
          margin: 0 0 0.35rem;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          opacity: 0.75;
        }
        .beta-today-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .beta-today-check {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.35rem 0;
          cursor: pointer;
          font-size: 0.95rem;
        }
        .beta-today-check--done span:first-of-type {
          text-decoration: line-through;
          opacity: 0.7;
        }
        .beta-today-check--pending {
          opacity: 0.9;
        }
        .beta-today-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #38bdf8;
          border-radius: 50%;
          animation: beta-spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes beta-spin {
          to { transform: rotate(360deg); }
        }
        .beta-today-feedback-row {
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </section>
  );
}
