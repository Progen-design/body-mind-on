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
const DAYS_BACK = 14;

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
    for (let i = -DAYS_BACK; i <= DAYS_FORWARD; i++) {
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
    const log = (allLogs || []).find((l) => l.habit_id === habitId && l.log_date === dateStr);
    return log?.completed ?? false;
  };

  const handleToggle = async (habitId, dateStr) => {
    if (dateStr > todayStr) return;
    const key = `${habitId}-${dateStr}`;
    if (!session?.access_token || toggling) return;
    const current = getCompleted(habitId, dateStr);
    const nextCompleted = !current;
    setToggling(key);
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
        setAllLogs((prev) => {
          const filtered = prev.filter((l) => !(l.habit_id === habitId && l.log_date === dateStr));
          return [...filtered, json.log];
        });
        setWeekLogs((prev) => {
          const filtered = prev.filter((l) => !(l.habit_id === habitId && l.log_date === dateStr));
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

  const completedToday = (allLogs || []).filter((l) => l.log_date === todayStr && l.completed).length;
  const totalHabits = (positiveHabits || []).length + (negativeHabits || []).length;
  const weekCompletedByHabit = {};
  (weekLogs || []).filter((l) => l.completed).forEach((l) => {
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

  const CELL = 72;
  const LABEL_W = 220;
  const GAP = 8;
  const cols = `${LABEL_W}px repeat(${days.length}, ${CELL}px)`;

  const renderHabitCells = (h, isNegative) => {
    return days.map((dateStr) => {
      const completed = getCompleted(h.id, dateStr);
      const isToday = dateStr === todayStr;
      const isPast = dateStr < todayStr;
      const isFuture = dateStr > todayStr;
      const busy = toggling === `${h.id}-${dateStr}`;
      const clickable = !isFuture && !busy;
      return (
        <button
          key={`${h.id}-${dateStr}`}
          type="button"
          className={[
            'hg-cell',
            isNegative ? 'negative' : 'positive',
            completed ? 'completed' : '',
            busy ? 'busy' : '',
            isPast ? 'past' : '',
            isFuture ? 'future' : '',
            isToday ? 'today-col' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => clickable && handleToggle(h.id, dateStr)}
          disabled={!clickable}
          title={completed ? 'Splněno – klikni pro zrušení' : isFuture ? formatShortDate(dateStr) : 'Klikni a označ splněno'}
          aria-pressed={completed}
          aria-label={`${h.label}, ${formatShortDate(dateStr)}${isToday ? ', dnes' : ''}${completed ? ', splněno' : ', nesplněno'}`}
        >
          {busy ? (
            <span className="hg-spinner" aria-hidden="true" />
          ) : completed ? (
            <svg className="hg-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12l5 5 9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <span className="hg-ring" aria-hidden="true" />
          )}
        </button>
      );
    });
  };

  return (
    <section className="habit-tracker">
      <header className="habit-tracker-head">
        <h2 className="habit-tracker-title">Denní návyky</h2>
      </header>

      {loading ? (
        <div className="habit-loading">
          <span className="habit-loading-dots"><span>.</span><span>.</span><span>.</span></span>
          <span className="habit-loading-text">Načítám návyky</span>
        </div>
      ) : fetchError ? (
        <div className="habit-error">
          <p className="habit-error-message">{fetchError}</p>
          <button type="button" className="habit-retry-btn" onClick={loadLogs}>Zkusit znovu</button>
        </div>
      ) : (
        <>
          <div className="habit-tracker-card">
            <div className="habit-tracker-progress">
              <span className="habit-progress-text">Dnes <strong>{completedToday}</strong> ze <strong>{totalHabits}</strong></span>
              <div className="habit-progress-bar-wrap">
                <div className="habit-progress-bar" style={{ width: `${totalHabits ? Math.round((completedToday / totalHabits) * 100) : 0}%` }} />
              </div>
            </div>

            <div className="hg-scroll">
              <div className="hg-grid" style={{ gridTemplateColumns: cols, gap: GAP }}>

                {/* Header row */}
                <div className="hg-corner" />
                {days.map((d) => (
                  <div key={d} className={`hg-hdr ${d === todayStr ? 'today' : d < todayStr ? 'past' : 'future'}`}>
                    <span className="hg-hdr-date">{formatShortDate(d)}</span>
                    {d === todayStr && <span className="hg-hdr-badge">Dnes</span>}
                  </div>
                ))}

                {/* Zdravé návyky */}
                {positiveHabits.length > 0 && (
                  <>
                    <div className="hg-section-label positive" style={{ gridColumn: `1 / span ${days.length + 1}` }}>
                      Zdravé návyky
                    </div>
                    {positiveHabits.map((h) => (
                      <>
                        <div key={`label-${h.id}`} className="hg-label" title={h.description}>
                          <span className="hg-emoji" aria-hidden="true">{h.emoji}</span>
                          <span className="hg-label-name">{h.label}</span>
                        </div>
                        {renderHabitCells(h, false)}
                      </>
                    ))}
                  </>
                )}

                {/* Zlozvyky */}
                {negativeHabits.length > 0 && (
                  <>
                    <div className="hg-section-label negative" style={{ gridColumn: `1 / span ${days.length + 1}` }}>
                      Zlozvyky
                    </div>
                    {negativeHabits.map((h) => (
                      <>
                        <div key={`label-${h.id}`} className="hg-label" title={h.description}>
                          <span className="hg-emoji" aria-hidden="true">{h.emoji}</span>
                          <span className="hg-label-name">{h.label}</span>
                        </div>
                        {renderHabitCells(h, true)}
                      </>
                    ))}
                  </>
                )}

              </div>
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
        }
        .habit-tracker-head {
          margin-bottom: 20px;
        }
        .habit-tracker-title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #f8fafc;
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
          border-radius: 24px;
          background: linear-gradient(160deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(15, 23, 42, 0.9) 100%);
          border: 1px solid rgba(148, 163, 184, 0.15);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
          overflow: hidden;
        }
        .habit-tracker-progress {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 20px 32px;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.08) 100%);
          border-bottom: 1px solid rgba(248, 250, 252, 0.08);
        }
        .habit-progress-text {
          font-size: 0.9375rem;
          color: #cbd5e1;
        }
        .habit-progress-text strong {
          color: #f8fafc;
          font-weight: 600;
        }
        .habit-progress-bar-wrap {
          height: 12px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          overflow: hidden;
        }
        .habit-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #34d399 0%, #10b981 50%, #059669 100%);
          border-radius: 6px;
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* ── CSS Grid table ── */
        .hg-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding: 24px 24px 28px;
        }
        .hg-grid {
          display: grid;
          align-items: center;
          row-gap: 6px;
        }
        /* Corner cell */
        .hg-corner {
          height: 64px;
        }
        /* Date header */
        .hg-hdr {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          height: 64px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
          text-align: center;
          user-select: none;
        }
        .hg-hdr.today {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.22) 0%, rgba(16, 185, 129, 0.16) 100%);
          border-color: rgba(34, 197, 94, 0.5);
          color: #86efac;
          box-shadow: 0 0 18px rgba(34, 197, 94, 0.12);
        }
        .hg-hdr.past { opacity: 0.65; }
        .hg-hdr.future { opacity: 0.5; }
        .hg-hdr-date { font-size: 0.75rem; font-weight: 700; }
        .hg-hdr-badge {
          font-size: 0.55rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #4ade80;
          text-transform: uppercase;
        }
        /* Section label – spans all columns */
        .hg-section-label {
          font-size: 0.8125rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          padding: 12px 16px;
          border-radius: 12px;
          margin-top: 8px;
        }
        .hg-section-label.positive {
          color: #86efac;
          background: linear-gradient(90deg, rgba(34, 197, 94, 0.15) 0%, transparent 100%);
          border-left: 4px solid #22c55e;
        }
        .hg-section-label.negative {
          color: #fca5a5;
          background: linear-gradient(90deg, rgba(248, 113, 113, 0.12) 0%, transparent 100%);
          border-left: 4px solid #f87171;
        }
        /* Habit label column */
        .hg-label {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 8px 0 4px;
          height: 72px;
          overflow: hidden;
        }
        .hg-emoji {
          font-size: 1.4rem;
          flex-shrink: 0;
          line-height: 1;
        }
        .hg-label-name {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #f1f5f9;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* Habit cell (bubble) */
        .hg-cell {
          width: 100%;
          height: 72px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          color: #94a3b8;
          cursor: pointer;
          transition: transform 0.18s ease, background 0.18s, border-color 0.18s, box-shadow 0.18s;
          touch-action: manipulation;
        }
        .hg-cell:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.22);
          transform: scale(1.06);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
        }
        .hg-cell:active:not(:disabled) {
          transform: scale(0.95);
        }
        .hg-cell.today-col:not(.completed) {
          border-color: rgba(34, 197, 94, 0.45);
          background: rgba(34, 197, 94, 0.07);
        }
        .hg-cell.today-col:hover:not(:disabled):not(.completed) {
          background: rgba(34, 197, 94, 0.13);
          border-color: rgba(34, 197, 94, 0.6);
        }
        .hg-cell.completed {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 4px 16px rgba(34, 197, 94, 0.35);
        }
        .hg-cell.completed:hover:not(:disabled) {
          background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
          transform: scale(1.04);
        }
        .hg-cell.future {
          cursor: default;
          opacity: 0.28;
          pointer-events: none;
        }
        .hg-cell.past:not(.completed) {
          opacity: 0.75;
        }
        .hg-cell.busy {
          cursor: wait;
          opacity: 0.6;
        }
        .hg-ring {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 2.5px solid rgba(255, 255, 255, 0.35);
          display: block;
          transition: border-color 0.18s;
        }
        .hg-cell.today-col:not(.completed) .hg-ring {
          border-color: rgba(134, 239, 172, 0.6);
        }
        .hg-cell:hover:not(:disabled) .hg-ring {
          border-color: rgba(255, 255, 255, 0.65);
        }
        .hg-check {
          width: 34px;
          height: 34px;
          color: #fff;
          flex-shrink: 0;
        }
        .hg-spinner {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 2.5px solid rgba(255,255,255,0.15);
          border-top-color: #fff;
          animation: hg-spin 0.7s linear infinite;
          display: block;
        }
        @keyframes hg-spin { to { transform: rotate(360deg); } }

        .habit-recommendation {
          margin-top: 24px;
          padding: 16px 20px;
          background: rgba(248, 250, 252, 0.03);
          border: 1px solid rgba(248, 250, 252, 0.06);
          border-radius: 12px;
        }
        .habit-recommendation-text {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.55;
          color: #94a3b8;
        }
        @media (max-width: 768px) {
          .habit-tracker { margin-bottom: 32px; }
          .habit-tracker-head { margin-bottom: 14px; }
          .habit-tracker-title { font-size: 1.2rem; }
          .hg-scroll { padding: 14px 12px 18px; }
          .hg-corner { height: 52px; }
          .hg-hdr { height: 52px; border-radius: 10px; font-size: 0.6875rem; }
          .hg-label { height: 60px; gap: 8px; }
          .hg-emoji { font-size: 1.1rem; }
          .hg-label-name { font-size: 0.8125rem; }
          .hg-cell { height: 60px; border-radius: 12px; }
          .hg-ring { width: 26px; height: 26px; }
          .hg-check { width: 26px; height: 26px; }
        }
      `}</style>
    </section>
  );
}
