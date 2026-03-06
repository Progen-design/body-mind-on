// components/HabitTracker.js – Denní návyky (dnes + dny dopředu, jen dnes editovatelné)
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { POSITIVE_HABITS, NEGATIVE_HABITS, getHabitById } from '../lib/habits';

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}
/** Vrací YYYY-MM-DD v lokálním čase (ne UTC), aby „dnes“ bylo správně i po půlnoci. */
function getLocalDateStr(d = new Date()) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatShortDate(d) {
  if (!d) return '—';
  const date = new Date(d + 'T12:00:00Z');
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

const DAYS_FORWARD = 2;
const DAYS_BACK = 5;

export default function HabitTracker({ session, userHabits, onToast, onHabitSaved }) {
  const [positiveHabits, setPositiveHabits] = useState([]);
  const [negativeHabits, setNegativeHabits] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [weekLogs, setWeekLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [toggling, setToggling] = useState(null);
  const scrollContainerRef = useRef(null);
  const todayColRef = useRef(null);

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

  const todayStr = getLocalDateStr(new Date());
  const days = useMemo(() => {
    const result = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let i = -DAYS_BACK; i <= DAYS_FORWARD; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(getLocalDateStr(d));
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

  useEffect(() => {
    if (loading || fetchError) return;
    const el = todayColRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [loading, fetchError]);

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
        if (onHabitSaved) onHabitSaved();
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

  const chartData = useMemo(() => {
    const totalHabitsCount = positiveHabits.length + negativeHabits.length;
    const maxCount = Math.max(1, totalHabitsCount);
    return days.map((dateStr) => {
      const posCount = (positiveHabits || []).filter((h) => getCompleted(h.id, dateStr)).length;
      const negCount = (negativeHabits || []).filter((h) => getCompleted(h.id, dateStr)).length;
      return {
        dateStr,
        posCount,
        negCount,
        count: posCount + negCount,
        isToday: dateStr === todayStr,
        pct: ((posCount + negCount) / maxCount) * 100,
      };
    });
  }, [days, todayStr, positiveHabits, negativeHabits, allLogs]);

  const chartMaxVal = useMemo(() => {
    let maxPos = 0, maxNeg = 0;
    chartData.forEach(({ posCount, negCount }) => {
      if (posCount > maxPos) maxPos = posCount;
      if (negCount > maxNeg) maxNeg = negCount;
    });
    return Math.max(1, maxPos, maxNeg);
  }, [chartData]);
  const CHART_BAR_HEIGHT_PX = 360;
  // 50 % / 50 % vůči dennímu plánu – horní (zdravé) a dolní (zlozvyky) polovina stejná výška i měřítko
  const HALF_CHART_PX = Math.round(CHART_BAR_HEIGHT_PX / 2);

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
  const CELL_W = 56;
  const LABEL_W = 210;
  const GAP = '8px';
  const gridCols = `${LABEL_W}px repeat(${days.length}, ${CELL_W}px)`;

  const getCellStyle = (completed, isToday, isFuture, busy, isNegative) => {
    const base = {
      appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
      width: `${CELL_W}px`, height: '56px', padding: 0, margin: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '14px', cursor: isFuture ? 'default' : 'pointer',
      border: 'none', outline: 'none', position: 'relative', overflow: 'hidden',
      transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s, opacity 0.18s',
      touchAction: 'manipulation',
      opacity: isFuture ? 0.18 : busy ? 0.55 : 1,
      pointerEvents: isFuture ? 'none' : 'auto',
    };
    if (completed) {
      if (isNegative) {
        return { ...base,
          background: 'linear-gradient(145deg, #dc2626 0%, #b91c1c 100%)',
          boxShadow: '0 4px 18px rgba(239,68,68,0.5), 0 0 0 1px rgba(248,113,113,0.3) inset',
          color: '#fff',
        };
      }
      return { ...base,
        background: 'linear-gradient(145deg, #22c55e 0%, #15803d 100%)',
        boxShadow: '0 4px 18px rgba(34,197,94,0.5), 0 0 0 1px rgba(74,222,128,0.3) inset',
        color: '#fff',
      };
    }
    if (isToday) {
      return { ...base,
        background: 'rgba(109,40,217,0.18)',
        boxShadow: '0 0 0 1.5px rgba(139,92,246,0.5) inset',
        color: '#a78bfa',
      };
    }
    return { ...base,
      background: 'rgba(255,255,255,0.055)',
      boxShadow: '0 0 0 1.5px rgba(255,255,255,0.09) inset',
      color: '#475569',
    };
  };

  const renderHabitRow = (h, isNegative) => (
    <>
      <div key={`lbl-${h.id}`} className="hg-label">
        <span className="hg-emoji" aria-hidden="true">{h.emoji}</span>
        <div className="hg-name-wrap">
          <span className="hg-name"><strong>{h.label}</strong></span>
          {h.description && <span className="hg-hint"> ({h.description})</span>}
        </div>
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
            style={getCellStyle(completed, isToday, isFuture, busy, isNegative)}
            onClick={() => !isFuture && !busy && handleToggle(h.id, dateStr)}
            disabled={isFuture || busy}
            aria-pressed={completed}
            aria-label={`${h.label}, ${formatShortDate(dateStr)}${completed ? ', splněno' : ', nesplněno'}`}
            onMouseEnter={(e) => { if (!isFuture && !busy) { e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)'; e.currentTarget.style.boxShadow = completed ? (isNegative ? '0 8px 24px rgba(239,68,68,0.6)' : '0 8px 24px rgba(34,197,94,0.6)') : isToday ? '0 0 0 1.5px rgba(139,92,246,0.8) inset, 0 8px 20px rgba(0,0,0,0.3)' : '0 0 0 1.5px rgba(255,255,255,0.25) inset, 0 8px 20px rgba(0,0,0,0.25)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = getCellStyle(completed, isToday, isFuture, busy, isNegative).boxShadow; }}
            onMouseDown={(e) => { if (!isFuture && !busy) e.currentTarget.style.transform = 'scale(0.9)'; }}
            onMouseUp={(e) => { if (!isFuture && !busy) e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)'; }}
          >
            {busy ? (
              <span className="hg-spin" />
            ) : completed ? (
              isNegative ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )
            ) : (
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', border: isToday ? '2px solid rgba(167,139,250,0.65)' : '2px solid rgba(255,255,255,0.28)', display: 'block' }} />
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
          <p className="ht-hint">Odškrtnutí se ukládá pro daný den (sloupec). Po uložení uvidíš potvrzení „Splněno!“ – záznam zůstane i další den.</p>
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
          <div className="ht-content">
            <div className="hg-scroll" ref={scrollContainerRef}>
              <div className="hg-grid" style={{ gridTemplateColumns: gridCols, columnGap: GAP, rowGap: '6px' }}>

                {/* Date header row */}
                <div className="hg-corner" />
                {days.map((d) => (
                  <div key={d} ref={d === todayStr ? todayColRef : undefined} className={`hg-hdr-cell ${d === todayStr ? 'today' : ''}`}>
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

            <div className="ht-chart-wrap">
              <p className="ht-chart-title">Zdravé návyky (zelená) a zlozvyky (červená) po dnech</p>
              <div className="ht-chart-inner">
                <div className="ht-chart-y-axis">
                  {Array.from({ length: 2 * chartMaxVal + 1 }, (_, i) => chartMaxVal - i).map((n) => (
                    <span key={n} className="ht-chart-y-tick">{n}</span>
                  ))}
                </div>
                <div className="ht-chart-bars" style={{ height: `${CHART_BAR_HEIGHT_PX}px` }}>
                  {chartData.map(({ dateStr, posCount, negCount, isToday }) => {
                    const posPx = Math.max(0, (posCount / chartMaxVal) * HALF_CHART_PX);
                    const negPx = Math.max(0, (negCount / chartMaxVal) * HALF_CHART_PX);
                    return (
                      <div key={dateStr} className={`ht-chart-bar ${isToday ? 'today' : ''}`}>
                        <div className="ht-chart-bar-diverging">
                          <div className="ht-chart-bar-half ht-chart-bar-top">
                            {posPx > 0 && (
                              <div
                                className="ht-chart-bar-fill pos"
                                style={{ height: `${posPx}px` }}
                                title={`${posCount} zdravé splněno`}
                              />
                            )}
                          </div>
                          <div className="ht-chart-bar-half ht-chart-bar-bottom">
                            {negPx > 0 && (
                              <div
                                className="ht-chart-bar-fill neg"
                                style={{ height: `${negPx}px` }}
                                title={`${negCount} zlozvyků`}
                              />
                            )}
                          </div>
                        </div>
                        <span className="ht-chart-bar-value">
                          {posCount > 0 && <span className="ht-bar-pos">{posCount}</span>}
                          {posCount > 0 && negCount > 0 && <span className="ht-bar-sep"> / </span>}
                          {negCount > 0 && <span className="ht-bar-neg">{negCount}</span>}
                          {posCount === 0 && negCount === 0 && '0'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="ht-chart-labels">
                {chartData.map(({ dateStr, isToday }) => (
                  <span key={dateStr} className={`ht-chart-label ${isToday ? 'today' : ''}`}>
                    {new Date(dateStr + 'T12:00:00Z').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }).replace(' ', '')}
                    {isToday && ' (dnes)'}
                  </span>
                ))}
              </div>
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

        .ht-content {
          display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap;
        }
        .hg-scroll { flex: 1; min-width: 280px; }

        .ht-chart-wrap {
          flex-shrink: 0;
          width: 580px;
          padding: 32px;
          border-radius: 20px;
          background: linear-gradient(160deg, rgba(22,32,55,0.98) 0%, rgba(10,15,30,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.02) inset;
        }
        .ht-chart-title {
          margin: 0 0 10px; font-size: 0.6875rem; font-weight: 700; color: #94a3b8;
          letter-spacing: 0.02em; text-transform: uppercase;
        }
        .ht-chart-inner {
          display: flex; align-items: stretch; gap: 6px; margin-bottom: 6px;
        }
        .ht-chart-y-axis {
          display: flex; flex-direction: column; justify-content: space-between;
          height: 360px; padding: 0 4px 0 0;
          font-size: 0.5625rem; font-weight: 600; color: #64748b;
          text-align: right; line-height: 1;
        }
        .ht-chart-y-tick { flex-shrink: 0; }
        .ht-chart-bars {
          display: flex; align-items: stretch; justify-content: space-between; gap: 10px;
          flex: 1; min-height: 360px;
        }
        .ht-chart-bar {
          flex: 1; min-width: 0; height: 100%;
          display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px;
        }
        .ht-chart-bar-diverging {
          display: flex; flex-direction: column; justify-content: center;
          width: 100%; max-width: 52px; min-width: 12px; height: 100%;
        }
        .ht-chart-bar-half {
          flex: 1; display: flex; flex-direction: column; min-height: 0;
        }
        .ht-chart-bar-top {
          justify-content: flex-end;
        }
        .ht-chart-bar-bottom {
          justify-content: flex-start;
        }
        .ht-chart-bar-fill {
          width: 100%; min-height: 4px;
          transition: height 0.4s ease-out;
        }
        .ht-chart-bar-fill.pos {
          border-radius: 6px 6px 0 0;
          background: linear-gradient(180deg, #34d399, #10b981);
          box-shadow: 0 0 12px rgba(52,211,153,0.4);
        }
        .ht-chart-bar-fill.neg {
          border-radius: 0 0 6px 6px;
          background: linear-gradient(0deg, #f87171, #dc2626);
          box-shadow: 0 0 10px rgba(248,113,113,0.35);
        }
        .ht-chart-bar.today .ht-chart-bar-fill.pos {
          background: linear-gradient(180deg, #34d399, #10b981);
          box-shadow: 0 0 14px rgba(52,211,153,0.6), 0 0 0 2px rgba(255,255,255,0.4);
        }
        .ht-chart-bar.today .ht-chart-bar-fill.neg {
          background: linear-gradient(0deg, #f87171, #dc2626);
          box-shadow: 0 0 14px rgba(248,113,113,0.6), 0 0 0 2px rgba(255,255,255,0.4);
        }
        .ht-chart-bar-value {
          font-size: 0.625rem; font-weight: 600; color: #94a3b8;
        }
        .ht-chart-bar-value .ht-bar-pos { color: #34d399; }
        .ht-chart-bar-value .ht-bar-neg { color: #f87171; }
        .ht-chart-bar-value .ht-bar-sep { color: #64748b; margin: 0 1px; font-weight: 400; }
        .ht-chart-bar.today .ht-chart-bar-value .ht-bar-pos { color: #34d399; }
        .ht-chart-bar.today .ht-chart-bar-value .ht-bar-neg { color: #f87171; }
        .ht-chart-labels {
          display: flex; justify-content: space-between; gap: 6px;
          font-size: 0.5625rem; color: #64748b; font-weight: 500;
        }
        .ht-chart-label { flex: 1; min-width: 0; text-align: center; font-size: 0.625rem; }
        .ht-chart-label.today { color: #34d399; font-weight: 700; }

        @media (max-width: 720px) {
          .ht-content { flex-direction: column; }
          .ht-chart-wrap { width: 100%; }
        }

        /* ── Top header ── */
        .ht-top {
          display: flex; align-items: center; justify-content: space-between;
          gap: 20px; margin-bottom: 20px;
        }
        .ht-title {
          margin: 0 0 4px; font-size: 1.625rem; font-weight: 800;
          letter-spacing: -0.025em; color: #f8fafc;
        }
        .ht-date { margin: 0; font-size: 0.8125rem; color: #475569; font-weight: 500; text-transform: capitalize; }
        .ht-hint { margin: 6px 0 0; font-size: 0.75rem; color: #64748b; line-height: 1.4; max-width: 320px; }
        .ht-progress-inline { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; flex-shrink: 0; }
        .ht-prog-nums { font-size: 1.125rem; font-weight: 800; color: #f8fafc; letter-spacing: -0.02em; }
        .ht-prog-sep { color: #334155; margin: 0 3px; font-weight: 400; }
        .ht-prog-bar-wrap { width: 130px; height: 4px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
        .ht-prog-bar {
          height: 100%; border-radius: 999px;
          background: linear-gradient(90deg, #34d399, #10b981, #059669);
          transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
          box-shadow: 0 0 10px rgba(52,211,153,0.55);
        }

        /* ── Outer card ── */
        .hg-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.5) transparent;
          border-radius: 20px;
          background: linear-gradient(160deg, rgba(22,32,55,0.98) 0%, rgba(10,15,30,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.02) inset;
        }
        .hg-scroll::-webkit-scrollbar { height: 8px; }
        .hg-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); border-radius: 4px; }
        .hg-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.5); border-radius: 4px; }
        .hg-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.7); }
        .hg-grid {
          display: grid; padding: 18px 20px 24px; min-width: max-content;
        }
        .hg-corner { height: 60px; }

        /* ── Date headers ── */
        .hg-hdr-cell {
          height: 60px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          border-radius: 12px;
          background-color: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          font-weight: 700; color: #475569; user-select: none;
          transition: background-color 0.2s;
        }
        .hg-hdr-cell.today {
          background-color: transparent;
          background-image: linear-gradient(145deg, rgba(124,58,237,0.4) 0%, rgba(99,47,210,0.3) 100%);
          border-color: rgba(139,92,246,0.6);
          color: #ddd6fe;
          box-shadow: 0 0 24px rgba(124,58,237,0.25), 0 0 0 1px rgba(167,139,250,0.15) inset;
        }
        .hg-hdr-day { font-size: 0.8125rem; font-weight: 700; line-height: 1; }
        .hg-hdr-today { font-size: 0.5625rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: #a78bfa; }

        /* ── Section bars ── */
        .hg-section-bar {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.625rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase;
          padding: 16px 2px 8px;
        }
        .hg-section-bar.pos { color: #34d399; }
        .hg-section-bar.neg { color: #f87171; }
        .hg-section-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #22c55e; box-shadow: 0 0 8px #22c55e; flex-shrink: 0;
          animation: ht-pulse 2.5s ease-in-out infinite;
        }
        .hg-section-dot.neg { background: #f87171; box-shadow: 0 0 8px #f87171; }
        @keyframes ht-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* ── Habit label ── */
        .hg-label {
          display: flex; align-items: flex-start; gap: 10px;
          min-height: 56px; padding-right: 16px; overflow: hidden;
        }
        .hg-emoji { font-size: 1.3rem; flex-shrink: 0; line-height: 1; margin-top: 2px; }
        .hg-name-wrap {
          display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px;
          min-width: 0; overflow: hidden; line-height: 1.35; font-size: 1rem;
        }
        .hg-name {
          font-size: 1em; font-weight: 700; color: #f1f5f9;
        }
        .hg-name strong { font-weight: 700; }
        .hg-hint {
          font-size: 0.55em; color: #64748b; font-weight: 400;
          font-family: inherit; line-height: 1.35;
        }

        /* ── Habit cell – CRITICAL: reset button defaults ── */
        .hg-cell {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          width: ${CELL_W}px;
          height: 56px;
          padding: 0; margin: 0;
          display: flex; align-items: center; justify-content: center;
          background-color: rgba(255,255,255,0.05);
          border: 1.5px solid rgba(255,255,255,0.09);
          border-radius: 14px;
          color: #94a3b8;
          cursor: pointer;
          transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), background-color 0.18s, border-color 0.18s, box-shadow 0.18s;
          touch-action: manipulation;
          outline: none;
          position: relative;
          overflow: hidden;
        }
        .hg-cell::before {
          content: '';
          position: absolute; inset: 0; border-radius: 13px;
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08) 0%, transparent 70%);
          opacity: 0; transition: opacity 0.2s;
        }
        .hg-cell:hover:not(:disabled):not(.future)::before { opacity: 1; }
        .hg-cell:hover:not(:disabled):not(.future) {
          background-color: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.22);
          transform: scale(1.1) translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.25);
        }
        .hg-cell:active:not(:disabled):not(.future) {
          transform: scale(0.9);
          transition-duration: 0.08s;
        }

        /* Today column */
        .hg-cell.today:not(.done) {
          background-color: rgba(109,40,217,0.15);
          border-color: rgba(139,92,246,0.4);
        }
        .hg-cell.today:not(.done):hover:not(:disabled) {
          background-color: rgba(109,40,217,0.25);
          border-color: rgba(139,92,246,0.65);
        }

        /* Completed */
        .hg-cell.done {
          background-color: transparent;
          background-image: linear-gradient(145deg, #22c55e 0%, #15803d 100%);
          border-color: transparent;
          box-shadow: 0 4px 16px rgba(34,197,94,0.45), 0 0 0 1px rgba(74,222,128,0.25) inset;
          color: #fff;
        }
        .hg-cell.done:hover:not(:disabled) {
          background-image: linear-gradient(145deg, #16a34a 0%, #14532d 100%);
          transform: scale(1.07) translateY(-1px);
          box-shadow: 0 6px 20px rgba(34,197,94,0.55);
        }

        /* Future */
        .hg-cell.future {
          opacity: 0.18; cursor: default; pointer-events: none;
          background-color: rgba(255,255,255,0.02);
          border-color: rgba(255,255,255,0.05);
        }
        .hg-cell.busy { opacity: 0.55; cursor: wait; transform: none !important; }

        /* Inner icons */
        .hg-circle {
          width: 22px; height: 22px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.28); display: block;
          transition: border-color 0.18s, transform 0.18s;
        }
        .hg-cell.today:not(.done) .hg-circle { border-color: rgba(167,139,250,0.55); }
        .hg-cell:hover:not(:disabled):not(.future) .hg-circle {
          border-color: rgba(255,255,255,0.75);
          transform: scale(1.1);
        }
        .hg-check { width: 24px; height: 24px; color: #fff; flex-shrink: 0; }
        .hg-spin {
          width: 20px; height: 20px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.12); border-top-color: #fff;
          animation: hg-spin 0.7s linear infinite; display: block;
        }
        @keyframes hg-spin { to { transform: rotate(360deg); } }

        /* Tip */
        .ht-tip {
          margin-top: 16px; padding: 14px 18px;
          background: rgba(248,250,252,0.02); border: 1px solid rgba(248,250,252,0.05);
          border-radius: 14px;
        }
        .ht-tip-text { margin: 0; font-size: 0.8125rem; line-height: 1.55; color: #475569; }

        /* Loading / error */
        .ht-loading {
          display: flex; flex-direction: column; align-items: center;
          gap: 14px; padding: 52px 24px; color: #475569; font-size: 0.875rem;
        }
        .ht-spin-lg {
          width: 36px; height: 36px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.06); border-top-color: #34d399;
          animation: hg-spin 0.9s linear infinite; display: block;
        }
        .ht-error {
          text-align: center; padding: 28px;
          background: rgba(248,250,252,0.02); border: 1px solid rgba(248,250,252,0.05);
          border-radius: 14px; color: #64748b; font-size: 0.875rem;
        }
        .ht-retry {
          margin-top: 12px; padding: 10px 22px;
          background: rgba(248,250,252,0.07); border: 1px solid rgba(248,250,252,0.1);
          border-radius: 8px; color: #e2e8f0; font-size: 0.8125rem;
          font-weight: 500; cursor: pointer; transition: background 0.2s;
        }
        .ht-retry:hover { background: rgba(248,250,252,0.12); }

        @media (max-width: 640px) {
          .habit-tracker { margin-bottom: 32px; }
          .ht-title { font-size: 1.25rem; }
          .ht-prog-bar-wrap { width: 90px; }
          .hg-grid { padding: 14px 14px 18px; }
        }
      `}</style>
    </section>
  );
}
