// components/HabitTracker.js – Denní návyky (dnes + dny dopředu, jen dnes editovatelné)
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { POSITIVE_HABITS, NEGATIVE_HABITS, getHabitById } from '../lib/habits';

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

function formatShortDate(d) {
  if (!d) return '—';
  const date = new Date(d + 'T12:00:00Z');
  if (isNaN(date.getTime())) return '—';
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `${day}. ${month}.`;
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

  const allHabitsForDisplay = [
    ...positiveHabits.map((h) => ({ ...h, isNegative: false })),
    ...negativeHabits.map((h) => ({ ...h, isNegative: true })),
  ];

  const gridRef = useRef(null);

  const scrollGrid = (dir) => {
    if (gridRef.current) {
      gridRef.current.scrollBy({ left: dir * 200, behavior: 'smooth' });
    }
  };

  return (
    <section className="habit-tracker">
      <h2 className="habit-tracker-title">Denní návyky</h2>
      <p className="habit-tracker-subtitle">
        Klikni na buňku pro přepnutí O / ✓
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
          <div className="habit-layout">
            <div className="habit-list-panel">
              <div className="habit-list-spacer" />
              {allHabitsForDisplay.map((h) => (
                <div key={h.id} className={`habit-list-item habit-${h.isNegative ? 'negative' : 'positive'}`}>
                  <span className="habit-list-emoji">{h.emoji}</span>
                  <span className="habit-list-label">{h.label}</span>
                </div>
              ))}
            </div>
            <div className="habit-grid-panel">
              <button type="button" className="habit-scroll-btn habit-scroll-left" onClick={() => scrollGrid(-1)} aria-label="Posunout vlevo">
                ‹
              </button>
              <div className="habit-grid-scroll" ref={gridRef}>
                <div className="habit-grid-header">
                  {days.map((d) => (
                    <div
                      key={d}
                      className={`habit-date-cell ${d === todayStr ? 'today' : ''}`}
                    >
                      {formatShortDate(d)}
                      {d === todayStr && <span className="habit-today-badge">Dnes</span>}
                    </div>
                  ))}
                </div>
                {allHabitsForDisplay.map((h) => (
                  <div key={h.id} className="habit-grid-row">
                    {days.map((dateStr) => {
                      const completed = getCompleted(h.id, dateStr);
                      const isToday = dateStr === todayStr;
                      const isFuture = dateStr > todayStr;
                      const busy = isToday && toggling === h.id;
                      return (
                        <button
                          key={`${h.id}-${dateStr}`}
                          type="button"
                          className={`habit-cell ${h.isNegative ? 'negative' : ''} ${completed ? 'completed' : ''} ${busy ? 'busy' : ''} ${isFuture ? 'future' : ''}`}
                          onClick={() => handleToggle(h.id, dateStr)}
                          disabled={!isToday || busy}
                          title={isToday ? (h.isNegative ? 'Vyhnul/a jsem se = ✓' : 'Splněno = ✓') : 'Jen dnes lze odškrtnout'}
                        >
                          {completed ? '✓' : '○'}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <button type="button" className="habit-scroll-btn habit-scroll-right" onClick={() => scrollGrid(1)} aria-label="Posunout vpravo">
                ›
              </button>
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
        .habit-layout {
          display: flex;
          gap: 0;
          align-items: flex-start;
        }
        .habit-list-panel {
          width: 180px;
          min-width: 180px;
          flex-shrink: 0;
          padding-right: 12px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
        }
        .habit-list-spacer {
          height: 52px;
          margin-bottom: 8px;
        }
        .habit-list-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 0;
          min-height: 44px;
          font-size: 13px;
          color: #94a3b8;
          margin-bottom: 6px;
        }
        .habit-list-item.habit-positive {
          border-left: 2px solid rgba(34, 197, 94, 0.4);
          padding-left: 8px;
          margin-left: 4px;
        }
        .habit-list-item.habit-negative {
          border-left: 2px solid rgba(248, 113, 113, 0.4);
          padding-left: 8px;
          margin-left: 4px;
        }
        .habit-list-emoji {
          font-size: 18px;
          flex-shrink: 0;
        }
        .habit-list-label {
          line-height: 1.3;
        }
        .habit-grid-panel {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: flex-start;
          gap: 0;
        }
        .habit-scroll-btn {
          width: 32px;
          min-width: 32px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #94a3b8;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .habit-scroll-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
        }
        .habit-scroll-left { margin-right: 8px; }
        .habit-scroll-right { margin-left: 8px; }
        .habit-grid-scroll {
          flex: 1;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          min-width: 0;
        }
        .habit-grid-header {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
        }
        .habit-date-cell {
          width: 44px;
          min-width: 44px;
          padding: 8px 4px;
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
        .habit-date-cell.today {
          background: rgba(155, 92, 255, 0.3);
          color: #e9d5ff;
          border: 1px solid rgba(155, 92, 255, 0.5);
        }
        .habit-today-badge {
          font-size: 9px;
          font-weight: 500;
          color: #c4b5fd;
        }
        .habit-grid-row {
          display: flex;
          gap: 6px;
          margin-bottom: 6px;
        }
        .habit-cell {
          width: 44px;
          min-width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #64748b;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .habit-cell:hover:not(:disabled):not(.future) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
          color: #94a3b8;
        }
        .habit-cell.future {
          cursor: default;
          opacity: 0.5;
        }
        .habit-cell.completed {
          background: rgba(34, 197, 94, 0.25);
          border-color: rgba(34, 197, 94, 0.5);
          color: #4ade80;
        }
        .habit-cell.negative:not(.completed) {
          border-color: rgba(248, 113, 113, 0.2);
        }
        .habit-cell.busy {
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
