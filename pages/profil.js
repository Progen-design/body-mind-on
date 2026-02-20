// /pages/profil.js – Modern Premium Profil (real-time update zachován)

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BodyFigure from '../components/BodyFigure';
import { supabase } from '../lib/supabaseClient';

const WORKOUT_TYPES = [
  { id: 'silovy', label: 'Silový', emoji: '🏋️' },
  { id: 'kardio', label: 'Kardio', emoji: '🏃' },
  { id: 'strečink', label: 'Strečink', emoji: '🧘' },
  { id: 'joga', label: 'Jóga', emoji: '🪷' },
  { id: 'ostatni', label: 'Ostatní', emoji: '✨' },
];

const KCAL_PER_MIN_BY_TYPE = {
  silovy: 5,
  kardio: 8,
  strečink: 2.5,
  joga: 3,
  ostatni: 4,
};

function estimatedCalories(workout) {
  const type = (workout.workout_type || 'ostatni').toLowerCase();
  const min = Number(workout.duration_min) || 0;
  const kcalPerMin = KCAL_PER_MIN_BY_TYPE[type] ?? KCAL_PER_MIN_BY_TYPE.ostatni;
  return Math.round(min * kcalPerMin);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatShortDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
  });
}

export default function Profil() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [workoutError, setWorkoutError] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);

  const [workoutForm, setWorkoutForm] = useState({
    workout_date: new Date().toISOString().split('T')[0],
    workout_type: 'silovy',
    duration_min: 45,
    notes: '',
  });

  const [weightForm, setWeightForm] = useState({
    date: new Date().toISOString().split('T')[0],
    weight_kg: '',
  });

  const fetchOptions = { cache: 'no-store' as RequestCache };

  const fetchProfileWithToken = (accessToken) =>
    fetch('/api/profile', {
      ...fetchOptions,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return { error: data.error };
        }
        setProfile(data);
        setError('');
        return { ok: true };
      });

  const refetchProfile = (token) => {
    const t = token ?? session?.access_token;
    if (!t) return Promise.resolve();
    return fetchProfileWithToken(t);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session: s }, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionErr || !s) {
        router.replace('/login');
        return;
      }
      // Obnovení tokenu před načtením profilu (na webu často vyprší)
      const { data: { session: fresh }, error: refreshErr } = await supabase.auth.refreshSession();
      const sessionToUse = !refreshErr && fresh ? fresh : s;
      setSession(sessionToUse);

      let result = await fetchProfileWithToken(sessionToUse.access_token);
      if (cancelled) return;
      if (result?.error === 'Neplatná session' || result?.error === 'Nejste přihlášen') {
        const { data: { session: retrySession } } = await supabase.auth.refreshSession();
        if (retrySession) {
          result = await fetchProfileWithToken(retrySession.access_token);
          if (result?.ok) {
            setSession(retrySession);
          }
        }
        if (cancelled) return;
        if (result?.error) {
          await supabase.auth.signOut();
          router.replace('/login');
          return;
        }
      }
    })()
      .catch(() => { if (!cancelled) setError('Nepodařilo se načíst profil.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function handleAddWorkout(e) {
    e.preventDefault();
    setWorkoutError('');
    setSavingWorkout(true);
    try {
      // Obnovit token před voláním (na produkci často vyprší)
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      if (!token) {
        setWorkoutError('Session vypršela. Odhlas se a přihlas znovu.');
        return;
      }

      const res = await fetch('/api/workouts', {
        ...fetchOptions,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(workoutForm),
      });

      const json = await res.json();
      if (res.ok && json.workout) {
        const newWorkout = json.workout;
        setProfile((p) => {
          const prev = p || {};
          return { ...prev, workouts: [newWorkout, ...(prev.workouts || [])] };
        });
        setWorkoutForm({ workout_date: new Date().toISOString().split('T')[0], workout_type: 'silovy', duration_min: 45, notes: '' });
        setShowWorkoutModal(false);
        if (fresh) setSession(fresh);
        const refetchResult = await refetchProfile(token);
        if (refetchResult?.ok) {
          /* Profil načten ze serveru, data v pořádku */
        } else {
          /* Optimistic update zůstává – nový trénink už je ve stavu */
        }
      } else {
        setWorkoutError(json.error || 'Chyba při ukládání tréninku');
      }
    } catch (err) {
      setWorkoutError(err.message || 'Chyba připojení');
    } finally {
      setSavingWorkout(false);
    }
  }

  async function handleDeleteWorkout(id) {
    if (!confirm('Opravdu smazat tento trénink?')) return;
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      const res = await fetch(`/api/workouts?id=${id}`, {
        ...fetchOptions,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setProfile((p) => {
          const prev = p || {};
          return { ...prev, workouts: (prev.workouts || []).filter((w) => w.id !== id) };
        });
        if (fresh) setSession(fresh);
        await refetchProfile(token);
      }
    } catch (err) {
      console.error('Delete workout error:', err);
    }
  }

  async function handleAddWeight(e) {
    e.preventDefault();
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      const res = await fetch('/api/quick-weight', {
        ...fetchOptions,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          weight_kg: Number(weightForm.weight_kg),
          date: weightForm.date,
        }),
      });
      const json = await res.json();
      if (res.ok && json.metric) {
        setProfile((p) => {
          const prev = p || {};
          return { ...prev, body_metrics: [json.metric, ...(prev.body_metrics || [])] };
        });
        setWeightForm((f) => ({ ...f, weight_kg: '' }));
        setShowWeightModal(false);
        if (fresh) setSession(fresh);
        await refetchProfile(token);
      }
    } catch (err) {
      console.error('Add weight error:', err);
    }
  }

  if (!session && !loading) return null;

  const metrics = profile?.body_metrics || [];
  const workouts = profile?.workouts || [];
  const latestMetric = metrics[0];
  const firstMetric = metrics[metrics.length - 1];

  const currentWeight = latestMetric?.weight_kg ?? null;
  const weightDiff =
    latestMetric && firstMetric
      ? (latestMetric.weight_kg - firstMetric.weight_kg).toFixed(1)
      : null;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysToMonday);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const workoutDateStr = (w) => (w.workout_date || '').toString().slice(0, 10);
  const workoutsThisWeek = workouts.filter((w) => workoutDateStr(w) >= weekStartStr);
  const totalMinutesThisWeek = workoutsThisWeek.reduce(
    (sum, w) => sum + (Number(w.duration_min) || 0),
    0
  );
  const estimatedCaloriesThisWeek = workoutsThisWeek.reduce(
    (sum, w) => sum + estimatedCalories(w),
    0
  );
  const totalMinutes = workouts.reduce(
    (sum, w) => sum + (Number(w.duration_min) || 0),
    0
  );
  const estimatedCaloriesAll = workouts.reduce(
    (sum, w) => sum + estimatedCalories(w),
    0
  );

  const chartWeightData = metrics
    .filter((m) => m.weight_kg && m.created_at)
    .map((m) => ({
      date: m.created_at.split('T')[0],
      weight: m.weight_kg,
    }))
    .reverse();

  const userName =
    profile?.user?.name ||
    profile?.user?.email?.split('@')[0] ||
    'Sportovče';

  return (
    <>
      <Header />
      <main className="page">
        <section className="hero">
          <h1>
            Ahoj <span>{userName}</span> 👋
          </h1>
          <p>
            Každý trénink, každé měření. Tvoje tělo reaguje na každý krok.
          </p>
          <button onClick={handleLogout} className="logout">
            Odhlásit se
          </button>
        </section>

        {loading && <p className="loading">Načítám tvůj profil…</p>}

        {error && (
          <div className="error-banner" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => { setError(''); setLoading(true); window.location.reload(); }} className="btn-ghost">
              Obnovit stránku
            </button>
            <span> nebo </span>
            <button type="button" onClick={handleLogout} className="btn-ghost">
              Odhlásit se
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <p className="trainer-hint">
              Hodnoty se počítají automaticky z tvých záznamů – jako u trenéra. Přidej trénink nebo váhu a přehled se hned aktualizuje.
            </p>

            {/* POSTAVA */}
            <section className="card center">
              <h2>Tvůj progres</h2>

              {latestMetric ? (
                <>
                  <BodyFigure
                    weight={latestMetric.weight_kg}
                    height={latestMetric.height_cm}
                    gender={latestMetric.gender}
                    goal={latestMetric.goal}
                    size={150}
                  />
                  {currentWeight != null && <p className="weight-now">{currentWeight} kg</p>}
                  {weightDiff != null && (
                    <p className="trend">
                      Změna od začátku:{' '}
                      <strong>
                        {Number(weightDiff) > 0 ? '+' : ''}
                        {weightDiff} kg
                      </strong>
                    </p>
                  )}
                </>
              ) : (
                <p className="empty-progress">Zatím nemáš záznam měření. Klikni na „Přidat váhu“ a uvidíš zde postavu i trend.</p>
              )}
            </section>

            {/* RYCHLÉ AKCE */}
            <section className="card actions">
              <h2>Rychlé akce</h2>
              <div className="action-buttons">
                <button type="button" onClick={() => { setShowWorkoutModal(true); setWorkoutError(''); }} className="btn-primary">
                  + Zapsat trénink
                </button>
                <button type="button" onClick={() => setShowWeightModal(true)} className="btn-secondary">
                  ⚖️ Přidat váhu
                </button>
              </div>
            </section>

            {/* Historie tréninků */}
            <section className="card history-section">
              <h2>Historie tréninků</h2>
              {workouts.length === 0 ? (
                <p className="empty-history">Zatím nemáš žádné záznamy. Klikni na „Zapsat trénink“ a první trénink se objeví zde i v přehledu.</p>
              ) : (
                <ul className="workout-list">
                  {workouts.map((w) => (
                    <li key={w.id} className="workout-item">
                      <span className="workout-icon">{WORKOUT_TYPES.find((t) => t.id === (w.workout_type || '').toLowerCase())?.emoji || '🏋️'}</span>
                      <div className="workout-info">
                        <strong>{WORKOUT_TYPES.find((t) => t.id === (w.workout_type || '').toLowerCase())?.label || w.workout_name || 'Trénink'}</strong>
                        <span className="workout-meta">
                          {formatShortDate(w.workout_date)} · {(Number(w.duration_min) || 0)} min
                          {w.notes ? ` · ${w.notes}` : ''}
                        </span>
                      </div>
                      <button type="button" onClick={() => handleDeleteWorkout(w.id)} className="workout-delete" title="Smazat">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* KPI – tento týden + celkem */}
            <section className="kpi-section">
              <h2>Přehled jako u trenéra</h2>
              <p className="kpi-sub">Tento týden / Celkem</p>
              <div className="kpis">
                <div className="kpi">
                  <span className="kpi-icon">🏋️</span>
                  <h3>{workoutsThisWeek.length}</h3>
                  <p className="kpi-label">Tréninků</p>
                  <p className="kpi-total">{workouts.length} celkem</p>
                </div>
                <div className="kpi">
                  <span className="kpi-icon">⏱️</span>
                  <h3>{totalMinutesThisWeek} min</h3>
                  <p className="kpi-label">V pohybu</p>
                  <p className="kpi-total">{totalMinutes} min celkem</p>
                </div>
                <div className="kpi">
                  <span className="kpi-icon">🔥</span>
                  <h3>~{estimatedCaloriesThisWeek}</h3>
                  <p className="kpi-label">Spáleno (odhad)</p>
                  <p className="kpi-total">~{estimatedCaloriesAll} kcal celkem</p>
                </div>
                <div className="kpi">
                  <span className="kpi-icon">⚖️</span>
                  <h3>{currentWeight != null ? `${currentWeight} kg` : '—'}</h3>
                  <p className="kpi-label">Aktuální váha</p>
                  <p className="kpi-total">z měření</p>
                </div>
              </div>
            </section>

            {/* GRAF VÁHY – line chart */}
            {chartWeightData.length >= 1 && (
              <section className="card chart-section">
                <h2>Vývoj váhy</h2>
                <p className="chart-hint">Podle tvých záznamů měření. Přidej váhu a graf se přepočítá.</p>
                {chartWeightData.length >= 2 ? (
                  <>
                    <div className="chart-svg-wrap">
                      <svg className="chart-svg" viewBox="0 0 560 200" preserveAspectRatio="xMidYMid meet">
                        <defs>
                          <linearGradient id="weightGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#9b5cff" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {(() => {
                          const pad = { t: 20, r: 20, b: 36, l: 44 };
                          const W = 560 - pad.l - pad.r;
                          const H = 200 - pad.t - pad.b;
                          const minW = Math.min(...chartWeightData.map((x) => x.weight));
                          const maxW = Math.max(...chartWeightData.map((x) => x.weight));
                          const range = maxW - minW || 1;
                          const pts = chartWeightData.map((p, i) => {
                            const x = pad.l + (chartWeightData.length > 1 ? (i / (chartWeightData.length - 1)) * W : 0);
                            const y = pad.t + H - ((p.weight - minW) / range) * H;
                            return [x, y, p.weight, p.date];
                          });
                          const pathD = pts.length ? `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')}` : '';
                          const areaD = pathD ? `${pathD} L ${pad.l + W} ${pad.t + H} L ${pad.l} ${pad.t + H} Z` : '';
                          return (
                            <>
                              {areaD && <path fill="url(#weightGrad)" d={areaD} />}
                              <path fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d={pathD} />
                              {pts.map(([x, y, weight, date], i) => (
                                <g key={`${date}-${i}`}>
                                  <circle cx={x} cy={y} r="4" fill="#a78bfa" />
                                  <title>{`${formatShortDate(date)}: ${weight} kg`}</title>
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                    <div className="chart-labels">
                      {chartWeightData.map((p, i) => (
                        <div key={`${p.date}-${i}`} className="chart-label-item">
                          <span className="chart-value">{p.weight} kg</span>
                          <span className="chart-date">{formatShortDate(p.date)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="chart-single">
                    <span className="chart-value">{chartWeightData[0].weight} kg</span>
                    <span className="chart-date">{formatShortDate(chartWeightData[0].date)}</span>
                    <p className="chart-hint">Přidej další měření a uvidíš trend.</p>
                  </div>
                )}
              </section>
            )}

            {/* Modaly */}
            {showWorkoutModal && (
              <div className="modal-overlay" onClick={() => { setShowWorkoutModal(false); setWorkoutError(''); }}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Zapsat trénink</h3>
                  <form onSubmit={handleAddWorkout}>
                    <label>Datum</label>
                    <input type="date" value={workoutForm.workout_date} onChange={(e) => setWorkoutForm((f) => ({ ...f, workout_date: e.target.value }))} required />
                    <label>Typ</label>
                    <select value={workoutForm.workout_type} onChange={(e) => setWorkoutForm((f) => ({ ...f, workout_type: e.target.value }))}>
                      {WORKOUT_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
                      ))}
                    </select>
                    <label>Délka (min)</label>
                    <input type="number" min={1} value={workoutForm.duration_min} onChange={(e) => setWorkoutForm((f) => ({ ...f, duration_min: Number(e.target.value) || 0 }))} />
                    <label>Poznámka (volitelné)</label>
                    <input type="text" value={workoutForm.notes} onChange={(e) => setWorkoutForm((f) => ({ ...f, notes: e.target.value }))} placeholder="např. nohy" />
                    {workoutError && <p className="modal-error" role="alert">{workoutError}</p>}
                    <div className="modal-actions">
                      <button type="button" onClick={() => { setShowWorkoutModal(false); setWorkoutError(''); }} disabled={savingWorkout}>Zrušit</button>
                      <button type="submit" disabled={savingWorkout}>{savingWorkout ? 'Ukládám…' : 'Uložit'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {showWeightModal && (
              <div className="modal-overlay" onClick={() => setShowWeightModal(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Přidat váhu</h3>
                  <form onSubmit={handleAddWeight}>
                    <label>Datum měření</label>
                    <input type="date" value={weightForm.date} onChange={(e) => setWeightForm((f) => ({ ...f, date: e.target.value }))} required />
                    <label>Váha (kg)</label>
                    <input type="number" min={30} max={300} step={0.1} placeholder="např. 78.5" value={weightForm.weight_kg} onChange={(e) => setWeightForm((f) => ({ ...f, weight_kg: e.target.value }))} required />
                    <p className="modal-hint">Graf a přehled se přepočítají hned.</p>
                    <div className="modal-actions">
                      <button type="button" onClick={() => setShowWeightModal(false)}>Zrušit</button>
                      <button type="submit">Uložit</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 60px 20px 100px;
          background: radial-gradient(
              circle at 30% 0%,
              #1c1333,
              #0b0b15 60%
            ),
            #0a0a0f;
          color: #fff;
          font-family: Inter, sans-serif;
        }

        .hero {
          text-align: center;
          margin-bottom: 60px;
        }

        .hero h1 {
          font-size: 40px;
          font-weight: 700;
        }

        .hero span {
          background: linear-gradient(90deg, #9b5cff, #00cfff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero p {
          color: #aaa;
          margin-top: 14px;
        }

        .trainer-hint {
          text-align: center;
          color: #94a3b8;
          font-size: 14px;
          margin: -20px 0 32px;
          max-width: 520px;
          margin-left: auto;
          margin-right: auto;
        }

        .weight-now {
          font-size: 20px;
          font-weight: 700;
          margin: 8px 0 0;
          color: #e9d5ff;
        }
        .empty-progress {
          color: #64748b;
          font-size: 15px;
          margin-top: 16px;
          max-width: 320px;
          margin-left: auto;
          margin-right: auto;
        }

        .logout {
          margin-top: 20px;
          background: transparent;
          border: 1px solid #444;
          padding: 8px 16px;
          border-radius: 8px;
          color: #ccc;
          cursor: pointer;
        }

        .card {
          background: rgba(255, 255, 255, 0.04);
          padding: 40px;
          border-radius: 24px;
          margin-bottom: 40px;
          backdrop-filter: blur(20px);
        }

        .center {
          text-align: center;
        }

        .trend {
          margin-top: 8px;
          font-size: 18px;
        }

        .actions {
          margin-bottom: 32px;
        }
        .actions h2 { margin-bottom: 16px; }
        .action-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .btn-primary {
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-secondary {
          background: rgba(255,255,255,0.08);
          color: #e9d5ff;
          border: 1px solid #6d28d9;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .kpi-section { margin-bottom: 40px; }
        .kpi-section h2 { margin-bottom: 4px; }
        .kpi-sub {
          color: #64748b;
          font-size: 13px;
          margin-bottom: 20px;
        }
        .kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .kpi {
          background: rgba(255, 255, 255, 0.04);
          padding: 30px;
          border-radius: 20px;
          text-align: center;
          backdrop-filter: blur(20px);
        }

        .kpi-icon {
          font-size: 28px;
          display: block;
          margin-bottom: 4px;
        }
        .kpi h3 {
          margin: 4px 0 2px;
          font-size: 22px;
        }
        .kpi-label { color: #94a3b8; font-size: 13px; margin: 0; }
        .kpi-total { color: #64748b; font-size: 11px; margin-top: 4px; }

        .chart-section { margin-bottom: 40px; }
        .chart-hint {
          color: #64748b;
          font-size: 13px;
          margin: 4px 0 16px;
        }
        .chart-svg-wrap {
          width: 100%;
          max-width: 560px;
          margin: 0 auto 16px;
        }
        .chart-svg {
          width: 100%;
          height: auto;
          display: block;
        }
        .chart-labels {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 16px 24px;
        }
        .chart-label-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 64px;
        }
        .chart-value {
          font-weight: 700;
          font-size: 16px;
          color: #e9d5ff;
        }
        .chart-date {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
        }
        .chart-single {
          text-align: center;
          padding: 20px;
        }
        .chart-single .chart-value { font-size: 24px; }
        .chart-single .chart-date { display: block; margin-top: 4px; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal {
          background: #1a1a2e;
          border-radius: 20px;
          padding: 28px;
          max-width: 400px;
          width: 100%;
          border: 1px solid #333;
        }
        .modal h3 { margin: 0 0 20px; }
        .modal label { display: block; margin: 12px 0 4px; color: #94a3b8; font-size: 14px; }
        .modal input, .modal select {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #444;
          background: #0f0f1a;
          color: #fff;
          font-size: 16px;
          box-sizing: border-box;
        }
        .modal-hint { color: #64748b; font-size: 13px; margin: 12px 0; }
        .modal-error {
          color: #f87171;
          font-size: 14px;
          margin: 12px 0 0;
          padding: 10px;
          background: rgba(239, 68, 68, 0.15);
          border-radius: 8px;
        }

        .history-section { margin-bottom: 32px; }
        .empty-history {
          color: #64748b;
          font-size: 15px;
          margin: 0;
        }
        .workout-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .workout-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
          margin-bottom: 8px;
          border: 1px solid transparent;
          transition: border-color 0.2s, background 0.2s;
        }
        .workout-item:hover { background: rgba(255,255,255,0.06); }
        .workout-icon { font-size: 24px; }
        .workout-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .workout-info strong { font-size: 15px; }
        .workout-meta {
          font-size: 13px;
          color: #94a3b8;
        }
        .workout-delete {
          background: transparent;
          border: 1px solid #444;
          color: #94a3b8;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          flex-shrink: 0;
        }
        .workout-delete:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.4);
        }
        .modal-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }
        .modal-actions button {
          padding: 10px 20px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 600;
        }
        .modal-actions button[type="button"] {
          background: transparent;
          border: 1px solid #555;
          color: #94a3b8;
        }
        .modal-actions button[type="submit"] {
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          border: none;
          color: #fff;
        }

        .loading {
          text-align: center;
          color: #aaa;
        }

        .error-banner {
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.4);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
          text-align: center;
        }
        .error-banner p {
          color: #ff6b6b;
          margin: 0 0 12px;
        }
        .error-banner .btn-ghost {
          background: transparent;
          border: 1px solid #555;
          padding: 6px 12px;
          border-radius: 8px;
          color: #ccc;
          cursor: pointer;
          margin: 0 4px;
        }
        .error-banner span { color: #888; }
      `}</style>
    </>
  );
}