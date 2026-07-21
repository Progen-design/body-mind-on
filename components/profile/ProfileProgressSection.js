import { useEffect, useMemo, useState } from 'react';
import {
  PROGRESS_PERIODS,
  normalizeMeasurementPoints,
  buildMeasuredWeightChart,
  getWeightTrend,
  getPeriodBounds,
  computeActivitySummary,
  getRecommendedNextStep,
} from '../../lib/progressIntegrity';
import { parseActivityStatsDays, pickSparseLabelIndices } from '../../lib/stats/activityStats';
import AddMeasurementModal from './AddMeasurementModal';

function formatShortDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  return `${Number(day)}.${Number(m)}.`;
}

function formatKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1).replace('.', ',')} kg`;
}

function formatCm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1).replace('.', ',')} cm`;
}

function workoutTypeLabel(type) {
  const map = {
    silovy: 'Silový', kardio: 'Kardio', beh: 'Běh', kolo: 'Kolo', chuze: 'Chůze',
    plavani: 'Plavání', joga: 'Jóga', jine: 'Jiný',
  };
  return map[String(type || '').toLowerCase()] || 'Trénink';
}

function sourceChartLabel(source) {
  if (source === 'withings') return 'Withings';
  if (source === 'registration') return 'Registrace';
  if (source === 'manual' || source === 'body_metrics') return 'Ručně zadané';
  return 'Měření';
}

function periodIdToDays(periodId) {
  return parseActivityStatsDays(periodId === 'all' ? 'all' : periodId);
}

