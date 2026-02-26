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

const DAYS_FORWARD = 7;
const DAYS_BACK = 0;

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

  const pct = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;
  const todayFormatted = new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const CELL_W = 52;
  const LABEL_W = 200;
  const GAP = 6;
  const gridCols = `${LABEL_W}px repeat(${days.length}, ${CELL_W}px)`;

  const renderHabitRow = (h, isNegative) => (
    <>
      <div key={`lbl-${h.id}`} className="hg-label" title={h.description}>
        <span className="hg-emoji" aria-hidden="true">{h.emoji}</span>
        <span className="hg-name">{h.label}</span>
      </div>
      {days.map((dateStr) => {
        const completed = getCompleted(h.id, dateStr);
        const isToday = dateStr === todayStr;
        const isFuture = dateStr > todayStr;
        const busy = toggling === `${h.id}-${dateStr}`;
        return (
          <button
            key={`${h.id}-${dateStr}`}
            type="button"
            className={[
              'hg-cell',
              completed ? 'done' : '',
              isToday ? 'today' : '',
              isFuture ? 'future' : '',
              busy ? 'busy' : '',
              isNegative ? 'neg' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => !isFuture && !busy && handleToggle(h.id, dateStr)}
            disabled={isFuture || busy}
            aria-pressed={completed}
            aria-label={`${h.label}, ${formatShortDate(dateStr)}${completed ? ', splněno' : ', nesplněno'}`}
          >
            {busy ? (
              <span className="hg-spin" />
            ) : completed ? (
              <svg className="hg-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <span className="hg-circle" />
            )}
          </button>
        );
      })}
    </>
  );

  return (
    <section className="habit-tracker">
      <div className="ht-top">
        <div>
          <h2 className="ht-title">Denní návyky</h2>
          <p className="ht-date">{todayFormatted}</p>
        </div>
        <div className="ht-progress-inline">
          <span className="ht-prog-nums">{completedToday}<span className="ht-prog-sep">/</span>{totalHabits}</span>
          <div className="ht-prog-bar-wrap">
            <div className="ht-prog-bar" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="ht-loading"><span className="ht-spin-lg" /><span>Načítám…</span></div>
      ) : fetchError ? (
        <div className="ht-error">
          <p>{fetchError}</p>
          <button type="button" className="ht-retry" onClick={loadLogs}>Zkusit znovu</button>
        </div>
      ) : (
        <>
          <div className="hg-scroll">
            <div className="hg-grid" style={{ gridTemplateColumns: gridCols, columnGap: GAP }}>

              {/* Date header row */}
              <div className="hg-corner" />
              {days.map((d) => (
                <div key={d} className={`hg-hdr-cell ${d === todayStr ? 'today' : ''}`}>
                  <span className="hg-hdr-day">{new Date(d + 'T12:00:00Z').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }).replace(' ', '')}</span>
                  {d === todayStr && <span className="hg-hdr-today">Dnes</span>}
                </div>
              ))}

              {/* Positive habits */}
              {positiveHabits.length > 0 && (
                <>
                  <div className="hg-section-bar pos" style={{ gridColumn: `1 / span ${days.length + 1}` }}>
                    <span className="hg-section-dot" />ZDRAVÉ NÁVYKY
                  </div>
                  {positiveHabits.map((h) => renderHabitRow(h, false))}
                </>
              )}

              {/* Negative habits */}
              {negativeHabits.length > 0 && (
                <>
                  <div className="hg-section-bar neg" style={{ gridColumn: `1 / span ${days.length + 1}` }}>
                    <span className="hg-section-dot neg" />ZLOZVYKY
                  </div>
                  {negativeHabits.map((h) => renderHabitRow(h, true))}
                </>
              )}
            </div>
          </div>

          {recommendation && (
            <div className="ht-tip">
              <p className="ht-tip-text">{recommendation}</p>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .habit-tracker { margin-bottom: 48px; }

        .ht-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }
        .ht-title {
          margin: 0 0 3px;
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #f8fafc;
        }
        .ht-date {
          margin: 0;
          font-size: 0.8125rem;
          color: #64748b;
          font-weight: 500;
          text-transform: capitalize;
        }
        .ht-progress-inline {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          flex-shrink: 0;
        }
        .ht-prog-nums {
          font-size: 1rem;
          font-weight: 700;
          color: #f8fafc;
        }
        .ht-prog-sep { color: #475569; margin: 0 2px; }
        .ht-prog-bar-wrap {
          width: 120px;
          height: 5px;
          background: rgba(255,255,255,0.07);
          border-radius: 999px;
          overflow: hidden;
        }
        .ht-prog-bar {
          height: 100%;
          background: linear-gradient(90deg, #34d399, #10b981);
          border-radius: 999px;
          transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
          box-shadow: 0 0 8px rgba(52,211,153,0.5);
        }

        /* ── Grid ── */
        .hg-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 18px;
          background: rgba(15,23,42,0.85);
          border: 1px solid rgba(255,255,255,0.07);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .hg-grid {
          display: grid;
          row-gap: 0;
          padding: 16px 16px 20px;
          min-width: max-content;
        }
        .hg-corner { height: 56px; }

        /* Date header cell */
        .hg-hdr-cell {
          height: 56px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          border-radius: 10px;
          background: rgba(255,255,255,0.04);
          font-size: 0.6875rem;
          font-weight: 700;
          color: #64748b;
          user-select: none;
        }
        .hg-hdr-cell.today {
          background: linear-gradient(135deg, rgba(124,58,237,0.35) 0%, rgba(139,92,246,0.25) 100%);
          border: 1px solid rgba(139,92,246,0.5);
          color: #c4b5fd;
          box-shadow: 0 0 16px rgba(139,92,246,0.2);
        }
        .hg-hdr-day { font-size: 0.75rem; font-weight: 700; line-height: 1; }
        .hg-hdr-today {
          font-size: 0.5rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #a78bfa;
        }

        /* Section bar */
        .hg-section-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.6875rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          padding: 14px 4px 8px;
          color: #475569;
        }
        .hg-section-bar.pos { color: #4ade80; }
        .hg-section-bar.neg { color: #f87171; }
        .hg-section-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 5px #22c55e;
          flex-shrink: 0;
        }
        .hg-section-dot.neg { background: #f87171; box-shadow: 0 0 5px #f87171; }

        /* Habit label */
        .hg-label {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 52px;
          padding-right: 12px;
          overflow: hidden;
        }
        .hg-emoji { font-size: 1.25rem; flex-shrink: 0; line-height: 1; }
        .hg-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Habit cell */
        .hg-cell {
          width: ${CELL_W}px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.04);
          border: 1.5px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s;
          touch-action: manipulation;
        }
        .hg-cell:hover:not(:disabled):not(.future) {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
          transform: scale(1.08);
        }
        .hg-cell:active:not(:disabled) { transform: scale(0.92); }
        .hg-cell.today:not(.done) {
          background: rgba(124,58,237,0.12);
          border-color: rgba(139,92,246,0.35);
        }
        .hg-cell.today:not(.done):hover:not(:disabled) {
          background: rgba(124,58,237,0.2);
          border-color: rgba(139,92,246,0.55);
        }
        .hg-cell.done {
          background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
          border-color: transparent;
          box-shadow: 0 3px 12px rgba(34,197,94,0.4);
        }
        .hg-cell.done:hover:not(:disabled) {
          background: linear-gradient(135deg, #15803d 0%, #166534 100%);
          transform: scale(1.06);
        }
        .hg-cell.future { opacity: 0.22; cursor: default; pointer-events: none; }
        .hg-cell.busy { opacity: 0.5; cursor: wait; }

        .hg-circle {
          width: 20px; height: 20px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.3);
          display: block;
          transition: border-color 0.15s;
        }
        .hg-cell.today .hg-circle { border-color: rgba(167,139,250,0.6); }
        .hg-cell:hover .hg-circle { border-color: rgba(255,255,255,0.7); }
        .hg-check {
          width: 22px; height: 22px;
          color: #bbf7d0;
        }
        .hg-spin {
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.15);
          border-top-color: #fff;
          animation: hg-spin 0.7s linear infinite;
          display: block;
        }
        @keyframes hg-spin { to { transform: rotate(360deg); } }

        .ht-tip {
          margin-top: 16px;
          padding: 14px 16px;
          background: rgba(248,250,252,0.03);
          border: 1px solid rgba(248,250,252,0.06);
          border-radius: 12px;
        }
        .ht-tip-text { margin: 0; font-size: 0.8125rem; line-height: 1.5; color: #64748b; }

        .ht-loading {
          display: flex; flex-direction: column; align-items: center;
          gap: 12px; padding: 48px 24px; color: #64748b; font-size: 0.875rem;
        }
        .ht-spin-lg {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.07);
          border-top-color: #34d399;
          animation: hg-spin 0.8s linear infinite; display: block;
        }
        .ht-error {
          text-align: center; padding: 24px;
          background: rgba(248,250,252,0.03); border: 1px solid rgba(248,250,252,0.06);
          border-radius: 12px; color: #94a3b8; font-size: 0.875rem;
        }
        .ht-retry {
          margin-top: 12px; padding: 10px 20px;
          background: rgba(248,250,252,0.08); border: 1px solid rgba(248,250,252,0.12);
          border-radius: 8px; color: #e2e8f0; font-size: 0.8125rem;
          font-weight: 500; cursor: pointer; transition: background 0.2s;
        }
        .ht-retry:hover { background: rgba(248,250,252,0.13); }

        @media (max-width: 640px) {
          .habit-tracker { margin-bottom: 32px; }
          .ht-title { font-size: 1.2rem; }
          .ht-prog-bar-wrap { width: 90px; }
        }
      `}</style>
    </section>
  );
}
