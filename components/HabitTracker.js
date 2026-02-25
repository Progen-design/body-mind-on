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
        <header className="habit-tracker-head">
          <h2 className="habit-tracker-title">Denní návyky</h2>
          <p className="habit-tracker-empty">
            Zatím nemáš vybrané žádné návyky. Vyber si je v průvodci nebo v nastavení.
          </p>
        </header>
        <style jsx>{`
          .habit-tracker { margin-bottom: 48px; padding: 0; }
          .habit-tracker-head { margin-bottom: 0; }
          .habit-tracker-title { margin: 0 0 6px; font-size: 1.25rem; font-weight: 600; letter-spacing: -0.02em; color: #f1f5f9; }
          .habit-tracker-empty { margin: 0; color: #64748b; font-size: 0.8125rem; }
        `}</style>
      </section>
    );
  }

  const renderHabitRow = (h, isNegative) => (
    <div key={h.id} className={`habit-row habit-row-${isNegative ? 'negative' : 'positive'}`}>
      <div className="habit-label" title={h.description}>
        <span className="habit-emoji" aria-hidden="true">{h.emoji}</span>
        <span className="habit-label-name">{h.label}</span>
      </div>
      <div className="habit-cells">
        {days.map((dateStr) => {
          const completed = getCompleted(h.id, dateStr);
          const isToday = dateStr === todayStr;
          const busy = isToday && toggling === h.id;
          return (
            <button
              key={`${h.id}-${dateStr}`}
              type="button"
              className={`habit-cell ${isNegative ? 'negative' : ''} ${completed ? 'completed' : ''} ${busy ? 'busy' : ''} ${!isToday ? 'future' : ''} ${isToday ? 'today-cell' : ''}`}
              onClick={() => handleToggle(h.id, dateStr)}
              disabled={!isToday || busy}
              title={isToday ? (completed ? 'Splnil/a jsem – klikni pro nesplněno' : 'Nesplnil/a – klikni pro splněno') : `${formatShortDate(dateStr)} – jen dnes lze měnit`}
              aria-pressed={isToday ? completed : undefined}
              aria-label={`${h.label}, ${formatShortDate(dateStr)}${isToday ? ', dnes' : ''}${completed ? ', splněno' : ', nesplněno'}`}
            >
              <span className="habit-cell-inner">
                {completed ? (
                  <>
                    <svg className="habit-cell-check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M5 12l5 5 9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="habit-cell-label">Splněno</span>
                  </>
                ) : (
                  <>
                    <span className="habit-cell-empty" aria-hidden="true">−</span>
                    <span className="habit-cell-label">Nesplněno</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className="habit-tracker">
      <header className="habit-tracker-head">
        <h2 className="habit-tracker-title">Denní návyky</h2>
        <p className="habit-tracker-subtitle">
          Klikni na buňku u dne – přepneš mezi „Splnil/a jsem“ a „Nesplnil/a“
        </p>
      </header>

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
          <div className="habit-tracker-card">
            <div className="habit-tracker-progress">
              <span className="habit-progress-label">Dnes</span>
              <div className="habit-progress-bar-wrap">
                <div className="habit-progress-bar" style={{ width: `${totalHabits ? Math.round((completedToday / totalHabits) * 100) : 0}%` }} />
              </div>
              <span className="habit-progress-value">{completedToday} / {totalHabits}</span>
            </div>
          <div className="habit-wrapper">
            <div className="habit-header-row">
              <div className="habit-header-spacer" />
              <div className="habit-header-dates">
                {days.map((d) => (
                  <div
                    key={d}
                    className={`habit-header-cell ${d === todayStr ? 'today' : 'future'}`}
                  >
                    <span className="habit-header-date-num">{formatShortDate(d)}</span>
                    {d === todayStr && <span className="habit-today-badge">Dnes</span>}
                  </div>
                ))}
              </div>
            </div>
            {positiveHabits.length > 0 && (
              <div className="habit-section">
                <div className="habit-section-label positive">Zdravé návyky</div>
                {positiveHabits.map((h) => renderHabitRow(h, false))}
              </div>
            )}
            {negativeHabits.length > 0 && (
              <div className="habit-section">
                <div className="habit-section-label negative">Zlozvyky</div>
                {negativeHabits.map((h) => renderHabitRow(h, true))}
              </div>
            )}
          </div>
          </div>

          {recommendation && (
            <div className="habit-recommendation">
              <p className="habit-recommendation-text">{recommendation}</p>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .habit-tracker {
          margin-bottom: 48px;
          padding: 0;
          background: transparent;
          border-radius: 0;
        }
        .habit-tracker-head {
          margin-bottom: 24px;
        }
        .habit-tracker-title {
          margin: 0 0 8px;
          font-size: 1.375rem;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: #f8fafc;
        }
        .habit-tracker-subtitle {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 400;
          color: #94a3b8;
          line-height: 1.45;
        }
        .habit-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 48px 24px;
          color: #64748b;
        }
        .habit-loading-dots {
          display: inline-flex;
          gap: 3px;
          font-size: 1.25rem;
          font-weight: 600;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }
        .habit-loading-dots span {
          animation: habit-dot 1.4s ease-in-out infinite both;
        }
        .habit-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .habit-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes habit-dot {
          0%, 80%, 100% { opacity: 0.35; }
          40% { opacity: 1; }
        }
        .habit-loading-text {
          font-size: 0.8125rem;
          color: #64748b;
        }
        .habit-error {
          text-align: center;
          padding: 24px;
          background: rgba(248, 250, 252, 0.03);
          border: 1px solid rgba(248, 250, 252, 0.06);
          border-radius: 12px;
        }
        .habit-error-message {
          margin: 0 0 16px;
          font-size: 0.875rem;
          color: #94a3b8;
        }
        .habit-retry-btn {
          padding: 10px 20px;
          background: rgba(248, 250, 252, 0.08);
          border: 1px solid rgba(248, 250, 252, 0.12);
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .habit-retry-btn:hover {
          background: rgba(248, 250, 252, 0.12);
          border-color: rgba(248, 250, 252, 0.18);
        }
        .habit-tracker-card {
          border-radius: 20px;
          background: linear-gradient(145deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.85) 100%);
          border: 1px solid rgba(148, 163, 184, 0.12);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }
        .habit-tracker-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 24px;
          background: rgba(0, 0, 0, 0.15);
          border-bottom: 1px solid rgba(248, 250, 252, 0.06);
        }
        .habit-progress-label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #94a3b8;
          min-width: 36px;
        }
        .habit-progress-bar-wrap {
          flex: 1;
          height: 8px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 4px;
          overflow: hidden;
        }
        .habit-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #34d399, #22c55e);
          border-radius: 4px;
          transition: width 0.35s ease;
        }
        .habit-progress-value {
          font-size: 0.875rem;
          font-weight: 700;
          color: #e2e8f0;
          min-width: 48px;
          text-align: right;
        }
        .habit-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding: 24px 24px 28px;
        }
        .habit-header-row {
          display: flex;
          align-items: stretch;
          gap: 10px;
          margin-bottom: 16px;
        }
        .habit-header-spacer {
          width: 260px;
          min-width: 260px;
          flex-shrink: 0;
        }
        .habit-header-dates {
          display: flex;
          gap: 12px;
          flex-shrink: 0;
        }
        .habit-header-cell {
          width: 72px;
          min-width: 72px;
          padding: 12px 8px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .habit-header-cell.today {
          background: rgba(99, 102, 241, 0.2);
          border-color: rgba(99, 102, 241, 0.35);
          color: #c7d2fe;
        }
        .habit-header-date-num {
          font-size: 0.875rem;
          font-weight: 600;
          letter-spacing: 0;
        }
        .habit-header-cell.future {
          opacity: 0.75;
        }
        .habit-today-badge {
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          color: #a5b4fc;
        }
        .habit-section {
          margin-top: 20px;
        }
        .habit-section:first-of-type {
          margin-top: 0;
        }
        .habit-section-label {
          font-size: 0.8125rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .habit-section-label.positive {
          color: #86efac;
          background: rgba(34, 197, 94, 0.1);
          border-left: 4px solid #22c55e;
        }
        .habit-section-label.negative {
          color: #fca5a5;
          background: rgba(248, 113, 113, 0.08);
          border-left: 4px solid #f87171;
        }
        .habit-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .habit-label {
          width: 260px;
          min-width: 260px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid rgba(248, 250, 252, 0.06);
        }
        .habit-row-positive .habit-label {
          border-left: none;
        }
        .habit-row-negative .habit-label {
          border-left: none;
        }
        .habit-emoji {
          font-size: 1.25rem;
          flex-shrink: 0;
          line-height: 1;
        }
        .habit-label-name {
          font-size: 0.9375rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: #f1f5f9;
          line-height: 1.35;
        }
        .habit-cells {
          display: flex;
          gap: 12px;
          flex-shrink: 0;
        }
        .habit-cell {
          width: 72px;
          min-width: 72px;
          min-height: 80px;
          padding: 10px 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #94a3b8;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s, color 0.2s, transform 0.15s;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        }
        .habit-cell-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
        }
        .habit-cell-empty {
          display: block;
          font-size: 1.5rem;
          font-weight: 300;
          line-height: 1;
          color: rgba(255, 255, 255, 0.35);
        }
        .habit-cell-check {
          width: 28px;
          height: 28px;
          color: inherit;
          flex-shrink: 0;
        }
        .habit-cell-label {
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: inherit;
          line-height: 1.2;
        }
        .habit-cell:hover:not(:disabled):not(.future) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.25);
          transform: scale(1.02);
        }
        .habit-cell.today-cell:not(.completed) {
          border-color: rgba(99, 102, 241, 0.4);
          background: rgba(99, 102, 241, 0.08);
        }
        .habit-cell.today-cell:hover:not(:disabled):not(.completed) {
          border-color: rgba(99, 102, 241, 0.6);
          background: rgba(99, 102, 241, 0.15);
        }
        .habit-cell.future {
          cursor: default;
          opacity: 0.5;
        }
        .habit-cell.future .habit-cell-empty {
          color: rgba(255, 255, 255, 0.15);
        }
        .habit-cell.future .habit-cell-label {
          color: rgba(255, 255, 255, 0.2);
        }
        .habit-cell.completed {
          background: rgba(34, 197, 94, 0.18);
          border-color: rgba(34, 197, 94, 0.45);
          color: #4ade80;
        }
        .habit-cell.completed .habit-cell-label {
          color: #86efac;
        }
        .habit-cell.negative.completed {
          background: rgba(34, 197, 94, 0.18);
          border-color: rgba(34, 197, 94, 0.45);
          color: #4ade80;
        }
        .habit-cell.negative:not(.completed) {
          border-color: rgba(255, 255, 255, 0.1);
        }
        .habit-cell.busy {
          opacity: 0.6;
          cursor: wait;
        }
        .habit-recommendation {
          margin-top: 28px;
          padding: 18px 20px;
          background: rgba(248, 250, 252, 0.03);
          border: 1px solid rgba(248, 250, 252, 0.06);
          border-radius: 12px;
        }
        .habit-recommendation-text {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.55;
          color: #94a3b8;
          font-weight: 400;
        }
      `}</style>
    </section>
  );
}
