// components/HabitTracker.js – Mřížka návyků × dny
import { useState, useEffect, useCallback } from 'react';
import { POSITIVE_HABITS, NEGATIVE_HABITS, getHabitById } from '../lib/habits';

function formatShortDate(d) {
  if (!d) return '—';
  let dateStr = d;
  if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
    dateStr = `${d}T12:00:00Z`;
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
  });
}

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

const DAYS_BACK = 7;
const DAYS_FORWARD = 7;

export default function HabitTracker({ session, userHabits, onToast }) {
  const [habits, setHabits] = useState([]);
  const [days, setDays] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  const buildHabitsList = useCallback((uh) => {
    if (Array.isArray(uh) && uh.length > 0) {
      return uh
        .map((h) => getHabitById(h.habit_id))
        .filter(Boolean);
    }
    return [...POSITIVE_HABITS, ...NEGATIVE_HABITS];
  }, []);

  const buildDaysList = useCallback(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const result = [];
    for (let i = -DAYS_BACK; i <= DAYS_FORWARD; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(toDateStr(d));
    }
    return result;
  }, []);

  useEffect(() => {
    setHabits(buildHabitsList(userHabits));
    setDays(buildDaysList());
  }, [userHabits, buildHabitsList, buildDaysList]);

  const fetchLogs = useCallback(
    async (dayList) => {
      if (!session?.access_token || dayList.length === 0) return;
      setLoading(true);
      try {
        const from = dayList[0];
        const to = dayList[dayList.length - 1];
        const habitIds = habits.map((h) => h.id);
        const params = new URLSearchParams({ from, to });
        if (habitIds.length > 0) params.set('habit_ids', habitIds.join(','));
        const res = await fetch(`/api/habits?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        const json = await res.json();
        if (res.ok && Array.isArray(json.logs)) {
          setLogs(json.logs);
        } else {
          setLogs([]);
        }
      } catch (err) {
        console.error('[HabitTracker] fetch error:', err);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token, habits]
  );

  useEffect(() => {
    if (days.length > 0 && habits.length > 0) {
      fetchLogs(days);
    } else {
      setLoading(false);
    }
  }, [days, habits, fetchLogs]);

  const getCompleted = (habitId, dateStr) => {
    const log = logs.find((l) => l.habit_id === habitId && l.log_date === dateStr);
    return log?.completed ?? false;
  };

  const handleToggle = async (habitId, dateStr) => {
    if (!session?.access_token || toggling) return;
    const current = getCompleted(habitId, dateStr);
    const nextCompleted = !current;
    setToggling(`${habitId}:${dateStr}`);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          log_date: dateStr,
          habit_id: habitId,
          completed: nextCompleted,
        }),
      });
      const json = await res.json();
      if (res.ok && json.log) {
        setLogs((prev) => {
          const filtered = prev.filter(
            (l) => !(l.habit_id === habitId && l.log_date === dateStr)
          );
          return [...filtered, json.log];
        });
        if (onToast) {
          onToast({
            message: nextCompleted ? 'Splněno! ✓' : 'Odebráno',
            type: 'success',
          });
        }
      } else if (onToast) {
        onToast({
          message: json.error || 'Chyba při ukládání',
          type: 'error',
        });
      }
    } catch (err) {
      if (onToast) {
        onToast({ message: 'Chyba připojení', type: 'error' });
      }
    } finally {
      setToggling(null);
    }
  };

  const todayStr = toDateStr(new Date());

  if (habits.length === 0) {
    return (
      <section className="habit-tracker">
        <h2 className="habit-tracker-title">Denní návyky</h2>
        <p className="habit-tracker-empty">
          Zatím nemáš vybrané žádné návyky. Vyber si je v průvodci nebo v nastavení.
        </p>
        <style jsx>{`
          .habit-tracker {
            margin-bottom: 40px;
            padding: 28px 24px;
            background: rgba(255, 255, 255, 0.04);
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.08);
          }
          .habit-tracker-title {
            margin: 0 0 12px;
            font-size: 18px;
            font-weight: 600;
            color: #e2e8f0;
          }
          .habit-tracker-empty {
            color: #94a3b8;
            font-size: 14px;
          }
        `}</style>
      </section>
    );
  }

  return (
    <section className="habit-tracker">
      <h2 className="habit-tracker-title">Denní návyky</h2>
      <p className="habit-tracker-subtitle">
        Klikni na buňku pro přepnutí ○ / ✓
      </p>

      {loading ? (
        <div className="habit-loading">Načítám…</div>
      ) : (
        <div className="habit-grid-wrapper">
          <div className="habit-grid">
            <div className="habit-grid-corner" />
            {days.map((d) => (
              <div
                key={d}
                className={`habit-grid-header-cell ${d === todayStr ? 'today' : ''}`}
              >
                {formatShortDate(d)}
                {d === todayStr && <span className="habit-today-badge">Dnes</span>}
              </div>
            ))}
            {habits.map((h) => {
              const isNegative = NEGATIVE_HABITS.some((n) => n.id === h.id);
              return (
                <div key={h.id} className="habit-grid-row">
                  <div
                    className={`habit-grid-label ${isNegative ? 'negative' : ''}`}
                    title={h.label}
                  >
                    <span className="habit-label-emoji">{h.emoji}</span>
                    <span className="habit-label-text">{h.label}</span>
                  </div>
                  {days.map((dateStr) => {
                    const completed = getCompleted(h.id, dateStr);
                    const busy = toggling === `${h.id}:${dateStr}`;
                    return (
                      <button
                        key={`${h.id}-${dateStr}`}
                        type="button"
                        className={`habit-grid-cell ${isNegative ? 'negative' : ''} ${completed ? 'completed' : ''} ${busy ? 'busy' : ''}`}
                        onClick={() => handleToggle(h.id, dateStr)}
                        disabled={busy}
                        title={`${h.label} – ${formatShortDate(dateStr)}`}
                      >
                        {completed ? '✓' : '○'}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        .habit-tracker {
          margin-bottom: 40px;
          padding: 28px 24px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .habit-tracker-title {
          margin: 0 0 4px;
          font-size: 18px;
          font-weight: 600;
          color: #e2e8f0;
        }
        .habit-tracker-subtitle {
          margin: 0 0 20px;
          font-size: 13px;
          color: #94a3b8;
        }
        .habit-loading {
          text-align: center;
          color: #94a3b8;
          padding: 24px;
        }
        .habit-grid-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .habit-grid {
          display: grid;
          grid-template-columns: minmax(140px, 1fr) repeat(15, minmax(44px, 44px));
          gap: 1px;
          min-width: min-content;
        }
        .habit-grid-corner {
          background: rgba(255, 255, 255, 0.06);
          border-radius: 8px 0 0 0;
        }
        .habit-grid-header-cell {
          padding: 10px 6px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .habit-grid-header-cell.today {
          background: rgba(155, 92, 255, 0.2);
          color: #c4b5fd;
        }
        .habit-today-badge {
          font-size: 9px;
          font-weight: 500;
          color: #a78bfa;
        }
        .habit-grid-row {
          display: contents;
        }
        .habit-grid-label {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.04);
          font-size: 12px;
          color: #94a3b8;
          border-radius: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .habit-grid-label.negative {
          border-left: 2px solid rgba(248, 113, 113, 0.4);
        }
        .habit-label-emoji {
          font-size: 16px;
          flex-shrink: 0;
        }
        .habit-label-text {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .habit-grid-cell {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          height: 44px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: #64748b;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .habit-grid-cell:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.15);
          color: #94a3b8;
        }
        .habit-grid-cell.completed {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.35);
          color: #4ade80;
        }
        .habit-grid-cell.negative:not(.completed) {
          border-color: rgba(248, 113, 113, 0.2);
        }
        .habit-grid-cell.busy {
          opacity: 0.6;
          cursor: wait;
        }
      `}</style>
    </section>
  );
}
