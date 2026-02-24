// components/HabitTracker.js – Denní návyky (jen dnes, zdravé vs zlozvyky, doporučení)
import { useState, useEffect, useCallback } from 'react';
import { POSITIVE_HABITS, NEGATIVE_HABITS, getHabitById } from '../lib/habits';

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

export default function HabitTracker({ session, userHabits, onToast }) {
  const [positiveHabits, setPositiveHabits] = useState([]);
  const [negativeHabits, setNegativeHabits] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [weekLogs, setWeekLogs] = useState([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    const allHabits = [...positiveHabits, ...negativeHabits];
    if (allHabits.length === 0) {
      setLoading(false);
      return;
    }
    const habitIds = allHabits.map((h) => h.id);
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    const fromStr = toDateStr(weekAgo);

    setLoading(true);
    Promise.all([
      fetchLogs(todayStr, todayStr, habitIds),
      fetchLogs(fromStr, todayStr, habitIds),
    ]).then(([todayData, weekData]) => {
      setTodayLogs(todayData);
      setWeekLogs(weekData);
      setLoading(false);
    });
  }, [positiveHabits, negativeHabits, todayStr, fetchLogs]);

  const getCompleted = (habitId) => {
    const log = todayLogs.find((l) => l.habit_id === habitId);
    return log?.completed ?? false;
  };

  const handleToggle = async (habitId) => {
    if (!session?.access_token || toggling) return;
    const current = getCompleted(habitId);
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
        setTodayLogs((prev) => {
          const filtered = prev.filter((l) => l.habit_id !== habitId);
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

  const completedToday = todayLogs.filter((l) => l.completed).length;
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

  const renderHabitRow = (h, isNegative) => {
    const completed = getCompleted(h.id);
    const busy = toggling === h.id;
    return (
      <div key={h.id} className={`habit-row habit-row-${isNegative ? 'negative' : 'positive'}`}>
        <div className="habit-row-label">
          <span className="habit-emoji">{h.emoji}</span>
          <span>{h.label}</span>
        </div>
        <button
          type="button"
          className={`habit-cell ${completed ? 'completed' : ''} ${busy ? 'busy' : ''}`}
          onClick={() => handleToggle(h.id)}
          disabled={busy}
          title={isNegative ? 'Vyhnul/a jsem se = ✓' : 'Splněno = ✓'}
        >
          {completed ? '✓' : '○'}
        </button>
      </div>
    );
  };

  return (
    <section className="habit-tracker">
      <h2 className="habit-tracker-title">Denní návyky</h2>
      <p className="habit-tracker-subtitle">
        Jen dnes – klikni pro přepnutí ○ / ✓
      </p>

      {loading ? (
        <div className="habit-loading">Načítám…</div>
      ) : (
        <>
          {positiveHabits.length > 0 && (
            <div className="habit-group habit-group-positive">
              <h3 className="habit-group-title">Zdravé návyky</h3>
              <p className="habit-group-hint">Splň = ✓</p>
              <div className="habit-rows">
                {positiveHabits.map((h) => renderHabitRow(h, false))}
              </div>
            </div>
          )}

          {negativeHabits.length > 0 && (
            <div className="habit-group habit-group-negative">
              <h3 className="habit-group-title">Zlozvyky</h3>
              <p className="habit-group-hint">Vyhnul/a jsem se = ✓</p>
              <div className="habit-rows">
                {negativeHabits.map((h) => renderHabitRow(h, true))}
              </div>
            </div>
          )}

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
          text-align: center;
          color: #94a3b8;
          padding: 24px;
        }
        .habit-group {
          margin-bottom: 24px;
          padding: 16px;
          border-radius: 16px;
        }
        .habit-group-positive {
          background: rgba(34, 197, 94, 0.06);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .habit-group-negative {
          background: rgba(248, 113, 113, 0.06);
          border: 1px solid rgba(248, 113, 113, 0.25);
        }
        .habit-group-title {
          margin: 0 0 4px;
          font-size: 15px;
          font-weight: 600;
        }
        .habit-group-positive .habit-group-title {
          color: #4ade80;
        }
        .habit-group-negative .habit-group-title {
          color: #f87171;
        }
        .habit-group-hint {
          margin: 0 0 12px;
          font-size: 12px;
          color: #94a3b8;
        }
        .habit-rows {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .habit-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .habit-row-positive {
          border-color: rgba(34, 197, 94, 0.15);
        }
        .habit-row-negative {
          border-color: rgba(248, 113, 113, 0.2);
        }
        .habit-row-label {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          color: #e2e8f0;
        }
        .habit-emoji {
          font-size: 20px;
        }
        .habit-cell {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          color: #64748b;
          font-size: 20px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .habit-cell:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
          color: #94a3b8;
        }
        .habit-cell.completed {
          background: rgba(34, 197, 94, 0.2);
          border-color: rgba(34, 197, 94, 0.4);
          color: #4ade80;
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
