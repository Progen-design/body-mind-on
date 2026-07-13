import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
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
  showFeedbackAfterFirstAction = false,
}) {
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [firstActionDone, setFirstActionDone] = useState(false);

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
      if (res.ok) setCompletions(json.completions || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [planId, planDay]);

  useEffect(() => {
    loadCompletions();
  }, [loadCompletions]);

  const completedSet = useMemo(() => {
    const s = new Set();
    for (const c of completions) {
      s.add(`${c.activity_type}:${c.activity_key}`);
    }
    return s;
  }, [completions]);

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

  const toggleActivity = async (activityType, activityKey, completed) => {
    const key = `${activityType}:${activityKey}`;
    setBusyKey(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
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
      if (res.ok) {
        await loadCompletions();
        if (!completed && !firstActionDone) setFirstActionDone(true);
      }
    } catch {
      /* silent */
    } finally {
      setBusyKey(null);
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

      {meals.length > 0 && (
        <div className="beta-today-group">
          <h3 className="beta-today-group-title">Jídla</h3>
          <ul className="beta-today-list">
            {meals.map((meal, i) => {
              const key = mealKey(meal, i);
              const done = completedSet.has(`meal:${key}`);
              const label = meal?.display_name_cs || meal?.name_cs || meal?.type || `Jídlo ${i + 1}`;
              return (
                <li key={key}>
                  <label className={`beta-today-check ${done ? 'beta-today-check--done' : ''}`}>
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={busyKey === `meal:${key}`}
                      onChange={() => toggleActivity('meal', key, done)}
                    />
                    <span>{label}</span>
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
          <label className={`beta-today-check ${completedSet.has('workout:plan_day') ? 'beta-today-check--done' : ''}`}>
            <input
              type="checkbox"
              checked={completedSet.has('workout:plan_day')}
              disabled={busyKey === 'workout:plan_day'}
              onChange={() => toggleActivity('workout', 'plan_day', completedSet.has('workout:plan_day'))}
            />
            <span>Dokončil/a jsem dnešní trénink</span>
          </label>
        </div>
      )}

      {habitIds.length > 0 && (
        <div className="beta-today-group">
          <h3 className="beta-today-group-title">Návyky</h3>
          <ul className="beta-today-list">
            {habitIds.map((hid) => {
              const done = completedSet.has(`habit:${hid}`);
              return (
                <li key={hid}>
                  <label className={`beta-today-check ${done ? 'beta-today-check--done' : ''}`}>
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={busyKey === `habit:${hid}`}
                      onChange={() => toggleActivity('habit', hid, done)}
                    />
                    <span>{hid}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <DailyCheckinPanel />

      {(showFeedbackAfterFirstAction && firstActionDone) || feedbackContext ? (
        <div className="beta-today-feedback-row">
          <BetaFeedbackButton context={feedbackContext} />
        </div>
      ) : null}

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
        .beta-today-check--done span {
          text-decoration: line-through;
          opacity: 0.7;
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
