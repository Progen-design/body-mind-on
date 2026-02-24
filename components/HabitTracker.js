// components/HabitTracker.js – Denní návyky (dnes + dny dopředu, jen dnes editovatelné)
import { useState, useEffect, useCallback, useMemo } from 'react';
import { POSITIVE_HABITS, NEGATIVE_HABITS, getHabitById } from '../lib/habits';

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

function formatShortDate(d) {
  if (!d) return '—';
  const date = new Date(d + 'T12:00:00Z');
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

const DAYS_FORWARD = 6;

export default function HabitTracker({ session, userHabits, onToast }) {
  const [positiveHabits, setPositiveHabits] = useState([]);
  const [negativeHabits, setNegativeHabits] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [weekLogs, setWeekLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [toggling, setToggling] = useState(null);

  const buildHabitsLists = useCallback((uh) => {
    let list = [];
    if (Array.isArray(uh) && uh.length > 0) {
      list = uh.map((h) => getHabitById(h.habit_id)).filter(Boolean);
    } else {
      list = [...POSITIVE_HABITS, ...NEGATIVE_HABITS];
    }
    const pos = list.filter((h) => POSITIVE_HABITS.some((p) => p.id === h.id));
    const neg = list.filter((h) => NEGATIVE_HABITS.some((n) => n.id === h.id));
    return { pos, neg };
  }, []);

  const todayStr = toDateStr(new Date());
  const days = useMemo(() => {
    const result = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let i = 0; i <= DAYS_FORWARD; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(toDateStr(d));
    }
    return result;
  }, []);

  useEffect(() => {
    const { pos, neg } = buildHabitsLists(userHabits);
    setPositiveHabits(pos);
    setNegativeHabits(neg);
  }, [userHabits, buildHabitsLists]);

  const fetchLogs = useCallback(
    async (from, to, habitIds) => {
      if (!session?.access_token || habitIds.length === 0) return [];
      const params = new URLSearchParams({ from, to, habit_ids: habitIds.join(',') });
      const res = await fetch(`/api/habits?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      return res.ok && Array.isArray(json.logs) ? json.logs : [];
    },
    [session?.access_token]
  );

  const loadLogs = useCallback(() => {
    const allHabits = [...positiveHabits, ...negativeHabits];
    if (allHabits.length === 0) {
      setLoading(false);
      setFetchError(null);
      return;
    }
    const habitIds = allHabits.map((h) => h.id);
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    const fromStr = toDateStr(weekAgo);

    setLoading(true);
    setFetchError(null);
    Promise.all([
      fetchLogs(days[0], days[days.length - 1], habitIds),
      fetchLogs(fromStr, todayStr, habitIds),
    ])
      .then(([rangeData, weekData]) => {
        setAllLogs(rangeData);
        setWeekLogs(weekData);
        setFetchError(null);
      })
      .catch((err) => {
        console.error('[HabitTracker] fetch error:', err);
        setFetchError(err?.message || 'Nepodařilo se načíst návyky');
        setAllLogs([]);
        setWeekLogs([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [positiveHabits, negativeHabits, days, todayStr, fetchLogs]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const getCompleted = (habitId, dateStr) => {
    const log = allLogs.find((l) => l.habit_id === habitId && l.log_date === dateStr);
    return log?.completed ?? false;
  };

  const handleToggle = async (habitId, dateStr) => {
    if (dateStr !== todayStr) return;
    if (!session?.access_token || toggling) return;
    const current = getCompleted(habitId, todayStr);
    const nextCompleted = !current;
    setToggling(habitId);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          log_date: todayStr,
          habit_id: habitId,
          completed: nextCompleted,
        }),
      });
      const json = await res.json();
      if (res.ok && json.log) {
        setAllLogs((prev) => {
          const filtered = prev.filter((l) => !(l.habit_id === habitId && l.log_date === todayStr));
          return [...filtered, json.log];
        });
        setWeekLogs((prev) => {
          const filtered = prev.filter((l) => !(l.habit_id === habitId && l.log_date === todayStr));
          return [...filtered, json.log];
        });
        if (onToast) {
          onToast({
            message: nextCompleted ? 'Splněno! ✓' : 'Odebráno',
            type: 'success',
          });
        }
      } else if (onToast) {
        onToast({ message: json.error || 'Chyba při ukládání', type: 'error' });
      }
    } catch (err) {
      if (onToast) onToast({ message: 'Chyba připojení', type: 'error' });
    } finally {
      setToggling(null);
    }
  };

  const completedToday = allLogs.filter((l) => l.log_date === todayStr && l.completed).length;
  const totalHabits = positiveHabits.length + negativeHabits.length;
  const weekCompletedByHabit = {};
  weekLogs.filter((l) => l.completed).forEach((l) => {
    weekCompletedByHabit[l.habit_id] = (weekCompletedByHabit[l.habit_id] || 0) + 1;
  });
  const avgWeekCompletion =
    totalHabits > 0
      ? Object.values(weekCompletedByHabit).reduce((a, b) => a + b, 0) / totalHabits
      : 0;

  const getRecommendation = () => {
    if (totalHabits === 0) return null;
    const pctToday = Math.round((completedToday / totalHabits) * 100);
    const avgWeek = Math.round(avgWeekCompletion);
    if (completedToday === totalHabits) {
      return 'Výborně! Dnes máš vše splněno. Každý den se počítá – pokračuj takhle.';
    }
    if (pctToday >= 70) {
      return `Dnes máš ${pctToday} % splněno. Skvělé! Zbývá jen pár návyků – zkus je doplnit před večerem.`;
    }
    if (avgWeek >= 4 && avgWeek < 7) {
      return `Za posledních 7 dní máš v průměru ${avgWeek} splnění na návyk. Dobrý trend – pokračuj v pravidelnosti.`;
    }
    if (avgWeek >= 7) {
      return 'Za poslední týden jsi byl/a velmi konzistentní. Taková pravidelnost přináší výsledky.';
    }
    if (completedToday === 0) {
      return 'Začni malým krokem – odškrtni alespoň jeden návyk dnes. I jeden je lepší než žádný.';
    }
    return `Dnes máš ${completedToday} z ${totalHabits} splněno. Každý malý krok se počítá – zkus přidat ještě jeden.`;
  };

  const recommendation = getRecommendation();

  if (positiveHabits.length === 0 && negativeHabits.length === 0) {
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
          .habit-tracker-title { margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #e2e8f0; }
          .habit-tracker-empty { color: #94a3b8; font-size: 14px; }
        `}</style>
      </section>
    );
  }

  const renderHabitRow = (h, isNegative) => (
    <div key={h.id} className={`habit-grid-row habit-row-${isNegative ? 'negative' : 'positive'}`}>
      <div className="habit-grid-label">
        <span className="habit-emoji">{h.emoji}</span>
        <span>{h.label}</span>
      </div>
      {days.map((dateStr) => {
        const completed = getCompleted(h.id, dateStr);
        const isToday = dateStr === todayStr;
        const busy = isToday && toggling === h.id;
        return (
          <button
            key={`${h.id}-${dateStr}`}
            type="button"
            className={`habit-grid-cell ${isNegative ? 'negative' : ''} ${completed ? 'completed' : ''} ${busy ? 'busy' : ''} ${!isToday ? 'future' : ''}`}
            onClick={() => handleToggle(h.id, dateStr)}
            disabled={!isToday || busy}
            title={isToday ? (isNegative ? 'Vyhnul/a jsem se = ✓' : 'Splněno = ✓') : 'Jen dnes lze odškrtnout'}
          >
            {completed ? '✓' : '○'}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="habit-tracker">
      <h2 className="habit-tracker-title">Denní návyky</h2>
      <p className="habit-tracker-subtitle">
        Jen dnes lze odškrtnout – klikni na buňku u dnešního data
      </p>

      {loading ? (
        <div className="habit-loading">
          <span className="habit-loading-dots">
            <span>.</span><span>.</span><span>.</span>
          </span>
          <span className="habit-loading-text">Načítám návyky</span>
        </div>
      ) : fetchError ? (
        <div className="habit-error">
          <p className="habit-error-message">{fetchError}</p>
          <button type="button" className="habit-retry-btn" onClick={loadLogs}>
            Zkusit znovu
          </button>
        </div>
      ) : (
        <>
          <div className="habit-grid-wrapper">
            <div className="habit-grid">
              <div className="habit-grid-corner" />
              {days.map((d) => (
                <div
                  key={d}
                  className={`habit-grid-header-cell ${d === todayStr ? 'today' : 'future'}`}
                >
                  {formatShortDate(d)}
                  {d === todayStr && <span className="habit-today-badge">Dnes</span>}
                </div>
              ))}
              {positiveHabits.length > 0 && (
                <>
                  <div className="habit-grid-section-header positive">
                    Zdravé návyky <span className="habit-section-hint">Splň = ✓</span>
                  </div>
                  {positiveHabits.map((h) => renderHabitRow(h, false))}
                </>
              )}
              {negativeHabits.length > 0 && (
                <>
                  <div className="habit-grid-section-header negative">
                    Zlozvyky <span className="habit-section-hint">Vyhnul/a jsem se = ✓</span>
                  </div>
                  {negativeHabits.map((h) => renderHabitRow(h, true))}
                </>
              )}
            </div>
          </div>

          {recommendation && (
            <div className="habit-recommendation">
              <h3 className="habit-recommendation-title">Doporučení</h3>
              <p className="habit-recommendation-text">{recommendation}</p>
            </div>
          )}
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
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 32px 24px;
          color: #94a3b8;
        }
        .habit-loading-dots {
          display: inline-flex;
          gap: 2px;
          font-size: 28px;
          font-weight: 700;
          color: #a78bfa;
          line-height: 1;
        }
        .habit-loading-dots span {
          animation: habit-dot 1.4s ease-in-out infinite both;
        }
        .habit-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .habit-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes habit-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .habit-loading-text {
          font-size: 14px;
          color: #94a3b8;
        }
        .habit-error {
          text-align: center;
          padding: 24px;
          background: rgba(248, 113, 113, 0.08);
          border: 1px solid rgba(248, 113, 113, 0.2);
          border-radius: 12px;
        }
        .habit-error-message {
          margin: 0 0 16px;
          font-size: 14px;
          color: #fca5a5;
        }
        .habit-retry-btn {
          padding: 10px 20px;
          background: rgba(155, 92, 255, 0.3);
          border: 1px solid rgba(155, 92, 255, 0.5);
          border-radius: 10px;
          color: #e9d5ff;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .habit-retry-btn:hover {
          background: rgba(155, 92, 255, 0.45);
          transform: translateY(-1px);
        }
        .habit-grid-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .habit-grid {
          display: grid;
          grid-template-columns: minmax(140px, 1fr) repeat(7, minmax(44px, 44px));
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
        .habit-grid-header-cell.future {
          opacity: 0.7;
        }
        .habit-today-badge {
          font-size: 9px;
          font-weight: 500;
          color: #a78bfa;
        }
        .habit-grid-section-header {
          grid-column: 1 / -1;
          padding: 10px 12px;
          margin-top: 12px;
          font-size: 14px;
          font-weight: 600;
          border-radius: 8px;
        }
        .habit-grid-section-header.positive {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
          margin-top: 0;
        }
        .habit-grid-section-header.negative {
          background: rgba(248, 113, 113, 0.12);
          color: #f87171;
        }
        .habit-section-hint {
          font-weight: 400;
          font-size: 12px;
          opacity: 0.9;
          margin-left: 8px;
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
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .habit-row-positive .habit-grid-label {
          border-left: 2px solid rgba(34, 197, 94, 0.4);
        }
        .habit-row-negative .habit-grid-label {
          border-left: 2px solid rgba(248, 113, 113, 0.4);
        }
        .habit-emoji {
          font-size: 16px;
          flex-shrink: 0;
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
        .habit-grid-cell:hover:not(:disabled):not(.future) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.15);
          color: #94a3b8;
        }
        .habit-grid-cell.future {
          cursor: default;
          opacity: 0.5;
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
        .habit-recommendation {
          margin-top: 24px;
          padding: 16px 18px;
          background: rgba(155, 92, 255, 0.08);
          border: 1px solid rgba(155, 92, 255, 0.2);
          border-radius: 14px;
        }
        .habit-recommendation-title {
          margin: 0 0 8px;
          font-size: 14px;
          font-weight: 600;
          color: #c4b5fd;
        }
        .habit-recommendation-text {
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
          color: #e9d5ff;
        }
      `}</style>
    </section>
  );
}
