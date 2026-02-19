// /pages/profil.js – Můj profil: pokrok, tréninky, metriky
import { getProgressData } from '../lib/progress';
import { useState, useEffect } from 'react';
import Link from 'next/link';
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

// Odhad spálených kcal/min podle typu tréninku (trenérská praxe, průměrný intenzita)
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
  return new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

export default function Profil() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workoutError, setWorkoutError] = useState('');
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [workoutForm, setWorkoutForm] = useState({ workout_date: new Date().toISOString().split('T')[0], workout_type: 'silovy', duration_min: 45, notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightForm, setWeightForm] = useState({ date: new Date().toISOString().split('T')[0], weight_kg: '' });
  const [weightError, setWeightError] = useState('');
  const [submittingWeight, setSubmittingWeight] = useState(false);

  const refetchProfile = () => {
    if (!session?.access_token) return Promise.resolve();
    return fetch('/api/profile', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setProfile(data);
        return data;
      })
      .catch((err) => { console.warn('[profil] refetch failed', err); });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        router.replace('/login');
        return;
      }
      setSession(s);
      fetch('/api/profile', { headers: { Authorization: `Bearer ${s.access_token}` } })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) setError(data.error);
          else setProfile(data);
        })
        .catch(() => setError('Nepodařilo se načíst data'))
        .finally(() => setLoading(false));
    });
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function handleAddWorkout(e) {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(workoutForm),
      });
      const json = await res.json();
      if (res.ok) {
        setShowWorkoutModal(false);
        setWorkoutError('');
        setWorkoutForm({ workout_date: new Date().toISOString().split('T')[0], workout_type: 'silovy', duration_min: 45, notes: '' });
        setProfile((p) => ({ ...p, workouts: [json.workout, ...(p.workouts || [])] }));
        await refetchProfile();
      } else setWorkoutError(json.error || 'Chyba při ukládání');
    } catch (err) {
      setWorkoutError(err.message || 'Chyba');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteWorkout(id) {
    if (!session || !confirm('Opravdu smazat tento trénink?')) return;
    try {
      const res = await fetch(`/api/workouts?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        setProfile((p) => ({ ...p, workouts: (p.workouts || []).filter((w) => w.id !== id) }));
        await refetchProfile();
      }
    } catch (err) {
      setWorkoutError(err.message);
    }
  }

  async function handleAddWeight(e) {
    e.preventDefault();
    if (!session) return;
    const w = Number(weightForm.weight_kg);
    if (Number.isNaN(w) || w < 30 || w > 300) {
      setWeightError('Váha musí být mezi 30 a 300 kg.');
      return;
    }
    setSubmittingWeight(true);
    setWeightError('');
    try {
      const res = await fetch('/api/quick-weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ weight_kg: w, date: weightForm.date || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        setShowWeightModal(false);
        setWeightForm({ date: new Date().toISOString().split('T')[0], weight_kg: '' });
        // Okamžitá aktualizace postavy a grafu: přidáme nové měření do stavu a pak refetch
        if (json.metric) {
          setProfile((p) => ({ ...p, body_metrics: [json.metric, ...(p.body_metrics || [])] }));
        }
        await refetchProfile();
      } else setWeightError(json.error || 'Nepodařilo se uložit.');
    } catch (err) {
      setWeightError(err.message || 'Chyba');
    } finally {
      setSubmittingWeight(false);
    }
  }

  if (!session && !loading) return null;

  const metrics = profile?.body_metrics || [];
  const plans = profile?.plans || [];
  const workouts = profile?.workouts || [];
  const weightHistory = profile?.weight_history || [];
  const userName = profile?.user?.name || profile?.user?.email?.split('@')[0] || 'Sportovče';

  // Počty tréninků vždy z aktuálního seznamu (po přidání/smazání se přepočítají)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysToMonday);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const workoutDateNorm = (w) => (w.workout_date || '').toString().slice(0, 10);
  const workoutsThisWeekList = workouts.filter((w) => workoutDateNorm(w) >= weekStartStr);
  const workoutsThisWeek = workoutsThisWeekList.length;
  const totalWorkouts = workouts.length;

  // Přepočty podle tréninků (trenérský model: čas v pohybu + odhad spálených kcal)
  const totalMinutesThisWeek = workoutsThisWeekList.reduce((sum, w) => sum + (Number(w.duration_min) || 0), 0);
  const estimatedCaloriesThisWeek = workoutsThisWeekList.reduce((sum, w) => sum + estimatedCalories(w), 0);
  const totalMinutesAll = workouts.reduce((sum, w) => sum + (Number(w.duration_min) || 0), 0);
  const estimatedCaloriesAll = workouts.reduce((sum, w) => sum + estimatedCalories(w), 0);

  const firstMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;
  const latestMetric = metrics.length > 0 ? metrics[0] : null;
  const hasBeforeAfter = firstMetric && latestMetric && (firstMetric.id !== latestMetric.id || firstMetric.weight_kg !== latestMetric.weight_kg);

  // Aktuální váha a změna od začátku = stejný zdroj jako postavy (první vs poslední měření), aby vše sedělo
  const currentWeight = latestMetric?.weight_kg ?? (weightHistory.length ? weightHistory[weightHistory.length - 1]?.weight : null);
  const weightDiff = (latestMetric?.weight_kg != null && firstMetric?.weight_kg != null)
    ? (latestMetric.weight_kg - firstMetric.weight_kg).toFixed(1)
    : null;

  // Graf váhy z měření (chronologicky), aby odpovídal postavě a KPI
  const chartWeightData = metrics
    .filter((m) => m.weight_kg != null && m.created_at)
    .map((m) => ({ date: m.created_at.split('T')[0], weight: m.weight_kg }))
    .reverse();

  return (
    <>
      <Header />
      <main className="profil-page">
        {/* Hero – portfolio uživatele */}
        <section className="profil-hero">
          <div className="profil-hero-bg" />
          <div className="profil-hero-content">
            <p className="profil-hero-badge">Tvé portfolio</p>
            <h1>
              Ahoj, <span>{userName}</span> 👋
            </h1>
            <p className="profil-hero-sub">Síla těla, klid mysli – přehled se dynamicky mění s každým záznamem (trénink, váha).</p>
            <div className="profil-hero-actions">
              {profile?.user?.email && <span className="profil-email">{profile.user.email}</span>}
              <button type="button" onClick={handleLogout} className="btn-ghost">
                Odhlásit se
              </button>
            </div>
          </div>
        </section>

        {loading && (
          <div className="profil-loading">
            <div className="profil-spinner" />
            <p>Načítám tvé údaje…</p>
          </div>
        )}

        {error && (
          <div className="profil-error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="profil-content">
            {/* Postava – předtím vs teď (první sekce) */}
            <section className="profil-section">
              <h2>👤 Tvůj postup</h2>
              <p className="profil-section-hint">
                Tvar a postava se odvíjejí od tvého profilu (pohlaví, cíl) a váhy z měření. Přidej nové měření – „Předtím“ vs „Teď“ i graf váhy se přepočítají v reálném čase.
              </p>
              <div className="body-figures-row">
                {hasBeforeAfter ? (
                  <>
                    <div className="body-figure-card body-figure-card-before">
                      <BodyFigure
                        weight={firstMetric.weight_kg}
                        height={firstMetric.height_cm}
                        label="Předtím"
                        size={110}
                        id="before"
                        variant="before"
                        gender={firstMetric.gender}
                        goal={firstMetric.goal}
                      />
                      {firstMetric.created_at && (
                        <span className="body-figure-date">{formatDate(firstMetric.created_at)}</span>
                      )}
                    </div>
                    <div className="body-figures-arrow" aria-hidden="true">→</div>
                    <div className="body-figure-card body-figure-card-now">
                      <BodyFigure
                        weight={latestMetric.weight_kg}
                        height={latestMetric.height_cm}
                        label="Teď"
                        size={110}
                        id="after"
                        variant="now"
                        weightDiff={weightDiff}
                        gender={latestMetric.gender}
                        goal={latestMetric.goal}
                      />
                      {latestMetric.created_at && (
                        <span className="body-figure-date">{formatDate(latestMetric.created_at)}</span>
                      )}
                    </div>
                  </>
                ) : latestMetric ? (
                  <div className="body-figure-card body-figure-single">
                    <BodyFigure
                      weight={latestMetric.weight_kg}
                      height={latestMetric.height_cm}
                      label="Tvůj profil"
                      size={130}
                      id="single"
                      gender={latestMetric.gender}
                      goal={latestMetric.goal}
                    />
                    <p className="body-figure-hint">Vyplň další měření v průběhu času – postava se bude měnit podle tvého pokroku.</p>
                  </div>
                ) : (
                  <div className="body-figure-empty">
                    <BodyFigure weight={70} height={175} label="Příklad" size={100} id="example" />
                    <p>Vyplň dotazník, aby se ti zobrazila tvá postava a její změny v čase.</p>
                    <Link href="/start" className="btn-primary">Vyplnit dotazník</Link>
                  </div>
                )}
              </div>
            </section>

            {/* KPI karty – propojené s postavou a s historií tréninků */}
            <section className="profil-section">
              <h2>📊 Přehled pokroku</h2>
              <p className="profil-section-hint profil-section-hint-sub">
                Hodnoty se počítají v reálném čase z toho, co zapíšeš: typ tréninku a délka určí počet jednotek, odhad času i spálené energie. Váha a změna vycházejí z měření – po přidání záznamu se přehled, postava i graf hned aktualizují.
              </p>
              <div className="kpi-grid">
                <div className="kpi-card kpi-card-workouts">
                  <span className="kpi-icon">🏋️</span>
                  <span className="kpi-value">{workoutsThisWeek}</span>
                  <span className="kpi-label">Tréninků tento týden</span>
                </div>
                <div className="kpi-card kpi-card-total">
                  <span className="kpi-icon">📈</span>
                  <span className="kpi-value">{totalWorkouts}</span>
                  <span className="kpi-label">Celkem tréninků</span>
                </div>
                <div className="kpi-card kpi-card-time">
                  <span className="kpi-icon">⏱️</span>
                  <span className="kpi-value">{totalMinutesThisWeek} min</span>
                  <span className="kpi-label">Čas v pohybu (týden)</span>
                </div>
                <div className="kpi-card kpi-card-calories">
                  <span className="kpi-icon">🔥</span>
                  <span className="kpi-value">~{estimatedCaloriesThisWeek} kcal</span>
                  <span className="kpi-label">Odhad spáleno (týden)</span>
                </div>
                <div className="kpi-card kpi-card-weight">
                  <span className="kpi-icon">⚖️</span>
                  <span className="kpi-value">{currentWeight != null ? `${currentWeight} kg` : '—'}</span>
                  <span className="kpi-label">Aktuální váha</span>
                </div>
                <div className="kpi-card kpi-card-trend">
                  <span className="kpi-icon">{weightDiff != null ? (weightDiff < 0 ? '📉' : weightDiff > 0 ? '📈' : '➖') : '📊'}</span>
                  <span className="kpi-value">
                    {weightDiff != null ? `${weightDiff > 0 ? '+' : ''}${weightDiff} kg` : '—'}
                  </span>
                  <span className="kpi-label">Změní od začátku</span>
                </div>
              </div>
              {(totalMinutesAll > 0 || estimatedCaloriesAll > 0) && (
                <p className="profil-section-hint profil-kpi-total">
                  Celkem od začátku: {totalMinutesAll} min v pohybu, odhad ~{estimatedCaloriesAll} kcal (výpočet z typu a délky tréninků).
                </p>
              )}
            </section>

            {/* Graf váhy – stejný zdroj jako postava a KPI (měření) */}
            {chartWeightData.length >= 2 && (() => {
              const chartW = 600; const chartH = 180; const pad = { t: 24, r: 24, b: 32, l: 40 };
              const innerW = chartW - pad.l - pad.r; const innerH = chartH - pad.t - pad.b;
              const max = Math.max(...chartWeightData.map((x) => x.weight));
              const min = Math.min(...chartWeightData.map((x) => x.weight));
              const range = max - min || 1;
              const points = chartWeightData.map((p, i) => {
                const x = pad.l + (chartWeightData.length > 1 ? (i / (chartWeightData.length - 1)) * innerW : 0);
                const y = pad.t + innerH - ((p.weight - min) / range) * innerH;
                return [x, y];
              });
              const pathD = points.length ? `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')}` : '';
              const areaD = pathD ? `${pathD} L ${pad.l + innerW} ${pad.t + innerH} L ${pad.l} ${pad.t + innerH} Z` : '';
              return (
                <section className="profil-section" key="weight-chart">
                  <h2>⚖️ Vývoj váhy</h2>
                  <p className="profil-section-hint profil-section-hint-sub">Stejná data jako postava – přepočet v reálném čase při každém novém měření.</p>
                  <div className="weight-chart">
                    <svg className="weight-chart-svg" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <linearGradient id="weightLineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#9b5cff" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {areaD && <path fill="url(#weightLineGrad)" d={areaD} className="weight-chart-area" />}
                      <path fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d={pathD} className="weight-chart-line" />
                      {points.map(([x, y], i) => (
                        <g key={`${chartWeightData[i].date}-${i}`}>
                          <circle cx={x} cy={y} r="4" className="weight-chart-dot" />
                          <title>{`${chartWeightData[i].date}: ${chartWeightData[i].weight} kg`}</title>
                        </g>
                      ))}
                    </svg>
                    <div className="weight-chart-labels">
                      {chartWeightData.map((p, i) => (
                        <span key={`${p.date}-${i}`} className="weight-chart-label" title={`${p.date}: ${p.weight} kg`}>
                          <span className="weight-chart-label-value">{p.weight}</span>
                          <span className="weight-chart-label-date">{formatShortDate(p.date)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Rychlé akce */}
            <section className="profil-section">
              <h2>⚡ Rychlé akce</h2>
              <div className="action-buttons">
                <button type="button" onClick={() => setShowWorkoutModal(true)} className="btn-primary">
                  <span>+</span> Zapsat trénink
                </button>
                <button type="button" onClick={() => { setShowWeightModal(true); setWeightError(''); setWeightForm({ date: new Date().toISOString().split('T')[0], weight_kg: latestMetric?.weight_kg != null ? String(latestMetric.weight_kg) : '' }); }} className="btn-primary btn-outline">
                  ⚖️ Přidat váhu
                </button>
                <Link href="/start" className="btn-secondary">
                  Aktualizovat metriky
                </Link>
              </div>
            </section>

            {/* Historie tréninků */}
            <section className="profil-section">
              <h2>🏋️ Historie tréninků</h2>
              {workouts.length === 0 ? (
                <div className="empty-state">
                  <p>Zatím nemáš žádné záznamy tréninků.</p>
                  <button type="button" onClick={() => setShowWorkoutModal(true)} className="btn-primary">
                    Zapsat první trénink
                  </button>
                </div>
              ) : (
                <div className="workouts-list">
                  {workouts.slice(0, 20).map((w) => {
                    const type = WORKOUT_TYPES.find((t) => t.id === w.workout_type) || { label: w.workout_name || w.workout_type || '—', emoji: '✨' };
                    return (
                      <div key={w.id} className="workout-card">
                        <div className="workout-main">
                          <span className="workout-emoji">{type.emoji}</span>
                          <div>
                            <span className="workout-type">{type.label}</span>
                            <span className="workout-date">{formatDate(w.workout_date)}</span>
                          </div>
                          {w.duration_min && <span className="workout-duration">{w.duration_min} min</span>}
                        </div>
                        {w.notes && <p className="workout-notes">{w.notes}</p>}
                        <button type="button" onClick={() => handleDeleteWorkout(w.id)} className="workout-delete" aria-label="Smazat">
                          ×
                        </button>
                      </div>
                    );
                  })}
                  {workouts.length > 20 && <p className="muted">Zobrazuje se prvních 20 tréninků</p>}
                </div>
              )}
            </section>

            {/* Metriky */}
            <section className="profil-section">
              <h2>📋 Moje metriky</h2>
              {metrics.length === 0 ? (
                <div className="empty-state">
                  <p>Zatím nemáš žádné záznamy.</p>
                  <Link href="/start" className="btn-primary">Vyplnit dotazník / START</Link>
                </div>
              ) : (
                <div className="metrics-list">
                  {metrics.slice(0, 5).map((row, idx) => (
                    <div key={row.id || idx} className="metric-card">
                      <h3>Záznam z {formatDate(row.created_at)}</h3>
                      <div className="metric-grid">
                        <div><span className="muted">Váha</span><strong>{row.weight_kg ?? '—'} kg</strong></div>
                        <div><span className="muted">Výška</span><strong>{row.height_cm ?? '—'} cm</strong></div>
                        <div><span className="muted">Věk</span><strong>{row.age ?? '—'}</strong></div>
                        <div><span className="muted">Cíl</span><strong>{row.goal ?? '—'}</strong></div>
                        <div><span className="muted">Frekvence</span><strong>{row.freq_choice ?? '—'}</strong></div>
                      </div>
                      {row.notes && <p className="metric-notes">{row.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Plány */}
            {plans.length > 0 && (
              <section className="profil-section">
                <h2>📄 Můj plán</h2>
                <div className="plans-list">
                  {plans.slice(0, 3).map((p) => (
                    <div key={p.id} className="plan-card">
                      <div className="plan-header">
                        <span className="plan-type">{p.plan_type || 'plán'}</span>
                        <span className="plan-date">{formatDate(p.created_at)}</span>
                      </div>
                      {p.daily_calories && <p>Kalorie: {p.daily_calories} kcal/den</p>}
                      {p.macros && <p className="muted">B: {p.macros.protein_g}g | T: {p.macros.fat_g}g | S: {p.macros.carbs_g}g</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Modal – Zapsat trénink */}
        {showWorkoutModal && (
          <div className="modal-overlay" onClick={() => { if (!submitting) { setShowWorkoutModal(false); setWorkoutError(''); } }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Zapsat trénink</h3>
                <button type="button" onClick={() => { if (!submitting) { setShowWorkoutModal(false); setWorkoutError(''); } }} aria-label="Zavřít">×</button>
              </div>
              <form onSubmit={handleAddWorkout} className="modal-form">
                <div>
                  <label>Datum</label>
                  <input
                    type="date"
                    value={workoutForm.workout_date}
                    onChange={(e) => setWorkoutForm((f) => ({ ...f, workout_date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label>Typ tréninku</label>
                  <select
                    value={workoutForm.workout_type}
                    onChange={(e) => setWorkoutForm((f) => ({ ...f, workout_type: e.target.value }))}
                  >
                    {WORKOUT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Délka (minuty)</label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={workoutForm.duration_min}
                    onChange={(e) => setWorkoutForm((f) => ({ ...f, duration_min: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>
                <div>
                  <label>Poznámka (volitelně)</label>
                  <input
                    type="text"
                    placeholder="Např. Leg day, Bench press..."
                    value={workoutForm.notes}
                    onChange={(e) => setWorkoutForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                {workoutError && <p className="modal-error">{workoutError}</p>}
                <div className="modal-actions">
                  <button type="button" onClick={() => { if (!submitting) { setShowWorkoutModal(false); setWorkoutError(''); } }} className="btn-ghost">Zrušit</button>
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? 'Ukládám…' : 'Uložit trénink'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal – Přidat váhu */}
        {showWeightModal && (
          <div className="modal-overlay" onClick={() => { if (!submittingWeight) { setShowWeightModal(false); setWeightError(''); } }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>⚖️ Přidat váhu</h3>
                <button type="button" onClick={() => { if (!submittingWeight) { setShowWeightModal(false); setWeightError(''); } }} aria-label="Zavřít">×</button>
              </div>
              <form onSubmit={handleAddWeight} className="modal-form">
                <div>
                  <label>Datum měření</label>
                  <input
                    type="date"
                    value={weightForm.date}
                    onChange={(e) => setWeightForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label>Váha (kg)</label>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    step={0.1}
                    placeholder="např. 78.5"
                    value={weightForm.weight_kg}
                    onChange={(e) => setWeightForm((f) => ({ ...f, weight_kg: e.target.value }))}
                    required
                  />
                </div>
                {weightError && <p className="modal-error">{weightError}</p>}
                <p className="modal-hint">Postava a graf váhy se hned přepočítají. Výška se bere z posledního měření.</p>
                <div className="modal-actions">
                  <button type="button" onClick={() => { if (!submittingWeight) { setShowWeightModal(false); setWeightError(''); } }} className="btn-ghost">Zrušit</button>
                  <button type="submit" disabled={submittingWeight} className="btn-primary">
                    {submittingWeight ? 'Ukládám…' : 'Uložit váhu'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <Footer />

      <style jsx>{`
        .profil-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #0a021f 0%, #0d0d1a 25%, #0a0a12 50%, #0a0a0a 100%);
          line-height: 1.55;
        }
        .profil-hero {
          position: relative;
          padding: 56px 24px 48px;
          overflow: hidden;
        }
        .profil-hero-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 90% 70% at 50% -10%, rgba(139, 92, 255, 0.22), transparent 55%),
            radial-gradient(ellipse 60% 45% at 85% 10%, rgba(14, 165, 233, 0.12), transparent 50%),
            radial-gradient(ellipse 50% 35% at 15% 20%, rgba(124, 58, 237, 0.08), transparent 45%);
          pointer-events: none;
        }
        .profil-hero-content {
          position: relative;
          max-width: 900px;
          margin: 0 auto;
        }
        .profil-hero-badge {
          display: inline-block;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #c4b5fd;
          margin: 0 0 14px;
          padding: 8px 16px;
          background: rgba(139, 92, 255, 0.18);
          border: 1px solid rgba(167, 139, 255, 0.35);
          border-radius: 20px;
          box-shadow: 0 0 24px rgba(139, 92, 255, 0.12);
        }
        .profil-hero h1 {
          font-size: clamp(30px, 5.5vw, 40px);
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 10px;
          color: #fff;
          line-height: 1.2;
        }
        .profil-hero h1 span {
          background: linear-gradient(120deg, #a78bfa 0%, #9b5cff 40%, #0EA5E9 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .profil-hero-sub {
          color: #a1a1aa;
          font-size: clamp(15px, 2vw, 17px);
          margin: 0 0 24px;
          line-height: 1.6;
          max-width: 520px;
        }
        .profil-hero-actions {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .profil-email {
          font-size: 14px;
          color: #71717a;
        }
        .btn-ghost {
          background: transparent;
          border: 1px solid #3f3f46;
          color: #a1a1aa;
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 14px;
          cursor: pointer;
          transition: border-color 0.25s, color 0.25s;
        }
        .btn-ghost:hover {
          border-color: #52525b;
          color: #fff;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #9b5cff 0%, #7c3aed 100%);
          color: #fff;
          border: none;
          padding: 12px 22px;
          border-radius: 14px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.25s;
        }
        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(155, 92, 255, 0.35);
        }
        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          border: 1px solid #3f3f46;
          color: #eaeaea;
          padding: 12px 22px;
          border-radius: 14px;
          font-weight: 500;
          font-size: 15px;
          text-decoration: none;
          transition: border-color 0.25s, background 0.25s;
        }
        .btn-secondary:hover {
          border-color: #52525b;
          background: rgba(255,255,255,0.04);
        }
        .btn-outline {
          background: transparent;
          border: 2px solid rgba(155, 92, 255, 0.5);
          color: #c4b5fd;
        }
        .btn-outline:hover {
          background: rgba(155, 92, 255, 0.12);
          border-color: #9b5cff;
        }
        .profil-loading {
          text-align: center;
          padding: 64px 24px;
          color: #71717a;
          font-size: 15px;
        }
        .profil-spinner {
          width: 40px;
          height: 40px;
          margin: 0 auto 16px;
          border: 3px solid #2a2a2a;
          border-top-color: #9b5cff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .profil-error {
          max-width: 900px;
          margin: 0 auto;
          padding: 24px;
          color: #f87171;
          font-size: 15px;
        }
        .profil-content {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 24px 72px;
        }
        .profil-section {
          margin-bottom: 48px;
        }
        .profil-section h2 {
          font-size: clamp(17px, 2.2vw, 20px);
          font-weight: 600;
          letter-spacing: -0.01em;
          color: #e4e4e7;
          margin: 0 0 12px;
          line-height: 1.35;
        }
        .profil-section-hint {
          font-size: 14px;
          color: #a1a1aa;
          margin: -4px 0 20px;
          line-height: 1.6;
          max-width: 560px;
        }
        .profil-section-hint-sub {
          margin-bottom: 16px;
          font-size: 13px;
          color: #71717a;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 20px;
        }
        .kpi-card {
          background: rgba(28, 28, 42, 0.9);
          border: 1px solid #2e2e42;
          border-radius: 18px;
          padding: 22px 20px;
          text-align: center;
          transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .kpi-card:hover {
          border-color: #3f3f52;
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        }
        .kpi-card-workouts { border-top: 2px solid rgba(155, 92, 255, 0.4); }
        .kpi-card-workouts .kpi-value { color: #c4b5fd; }
        .kpi-card-total { border-top: 2px solid rgba(14, 165, 233, 0.4); }
        .kpi-card-total .kpi-value { color: #7dd3fc; }
        .kpi-card-weight { border-top: 2px solid rgba(34, 197, 94, 0.4); }
        .kpi-card-weight .kpi-value { color: #86efac; }
        .kpi-card-trend { border-top: 2px solid rgba(251, 191, 36, 0.45); }
        .kpi-card-trend .kpi-value { color: #fde047; }
        .kpi-card-time { border-top: 2px solid rgba(34, 197, 94, 0.4); }
        .kpi-card-time .kpi-value { color: #86efac; }
        .kpi-card-calories { border-top: 2px solid rgba(239, 68, 68, 0.4); }
        .kpi-card-calories .kpi-value { color: #fca5a5; }
        .profil-kpi-total { margin-top: 12px; font-size: 13px; color: #71717a; }
        .kpi-icon {
          font-size: 28px;
          display: block;
          margin-bottom: 10px;
        }
        .kpi-value {
          display: block;
          font-size: clamp(22px, 2.5vw, 26px);
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.02em;
        }
        .kpi-label {
          font-size: 12px;
          color: #71717a;
          margin-top: 6px;
          display: block;
          line-height: 1.35;
        }
        .body-figures-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 32px;
          flex-wrap: wrap;
          padding: 36px 24px;
          background: rgba(28, 28, 42, 0.9);
          border: 1px solid #2e2e42;
          border-radius: 20px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }
        .body-figure-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 24px 20px;
          background: rgba(32, 32, 50, 0.7);
          border-radius: 16px;
          border: 1px solid #2e2e42;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .body-figure-card.body-figure-single {
          padding: 28px 36px;
        }
        .body-figure-card-now {
          border-color: rgba(167, 139, 255, 0.45);
          box-shadow: 0 0 28px rgba(139, 92, 255, 0.12);
        }
        .body-figure-card-before {
          border-color: #2e2e42;
          opacity: 0.92;
        }
        .body-figure-date {
          font-size: 12px;
          color: #71717a;
        }
        .body-figure-hint {
          margin: 10px 0 0;
          font-size: 13px;
          color: #71717a;
          text-align: center;
          max-width: 260px;
          line-height: 1.45;
        }
        .body-figures-arrow {
          font-size: 28px;
          color: #a78bfa;
          font-weight: 300;
        }
        .body-figure-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 36px;
          text-align: center;
          color: #71717a;
          line-height: 1.5;
        }
        .body-figure-empty p { margin: 0; }
        .weight-chart {
          background: rgba(28, 28, 42, 0.9);
          border: 1px solid #2e2e42;
          border-radius: 20px;
          padding: 28px 24px 20px;
          overflow-x: auto;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }
        .weight-chart-svg {
          width: 100%;
          height: auto;
          min-height: 160px;
          display: block;
        }
        .weight-chart-area {
          transition: opacity 0.3s;
        }
        .weight-chart-line {
          transition: stroke-opacity 0.2s;
        }
        .weight-chart-dot {
          fill: #a78bfa;
          stroke: #1e1e2e;
          stroke-width: 2;
          transition: fill 0.2s, transform 0.2s;
        }
        .weight-chart-dot:hover {
          fill: #c4b5fd;
        }
        .weight-chart-labels {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #2e2e42;
          flex-wrap: wrap;
        }
        .weight-chart-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          font-size: 11px;
          color: #71717a;
          min-width: 48px;
        }
        .weight-chart-label-value {
          font-weight: 600;
          color: #a1a1aa;
        }
        .weight-chart-label-date {
          font-size: 10px;
          color: #52525b;
          margin-top: 2px;
        }
        .action-buttons {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }
        .empty-state {
          background: rgba(28, 28, 42, 0.6);
          border: 1px dashed #3f3f52;
          border-radius: 16px;
          padding: 36px;
          text-align: center;
          color: #71717a;
          line-height: 1.5;
        }
        .empty-state p { margin: 0 0 18px; }
        .workouts-list { display: flex; flex-direction: column; gap: 14px; }
        .workout-card {
          position: relative;
          background: rgba(28, 28, 42, 0.9);
          border: 1px solid #2e2e42;
          border-radius: 14px;
          padding: 18px 48px 18px 18px;
          transition: border-color 0.25s, box-shadow 0.25s;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }
        .workout-card:hover {
          border-color: #3f3f52;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
        }
        .workout-main {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .workout-emoji { font-size: 24px; }
        .workout-type { font-weight: 600; color: #e4e4e7; display: block; }
        .workout-date { font-size: 13px; color: #71717a; }
        .workout-duration {
          margin-left: auto;
          background: rgba(155, 92, 255, 0.18);
          color: #a78bfa;
          padding: 5px 12px;
          border-radius: 10px;
          font-size: 13px;
        }
        .workout-notes {
          margin: 10px 0 0 40px;
          font-size: 13px;
          color: #a1a1aa;
          line-height: 1.4;
        }
        .workout-delete {
          position: absolute;
          top: 14px;
          right: 14px;
          background: none;
          border: none;
          color: #52525b;
          font-size: 18px;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          transition: color 0.2s;
          border-radius: 6px;
        }
        .workout-delete:hover { color: #ef4444; }
        .metrics-list, .plans-list { display: flex; flex-direction: column; gap: 18px; }
        .metric-card, .plan-card {
          background: rgba(28, 28, 42, 0.9);
          border: 1px solid #2e2e42;
          border-radius: 16px;
          padding: 22px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .metric-card:hover, .plan-card:hover {
          border-color: #36364a;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        }
        .metric-card h3, .plan-header {
          font-size: 14px;
          font-weight: 600;
          color: #a78bfa;
          margin: 0 0 12px;
          letter-spacing: -0.01em;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 12px;
        }
        .metric-grid div { font-size: 14px; }
        .metric-grid .muted { display: block; font-size: 11px; color: #71717a; margin-bottom: 2px; }
        .metric-notes { margin: 12px 0 0; font-size: 13px; color: #a1a1aa; line-height: 1.4; }
        .plan-type { font-weight: 600; }
        .plan-date { float: right; font-size: 12px; color: #71717a; }
        .plan-card p { margin: 4px 0; font-size: 14px; }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 24px;
        }
        .modal {
          background: rgba(22, 22, 32, 0.95);
          border: 1px solid #2e2e42;
          border-radius: 24px;
          width: 100%;
          max-width: 420px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 22px 26px;
          border-bottom: 1px solid #2e2e42;
        }
        .modal-header h3 { margin: 0; font-size: 19px; font-weight: 600; color: #fff; letter-spacing: -0.01em; }
        .modal-header button {
          background: none;
          border: none;
          color: #71717a;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.2s;
          border-radius: 8px;
        }
        .modal-header button:hover { color: #fff; }
        .modal-form {
          padding: 26px;
        }
        .modal-form > div { margin-bottom: 18px; }
        .modal-form label {
          display: block;
          font-size: 13px;
          color: #a1a1aa;
          margin-bottom: 6px;
        }
        .modal-form input,
        .modal-form select {
          width: 100%;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid #2e2e42;
          background: #0f0f14;
          color: #fff;
          font-size: 15px;
          transition: border-color 0.2s;
        }
        .modal-form input:focus,
        .modal-form select:focus {
          outline: none;
          border-color: #6366f1;
        }
        .modal-error {
          margin: 0 0 16px;
          padding: 12px 14px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: 10px;
          color: #f87171;
          font-size: 14px;
        }
        .modal-hint {
          margin: 0 0 16px;
          font-size: 13px;
          color: #71717a;
          line-height: 1.5;
        }
        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 24px;
        }
      `}</style>
    </>
  );
}