export default function ProfileProgressSection({
  profile,
  withingsWeightHistory = [],
  goalWeightKg = null,
  onMeasurementsChanged,
  accessToken,
}) {
  const [periodId, setPeriodId] = useState('30');
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [apiStats, setApiStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const registrationMetric = useMemo(() => {
    const metrics = [...(profile?.body_metrics || [])].sort(
      (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')),
    );
    return metrics[0] || null;
  }, [profile?.body_metrics]);

  const activePlan = useMemo(
    () => (profile?.plans || []).find((p) => p.is_active === true) || null,
    [profile?.plans],
  );

  useEffect(() => {
    if (!accessToken) {
      setApiStats(null);
      return undefined;
    }
    let cancelled = false;
    const days = periodIdToDays(periodId);
    setStatsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/stats/activity?days=${days}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setApiStats(json?.stats || null);
      } catch {
        if (!cancelled) setApiStats(null);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, periodId, profile?._updated]);

  const { allPoints, chartData, weightTrend, activity, nextStep, bodyFromApi } = useMemo(() => {
    const normalized = normalizeMeasurementPoints({
      bodyMeasurements: profile?.body_measurements || [],
      bodyMetrics: profile?.body_metrics || [],
      withingsHistory: withingsWeightHistory,
      registrationMetric,
      registrationMetricId: registrationMetric?.id,
    });
    const chart = buildMeasuredWeightChart(normalized.weightSeries);
    const trend = getWeightTrend(normalized.weightSeries);
    const localAct = computeActivitySummary({
      periodId,
      userCreatedAt: profile?.user?.created_at,
      workouts: profile?.workouts || [],
      dailyCompletions: profile?.daily_activity_completions || [],
      dailyCheckins: profile?.daily_checkins || [],
      habitLogs: profile?.habit_logs_progress || [],
      plan: activePlan,
    });
    const bounds = getPeriodBounds(periodId, profile?.user?.created_at);

    const act = apiStats
      ? {
          ...localAct,
          periodStart: bounds.startKey,
          periodEnd: bounds.endKey,
          completedWorkouts: apiStats.treninky,
          totalMinutes: apiStats.pohyb_min,
          kcalEstimateSecondary: apiStats.aktivni_kcal,
          activeDays: apiStats.aktivni_dny,
          periodDays: periodId === 'all' ? (apiStats.obdobi_dnu || 3650) : (Number(periodId) || localAct.periodDays),
          habitCompletions: apiStats.navyky_splnene,
          checkinsCount: apiStats.checkiny,
          completedPlanWorkouts: apiStats.treninky_plan,
          collectingData: apiStats.treninky <= 1 && apiStats.aktivni_dny <= 1,
        }
      : localAct;

    const body = apiStats && (apiStats.vaha_start != null || apiStats.vaha_konec != null)
      ? {
          start: apiStats.vaha_start,
          end: apiStats.vaha_konec,
          delta: apiStats.vaha_zmena,
        }
      : null;

    const step = getRecommendedNextStep({ weightTrend: trend, activity: act });
    return {
      allPoints: normalized.allPoints,
      chartData: chart,
      weightTrend: trend,
      activity: act,
      nextStep: step,
      bodyFromApi: body,
    };
  }, [
    profile,
    withingsWeightHistory,
    registrationMetric,
    activePlan,
    periodId,
    apiStats,
  ]);

  const latestCircumference = useMemo(() => {
    const withCirc = [...allPoints].reverse().find(
      (p) => p.waist_cm != null || p.hips_cm != null || p.chest_cm != null || p.arm_cm != null,
    );
    return withCirc || null;
  }, [allPoints]);

  const weightChartLabelIndices = useMemo(
    () => new Set(pickSparseLabelIndices(chartData.length, 8)),
    [chartData],
  );

  return (
    <section className="card card-accent center progress-section progress-detail-end profile-progress-integrity">
      <h2 className="section-head">Tvůj progres</h2>

      <div className="profile-progress-periods" role="tablist" aria-label="Období progresu">
        {PROGRESS_PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={periodId === p.id}
            className={`profile-progress-period ${periodId === p.id ? 'profile-progress-period--active' : ''}`}
            onClick={() => setPeriodId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="progress-dates">
        Období: <strong>{formatShortDate(activity.periodStart)}</strong> – <strong>{formatShortDate(activity.periodEnd)}</strong>
        {statsLoading ? <span className="profile-progress-meta"> · načítám…</span> : null}
      </p>

      <div className="profile-progress-block">
        <h3 className="profile-progress-subhead">Aktivita</h3>
        <div className="profile-progress-kpis">
          <div className="profile-progress-kpi">
            <span className="profile-progress-kpi-num">{activity.completedWorkouts}</span>
            <span className="profile-progress-kpi-label">dokončené tréninky</span>
          </div>
          <div className="profile-progress-kpi">
            <span className="profile-progress-kpi-num">{activity.totalMinutes} min</span>
            <span className="profile-progress-kpi-label">čas v pohybu</span>
          </div>
          <div className="profile-progress-kpi">
            <span className="profile-progress-kpi-num">{activity.activeDays}</span>
            <span className="profile-progress-kpi-label">aktivní dny</span>
          </div>
          <div className="profile-progress-kpi">
            <span className="profile-progress-kpi-num">{activity.habitCompletions}</span>
            <span className="profile-progress-kpi-label">dokončené návyky</span>
          </div>
          <div className="profile-progress-kpi">
            <span className="profile-progress-kpi-num">{activity.checkinsCount}</span>
            <span className="profile-progress-kpi-label">check-iny</span>
          </div>
        </div>
        {activity.kcalEstimateSecondary > 0 && (
          <p className="profile-progress-kcal-secondary" title="Jde pouze o orientační odhad. Skutečný výdej závisí na intenzitě, hmotnosti, kondici a dalších faktorech.">
            Orientační odhad energetického výdeje: ~{activity.kcalEstimateSecondary} kcal
          </p>
        )}
      </div>

      <div className="profile-progress-block">
        <h3 className="profile-progress-subhead">Konzistence</h3>
        <ul className="profile-progress-list">
          <li>Aktivní {activity.activeDays} z {activity.periodDays} dní</li>
          {activity.plannedWorkouts > 0 && (
            <li>
              Dokončeno {activity.completedPlanWorkouts} z {activity.plannedWorkouts} plánovaných tréninků
            </li>
          )}
          <li>Aktuální série: {activity.currentStreak} {activity.currentStreak === 1 ? 'den' : activity.currentStreak < 5 ? 'dny' : 'dní'}</li>
          {activity.bestStreak > 0 && (
            <li>Nejlepší série: {activity.bestStreak} {activity.bestStreak === 1 ? 'den' : activity.bestStreak < 5 ? 'dny' : 'dní'}</li>
          )}
          <li>Vyplněné check-iny: {activity.checkinsCount}</li>
        </ul>
        {activity.collectingData && (
          <p className="profile-progress-neutral">Zatím sbíráme první data.</p>
        )}
      </div>

      <div className="profile-progress-block">
        <h3 className="profile-progress-subhead">Tělesné měření</h3>
        {bodyFromApi ? (
          <>
            <p className="profile-progress-measure-row">
              <strong>Hmotnost</strong>{' '}
              {bodyFromApi.start != null ? formatKg(bodyFromApi.start) : '—'}
              {' → '}
              {bodyFromApi.end != null ? formatKg(bodyFromApi.end) : '—'}
            </p>
            {bodyFromApi.delta != null && Number.isFinite(Number(bodyFromApi.delta)) && (
              <p className="profile-progress-measure-row">
                Změna: {Number(bodyFromApi.delta) > 0 ? '+' : ''}
                {Number(bodyFromApi.delta).toFixed(1).replace('.', ',')} kg
              </p>
            )}
          </>
        ) : (
          <>
            {weightTrend.state === 'none' && (
              <>
                <p className="profile-progress-empty">Přidej první měření a začni sledovat svůj vývoj.</p>
                <p className="profile-progress-empty">Zatím nemáme dostatek skutečných měření pro zobrazení trendu.</p>
              </>
            )}
            {weightTrend.state === 'single' && weightTrend.latest && (
              <>
                <p className="profile-progress-measure-row">
                  <strong>Hmotnost</strong> {formatKg(weightTrend.latest.weight_kg)}
                  <span className="profile-progress-meta"> · {formatShortDate(weightTrend.latest.date)} · {weightTrend.latest.source_label}</span>
                </p>
                <p className="profile-progress-neutral">{weightTrend.message}</p>
              </>
            )}
            {weightTrend.state === 'trend' && (
              <>
                <p className="profile-progress-measure-row">
                  <strong>Hmotnost</strong>{' '}
                  {formatKg(weightTrend.first.weight_kg)} → {formatKg(weightTrend.last.weight_kg)}
                </p>
                <p className="profile-progress-measure-row">
                  Změna: {weightTrend.delta_kg > 0 ? '+' : ''}{weightTrend.delta_kg.toFixed(1).replace('.', ',')} kg
                  {' · '}Období: {weightTrend.days} dní
                </p>
                <p className="profile-progress-neutral">{weightTrend.message}</p>
              </>
            )}
          </>
        )}
        {latestCircumference && (
          <div className="profile-progress-circumferences">
            {latestCircumference.waist_cm != null && <span>Pas {formatCm(latestCircumference.waist_cm)}</span>}
            {latestCircumference.hips_cm != null && <span>Boky {formatCm(latestCircumference.hips_cm)}</span>}
            {latestCircumference.chest_cm != null && <span>Hrudník {formatCm(latestCircumference.chest_cm)}</span>}
            {latestCircumference.arm_cm != null && <span>Paže {formatCm(latestCircumference.arm_cm)}</span>}
          </div>
        )}
        <button type="button" className="profile-progress-cta" onClick={() => setShowMeasurementModal(true)}>
          Přidat měření
        </button>
        {chartData.length >= 1 && (
          <div className="profile-progress-chart-wrap">
            {chartData.length >= 2 ? (
              <div className="chart-wrapper">
                <div className="chart-svg-wrap">
                  <svg className="chart-svg" viewBox="0 0 560 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="weightGradProgress" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#9b5cff" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {(() => {
                      const data = chartData;
                      const pad = { t: 24, r: 28, b: 40, l: 48 };
                      const W = 560 - pad.l - pad.r;
                      const H = 200 - pad.t - pad.b;
                      const weights = data.map((x) => x.weight);
                      const minW = Math.min(...weights);
                      const maxW = Math.max(...weights);
                      const rangeRaw = maxW - minW || 1;
                      const margin = Math.max(rangeRaw * 0.08, 0.2);
                      const range = rangeRaw + 2 * margin;
                      const minWPlot = minW - margin;
                      const pts = data.map((p, i) => {
                        const x = pad.l + (data.length > 1 ? (i / (data.length - 1)) * W : 0);
                        const y = pad.t + H - ((p.weight - minWPlot) / range) * H;
                        return [x, y, p.weight, p.date, p.source];
                      });
                      const pathD = pts.length ? `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')}` : '';
                      const areaD = pathD ? `${pathD} L ${pad.l + W} ${pad.t + H} L ${pad.l} ${pad.t + H} Z` : '';
                      const goalY = goalWeightKg != null && Number.isFinite(goalWeightKg)
                        ? pad.t + H - ((goalWeightKg - minWPlot) / range) * H
                        : null;
                      return (
                        <>
                          {areaD && <path fill="url(#weightGradProgress)" d={areaD} />}
                          <path fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d={pathD} />
                          {goalY != null && goalY >= pad.t && goalY <= pad.t + H && (
                            <line x1={pad.l} y1={goalY} x2={pad.l + W} y2={goalY} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="6 4" />
                          )}
                          {pts.map(([x, y, weight, date, source], i) => (
                            <g key={`${date}-${i}`}>
                              <circle cx={x} cy={y} r="4" fill="#a78bfa" />
                              <title>{`${formatShortDate(date)}: ${weight} kg · ${sourceChartLabel(source)}`}</title>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
                <div className="chart-labels">
                  <div className="chart-labels-inner" style={{ paddingLeft: '8.57%', paddingRight: '5%' }}>
                    {chartData.map((p, i) => (
                      weightChartLabelIndices.has(i) ? (
                        <div
                          key={`${p.date}-${i}`}
                          className="chart-label-item"
                          style={{
                            left: chartData.length > 1 ? `${(i / (chartData.length - 1)) * 100}%` : '50%',
                            transform: 'translateX(-50%)',
                          }}
                        >
                          <span className="chart-value">{p.weight} kg</span>
                          <span className="chart-date">{formatShortDate(p.date)}</span>
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="chart-single">
                <span className="chart-value">{chartData[0]?.weight} kg</span>
                <span className="chart-date">{formatShortDate(chartData[0]?.date)}</span>
              </div>
            )}
            {goalWeightKg != null && Number.isFinite(goalWeightKg) && (
              <p className="profile-progress-goal-hint">Vodorovná čára = cílová hmotnost ({formatKg(goalWeightKg)})</p>
            )}
          </div>
        )}
      </div>

      <div className="profile-progress-block">
        <h3 className="profile-progress-subhead">Výkonnost</h3>
        {activity.completedWorkouts === 0 ? (
          <p className="profile-progress-empty">Dokonči několik tréninků, abychom mohli ukázat vývoj výkonu.</p>
        ) : (
          <>
            <p className="profile-progress-measure-row">
              Dokončené tréninky: <strong>{activity.completedWorkouts}</strong>
              {' · '}Celkový čas: <strong>{activity.totalMinutes} min</strong>
            </p>
            {activity.recentWorkouts.length > 0 && (
              <ul className="profile-progress-list">
                {activity.recentWorkouts.map((w) => (
                  <li key={w.id}>
                    {formatShortDate(w.workout_date)} — {workoutTypeLabel(w.workout_type)}
                    {w.duration_min ? `, ${w.duration_min} min` : ''}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="profile-progress-block profile-progress-next">
        <h3 className="profile-progress-subhead">Doporučený další krok</h3>
        <p>{nextStep}</p>
      </div>

      {showMeasurementModal && (
        <AddMeasurementModal
          accessToken={accessToken}
          onClose={() => setShowMeasurementModal(false)}
          onSaved={() => {
            setShowMeasurementModal(false);
            onMeasurementsChanged?.();
          }}
        />
      )}

      <style jsx>{`
        .profile-progress-periods {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin: 12px 0 8px;
        }
        .profile-progress-period {
          border: 1px solid rgba(167, 139, 250, 0.35);
          background: rgba(30, 20, 50, 0.5);
          color: #e9d5ff;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .profile-progress-period--active {
          background: rgba(124, 58, 237, 0.45);
          border-color: #a78bfa;
        }
        .profile-progress-block {
          text-align: left;
          margin: 20px 0;
          padding: 16px;
          border-radius: 12px;
          background: rgba(15, 10, 30, 0.35);
          border: 1px solid rgba(167, 139, 250, 0.15);
        }
        .profile-progress-subhead {
          margin: 0 0 12px;
          font-size: 1rem;
          color: #ddd6fe;
        }
        .profile-progress-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
        }
        .profile-progress-kpi {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .profile-progress-kpi-num {
          font-size: 1.35rem;
          font-weight: 700;
          color: #f5f3ff;
        }
        .profile-progress-kpi-label {
          font-size: 0.8rem;
          color: #c4b5fd;
        }
        .profile-progress-kcal-secondary {
          margin: 12px 0 0;
          font-size: 0.82rem;
          color: #a8a29e;
          cursor: help;
        }
        .profile-progress-list {
          margin: 0;
          padding-left: 1.1rem;
          color: #e7e5e4;
          line-height: 1.6;
        }
        .profile-progress-empty, .profile-progress-neutral {
          color: #d6d3d1;
          margin: 8px 0;
        }
        .profile-progress-measure-row {
          margin: 6px 0;
          color: #f5f5f4;
        }
        .profile-progress-meta {
          color: #a8a29e;
          font-size: 0.85rem;
        }
        .profile-progress-circumferences {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 10px 0;
          font-size: 0.9rem;
          color: #d6d3d1;
        }
        .profile-progress-cta {
          margin-top: 10px;
          background: linear-gradient(135deg, #7c3aed, #5b21b6);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 10px 16px;
          cursor: pointer;
          font-weight: 600;
        }
        .profile-progress-chart-wrap {
          margin-top: 14px;
        }
        .profile-progress-goal-hint {
          font-size: 0.8rem;
          color: #fbbf24;
          margin-top: 8px;
        }
        .profile-progress-next p {
          margin: 0;
          color: #e7e5e4;
        }
        @media (max-width: 640px) {
          .profile-progress-kpis {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </section>
  );
}
