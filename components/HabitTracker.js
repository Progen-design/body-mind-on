// components/HabitTracker.js – Denní návyky (Varianta A)
import { useState, useEffect, useCallback } from 'react';
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../lib/habits';

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

export default function HabitTracker({ session, onToast }) {
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  const fetchLogs = useCallback(
    async (dateStr) => {
      if (!session?.access_token) return;
      setLoading(true);
      try {
        const from = dateStr;
        const to = dateStr;
        const res = await fetch(
          `/api/habits?from=${from}&to=${to}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          }
        );
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
    [session?.access_token]
  );

  useEffect(() => {
    fetchLogs(selectedDate);
  }, [selectedDate, fetchLogs]);

  const getCompleted = (habitId) => {
    const log = logs.find((l) => l.habit_id === habitId);
    return log?.completed ?? false;
  };

  const getLogId = (habitId) => {
    const log = logs.find((l) => l.habit_id === habitId);
    return log?.id ?? null;
  };

  const handleToggle = async (habitId) => {
    if (!session?.access_token || toggling) return;
    const current = getCompleted(habitId);
    const nextCompleted = !current;
    setToggling(habitId);
    try {
      const token = session?.access_token;
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          log_date: selectedDate,
          habit_id: habitId,
          completed: nextCompleted,
        }),
      });
      const json = await res.json();
      if (res.ok && json.log) {
        setLogs((prev) => {
          const filtered = prev.filter((l) => l.habit_id !== habitId);
          return [...filtered, json.log];
        });
        if (onToast) {
          onToast({
            message: nextCompleted ? 'Splněno! ✓' : 'Odebráno',
            type: 'success',
          });
        }
      } else {
        if (onToast) {
          onToast({
            message: json.error || 'Chyba při ukládání',
            type: 'error',
          });
        }
      }
    } catch (err) {
      if (onToast) {
        onToast({ message: 'Chyba připojení', type: 'error' });
      }
    } finally {
      setToggling(null);
    }
  };

  const goPrev = () => {
    const d = new Date(selectedDate + 'T12:00:00Z');
    d.setDate(d.getDate() - 1);
    setSelectedDate(toDateStr(d));
  };

  const goNext = () => {
    const d = new Date(selectedDate + 'T12:00:00Z');
    d.setDate(d.getDate() + 1);
    setSelectedDate(toDateStr(d));
  };

  const todayStr = toDateStr(new Date());
  const isToday = selectedDate === todayStr;

  return (
    <section className="habit-tracker">
      <h2 className="habit-tracker-title">Denní návyky</h2>
      <div className="habit-tracker-date">
        <button
          type="button"
          onClick={goPrev}
          className="habit-date-btn"
          aria-label="Předchozí den"
        >
          ◀
        </button>
        <span className="habit-date-label">
          {formatShortDate(selectedDate)}
          {isToday && <span className="habit-date-badge">Dnes</span>}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="habit-date-btn"
          disabled={isToday}
          aria-label="Následující den"
        >
          ▶
        </button>
      </div>

      {loading ? (
        <div className="habit-loading">Načítám…</div>
      ) : (
        <>
          <div className="habit-group">
            <h3 className="habit-group-title">Pozitivní návyky</h3>
            <div className="habit-grid habit-grid-positive">
              {POSITIVE_HABITS.map((h) => {
                const completed = getCompleted(h.id);
                const busy = toggling === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    className={`habit-cell habit-cell-positive ${completed ? 'completed' : ''} ${busy ? 'busy' : ''}`}
                    onClick={() => handleToggle(h.id)}
                    disabled={busy}
                    title={h.label}
                  >
                    <span className="habit-emoji">{h.emoji}</span>
                    <span className="habit-check">{completed ? '✓' : '○'}</span>
                    <span className="habit-label">{h.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="habit-group">
            <h3 className="habit-group-title habit-group-title-negative">
              Zlozvyky <span className="habit-hint">(vyhnul se = ✓)</span>
            </h3>
            <div className="habit-grid habit-grid-negative">
              {NEGATIVE_HABITS.map((h) => {
                const completed = getCompleted(h.id);
                const busy = toggling === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    className={`habit-cell habit-cell-negative ${completed ? 'completed' : ''} ${busy ? 'busy' : ''}`}
                    onClick={() => handleToggle(h.id)}
                    disabled={busy}
                    title={h.label}
                  >
                    <span className="habit-emoji">{h.emoji}</span>
                    <span className="habit-check">{completed ? '✓' : '○'}</span>
                    <span className="habit-label">{h.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
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
          margin: 0 0 12px;
          font-size: 18px;
          font-weight: 600;
          color: #e2e8f0;
        }
        .habit-tracker-date {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 24px;
        }
        .habit-date-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: rgba(139, 92, 255, 0.2);
          border: 1px solid rgba(139, 92, 255, 0.4);
          border-radius: 10px;
          color: #c4b5fd;
          font-size: 14px;
          cursor: pointer;
        }
        .habit-date-btn:hover:not(:disabled) {
          background: rgba(139, 92, 255, 0.35);
          border-color: rgba(139, 92, 255, 0.6);
        }
        .habit-date-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .habit-date-label {
          font-size: 16px;
          font-weight: 600;
          color: #e9d5ff;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .habit-date-badge {
          font-size: 11px;
          font-weight: 500;
          padding: 2px 8px;
          background: rgba(34, 197, 94, 0.25);
          color: #4ade80;
          border-radius: 8px;
        }
        .habit-loading {
          text-align: center;
          color: #94a3b8;
          padding: 24px;
        }
        .habit-group {
          margin-bottom: 24px;
        }
        .habit-group:last-child {
          margin-bottom: 0;
        }
        .habit-group-title {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 600;
          color: #94a3b8;
               }
        .habit-group-title-negative {
          color: #f87171;
        }
        .habit-hint {
          font-weight: 400;
          font-size: 12px;
          color: #64748b;
        }
        .habit-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .habit-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-width: 80px;
          padding: 14px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          color: #94a3b8;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        .habit-cell:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.12);
        }
        .habit-cell-positive.completed {
          background: rgba(34, 197, 94, 0.12);
          border-color: rgba(34, 197, 94, 0.35);
          color: #4ade80;
        }
        .habit-cell-negative.completed {
          background: rgba(34, 197, 94, 0.12);
          border-color: rgba(34, 197, 94, 0.35);
          color: #4ade80;
        }
        .habit-cell-negative:not(.completed) {
          border-color: rgba(248, 113, 113, 0.2);
        }
        .habit-cell-negative:not(.completed):hover:not(:disabled) {
          border-color: rgba(248, 113, 113, 0.4);
        }
        .habit-cell.busy {
          opacity: 0.6;
          cursor: wait;
        }
        .habit-emoji {
          font-size: 24px;
        }
        .habit-check {
          font-size: 18px;
          font-weight: 700;
        }
        .habit-cell.completed .habit-check {
          color: #4ade80;
        }
        .habit-label {
          text-align: center;
          line-height: 1.2;
          max-width: 78px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </section>
  );
}
