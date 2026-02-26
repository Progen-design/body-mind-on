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

const DAYS_FORWARD = 0;
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
  const circumference = 2 * Math.PI * 40;
  const strokeOffset = circumference - (pct / 100) * circumference;

  const renderCard = (h, isNegative) => {
    const completed = getCompleted(h.id, todayStr);
    const busy = toggling === `${h.id}-${todayStr}`;
    return (
      <button
        key={h.id}
        type="button"
        className={`hc-card ${completed ? 'completed' : ''} ${isNegative ? 'negative' : 'positive'} ${busy ? 'busy' : ''}`}
        onClick={() => !busy && handleToggle(h.id, todayStr)}
        aria-pressed={completed}
        aria-label={`${h.label}${completed ? ', splněno' : ', nesplněno'}`}
      >
        <div className="hc-card-inner">
          <span className="hc-emoji" aria-hidden="true">{h.emoji}</span>
          <span className="hc-label">{h.label}</span>
          <div className={`hc-toggle ${completed ? 'on' : ''}`}>
            {busy ? (
              <span className="hc-spin" />
            ) : completed ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-checkmark">
                <path d="M5 12l5 5 9-9" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <span className="hc-circle" />
            )}
          </div>
        </div>
        {completed && <span className="hc-glow" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <section className="habit-tracker">
      {/* Header */}
      <div className="ht-header">
        <div className="ht-header-text">
          <h2 className="ht-title">Denní návyky</h2>
          <p className="ht-date">{todayFormatted}</p>
        </div>
        <div className="ht-ring-wrap" title={`${completedToday} z ${totalHabits} splněno`}>
          <svg className="ht-ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke={pct === 100 ? '#22c55e' : '#34d399'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
          </svg>
          <div className="ht-ring-label">
            <span className="ht-ring-pct">{pct}<span className="ht-ring-sym">%</span></span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="ht-loading">
          <span className="ht-spin-lg" />
          <span>Načítám návyky…</span>
        </div>
      ) : fetchError ? (
        <div className="ht-error">
          <p>{fetchError}</p>
          <button type="button" className="ht-retry" onClick={loadLogs}>Zkusit znovu</button>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="ht-progress-wrap">
            <div className="ht-progress-bar" style={{ width: `${pct}%` }} />
            <span className="ht-progress-label">{completedToday} / {totalHabits}</span>
          </div>

          {positiveHabits.length > 0 && (
            <div className="ht-section">
              <div className="ht-section-hdr positive">
                <span className="ht-section-dot" />
                Zdravé návyky
              </div>
              <div className="hc-grid">
                {positiveHabits.map((h) => renderCard(h, false))}
              </div>
            </div>
          )}

          {negativeHabits.length > 0 && (
            <div className="ht-section">
              <div className="ht-section-hdr negative">
                <span className="ht-section-dot neg" />
                Zlozvyky
              </div>
              <div className="hc-grid">
                {negativeHabits.map((h) => renderCard(h, true))}
              </div>
            </div>
          )}

          {recommendation && (
            <div className="ht-tip">
              <svg className="ht-tip-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className="ht-tip-text">{recommendation}</p>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .habit-tracker { margin-bottom: 48px; }

        /* ─── Header ─── */
        .ht-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          gap: 16px;
        }
        .ht-title {
          margin: 0 0 4px;
          font-size: 1.6rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #f8fafc;
          background: linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ht-date {
          margin: 0;
          font-size: 0.875rem;
          color: #64748b;
          font-weight: 500;
          text-transform: capitalize;
        }
        .ht-ring-wrap {
          position: relative;
          width: 80px;
          height: 80px;
          flex-shrink: 0;
        }
        .ht-ring { width: 100%; height: 100%; display: block; }
        .ht-ring-label {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ht-ring-pct {
          font-size: 1.1rem;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1;
        }
        .ht-ring-sym { font-size: 0.65rem; font-weight: 700; color: #94a3b8; }

        /* ─── Progress bar ─── */
        .ht-progress-wrap {
          position: relative;
          height: 6px;
          background: rgba(255,255,255,0.06);
          border-radius: 999px;
          margin-bottom: 28px;
          overflow: visible;
        }
        .ht-progress-bar {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #34d399, #10b981, #059669);
          transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
          box-shadow: 0 0 10px rgba(52,211,153,0.4);
        }
        .ht-progress-label {
          position: absolute;
          right: 0;
          top: -22px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
        }

        /* ─── Section ─── */
        .ht-section { margin-bottom: 20px; }
        .ht-section-hdr {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }
        .ht-section-hdr.positive { color: #4ade80; }
        .ht-section-hdr.negative { color: #f87171; }
        .ht-section-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 6px #22c55e;
          flex-shrink: 0;
        }
        .ht-section-dot.neg {
          background: #f87171;
          box-shadow: 0 0 6px #f87171;
        }

        /* ─── Cards grid ─── */
        .hc-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 12px;
        }

        /* ─── Single card ─── */
        .hc-card {
          position: relative;
          padding: 0;
          border: none;
          border-radius: 20px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.03);
          border: 1.5px solid rgba(255, 255, 255, 0.09);
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s;
          touch-action: manipulation;
          overflow: hidden;
          text-align: left;
        }
        .hc-card:hover:not(.busy) {
          transform: translateY(-3px) scale(1.02);
          box-shadow: 0 12px 32px rgba(0,0,0,0.3);
          border-color: rgba(255,255,255,0.18);
        }
        .hc-card:active:not(.busy) {
          transform: scale(0.97);
        }
        .hc-card.positive.completed {
          background: linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(16,185,129,0.12) 100%);
          border-color: rgba(34,197,94,0.45);
          box-shadow: 0 4px 24px rgba(34,197,94,0.18), 0 0 0 1px rgba(34,197,94,0.2) inset;
        }
        .hc-card.negative.completed {
          background: linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(16,185,129,0.12) 100%);
          border-color: rgba(34,197,94,0.4);
          box-shadow: 0 4px 24px rgba(34,197,94,0.15);
        }
        .hc-card.busy { opacity: 0.6; cursor: wait; }

        .hc-card-inner {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          padding: 20px 18px 18px;
        }
        .hc-emoji {
          font-size: 2rem;
          line-height: 1;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
        }
        .hc-label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #e2e8f0;
          line-height: 1.3;
          flex: 1;
        }
        .hc-card.completed .hc-label { color: #f0fdf4; }

        /* ─── Toggle button area ─── */
        .hc-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 48px;
          border-radius: 14px;
          background: rgba(255,255,255,0.05);
          border: 1.5px solid rgba(255,255,255,0.1);
          margin-top: 4px;
          transition: background 0.2s, border-color 0.2s;
        }
        .hc-toggle.on {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border-color: transparent;
          box-shadow: 0 4px 16px rgba(34,197,94,0.4);
        }
        .hc-card:hover:not(.busy) .hc-toggle:not(.on) {
          background: rgba(255,255,255,0.09);
          border-color: rgba(255,255,255,0.2);
        }
        .hc-circle {
          width: 24px; height: 24px;
          border-radius: 50%;
          border: 2.5px solid rgba(255,255,255,0.35);
          display: block;
          transition: border-color 0.2s;
        }
        .hc-card:hover:not(.busy) .hc-circle {
          border-color: rgba(255,255,255,0.7);
        }
        .hc-checkmark {
          width: 28px; height: 28px;
          color: #fff;
        }
        .hc-spin {
          width: 22px; height: 22px;
          border-radius: 50%;
          border: 2.5px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          animation: hc-spin 0.7s linear infinite;
          display: block;
        }
        @keyframes hc-spin { to { transform: rotate(360deg); } }

        /* Glow overlay for completed */
        .hc-glow {
          position: absolute;
          inset: 0;
          border-radius: 20px;
          pointer-events: none;
          background: radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.25) 0%, transparent 70%);
        }

        /* ─── Tip / recommendation ─── */
        .ht-tip {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-top: 24px;
          padding: 16px 18px;
          background: rgba(248,250,252,0.03);
          border: 1px solid rgba(248,250,252,0.07);
          border-radius: 14px;
        }
        .ht-tip-icon {
          width: 18px; height: 18px;
          color: #4ade80;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .ht-tip-text {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.55;
          color: #94a3b8;
        }

        /* ─── Loading / error ─── */
        .ht-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 48px 24px;
          color: #64748b;
          font-size: 0.875rem;
        }
        .ht-spin-lg {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.08);
          border-top-color: #34d399;
          animation: hc-spin 0.8s linear infinite;
          display: block;
        }
        .ht-error {
          text-align: center;
          padding: 24px;
          background: rgba(248,250,252,0.03);
          border: 1px solid rgba(248,250,252,0.06);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 0.875rem;
        }
        .ht-retry {
          margin-top: 12px;
          padding: 10px 20px;
          background: rgba(248,250,252,0.08);
          border: 1px solid rgba(248,250,252,0.12);
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        .ht-retry:hover { background: rgba(248,250,252,0.13); }

        /* ─── Mobile ─── */
        @media (max-width: 640px) {
          .habit-tracker { margin-bottom: 32px; }
          .ht-title { font-size: 1.3rem; }
          .hc-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .hc-card-inner { padding: 16px 14px 14px; gap: 8px; }
          .hc-emoji { font-size: 1.6rem; }
          .hc-label { font-size: 0.8125rem; }
          .hc-toggle { height: 40px; border-radius: 12px; }
          .ht-ring-wrap { width: 68px; height: 68px; }
          .ht-ring-pct { font-size: 0.95rem; }
        }
      `}</style>
    </section>
  );
}
