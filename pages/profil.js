// /pages/profil.js – Můj profil: pokrok, tréninky, metriky
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
    if (!session?.access_token) return;
    fetch('/api/profile', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => res.json())
      .then((data) => { if (!data.error) setProfile(data); })
      .catch(() => {});
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
        refetchProfile();
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
        refetchProfile();
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
        refetchProfile();
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
  const workoutsThisWeek = workouts.filter((w) => workoutDateNorm(w) >= weekStartStr).length;
  const totalWorkouts = workouts.length;

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
        {/* Hero */}
        <section className="profil-hero">
          <div className="profil-hero-bg" />
          <div className="profil-hero-content">
            <h1>
              Ahoj, <span>{userName}</span> 👋
            </h1>
            <p className="profil-hero-sub">Síla těla, klid mysli – tady máš přehled svého pokroku.</p>
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
                Tvar a postava se odvíjejí od tvého profilu (pohlaví, cíl) a váhy z měření. Přidej nové měření s jinou váhou a uvidíš pokrok – „Předtím“ vs „Teď“ se přepočítají automaticky.
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
                Všechny údaje vycházejí z tvých záznamů: tréninky z Historie, váha a změna z měření (stejný zdroj jako postava „Předtím“ / „Teď“).
              </p>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-icon">🏋️</span>
                  <span className="kpi-value">{workoutsThisWeek}</span>
                  <span className="kpi-label">Tréninků tento týden</span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-icon">📈</span>
                  <span className="kpi-value">{totalWorkouts}</span>
                  <span className="kpi-label">Celkem tréninků</span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-icon">⚖️</span>
                  <span className="kpi-value">{currentWeight != null ? `${currentWeight} kg` : '—'}</span>
                  <span className="kpi-label">Aktuální váha</span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-icon">{weightDiff != null ? (weightDiff < 0 ? '📉' : weightDiff > 0 ? '📈' : '➖') : '📊'}</span>
                  <span className="kpi-value">
                    {weightDiff != null ? `${weightDiff > 0 ? '+' : ''}${weightDiff} kg` : '—'}
                  </span>
                  <span className="kpi-label">Změní od začátku</span>
                </div>
              </div>
            </section>

            {/* Graf váhy – stejný zdroj jako postava a KPI (měření) */}
            {chartWeightData.length >= 2 && (
              <section className="profil-section">
                <h2>⚖️ Vývoj váhy</h2>
                <p className="profil-section-hint profil-section-hint-sub">Podle tvých záznamů měření (stejná data jako „Předtím“ / „Teď“).</p>
                <div className="weight-chart">
                  <div className="weight-chart-bars">
                    {chartWeightData.map((p, i) => {
                      const max = Math.max(...chartWeightData.map((x) => x.weight));
                      const min = Math.min(...chartWeightData.map((x) => x.weight));
                      const range = max - min || 1;
                      return (
                        <div key={`${p.date}-${i}`} className="weight-bar-wrap" title={`${p.date}: ${p.weight} kg`}>
                          <div className="weight-bar" style={{ height: `${20 + ((p.weight - min) / range) * 60}%` }} />
                          <span className="weight-bar-value">{p.weight}</span>
                          <span className="weight-bar-date">{formatShortDate(p.date)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

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
          background: linear-gradient(180deg, #0a021f 0%, #0a0a0f 40%, #0a0a0a 100%);
        }
        .profil-hero {
          position: relative;
          padding: 48px 24px 40px;
          overflow: hidden;
        }
        .profil-hero-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139, 92, 255, 0.15), transparent),
            radial-gradient(ellipse 60% 40% at 80% 20%, rgba(14, 165, 233, 0.08), transparent);
          pointer-events: none;
        }
        .profil-hero-content {
          position: relative;
          max-width: 900px;
          margin: 0 auto;
        }
        .profil-hero h1 {
          font-size: clamp(28px, 5vw, 36px);
          font-weight: 700;
          margin: 0 0 8px;
          color: #fff;
        }
        .profil-hero h1 span {
          background: linear-gradient(90deg, #9b5cff, #0EA5E9);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .profil-hero-sub {
          color: #a1a1aa;
          font-size: 16px;
          margin: 0 0 20px;
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
          border-radius: 10px;
          font-size: 14px;
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .btn-ghost:hover {
          border-color: #52525b;
          color: #fff;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(90deg, #9b5cff, #7c3aed);
          color: #fff;
          border: none;
          padding: 12px 20px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(155, 92, 255, 0.4);
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
          padding: 12px 20px;
          border-radius: 12px;
          font-weight: 500;
          font-size: 15px;
          text-decoration: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .btn-secondary:hover {
          border-color: #52525b;
          background: rgba(255,255,255,0.03);
        }
        .btn-outline {
          background: transparent;
          border: 2px solid rgba(155, 92, 255, 0.6);
          color: #c4b5fd;
        }
        .btn-outline:hover {
          background: rgba(155, 92, 255, 0.15);
          border-color: #9b5cff;
        }
        .profil-loading {
          text-align: center;
          padding: 64px 24px;
          color: #71717a;
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
          color: #ef4444;
        }
        .profil-content {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 24px 64px;
        }
        .profil-section {
          margin-bottom: 40px;
        }
        .profil-section h2 {
          font-size: 18px;
          font-weight: 600;
          color: #e4e4e7;
          margin: 0 0 16px;
        }
        .profil-section-hint {
          font-size: 14px;
          color: #a1a1aa;
          margin: -8px 0 20px;
          line-height: 1.5;
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
          gap: 16px;
        }
        .kpi-card {
          background: rgba(24, 24, 36, 0.8);
          border: 1px solid #2a2a3d;
          border-radius: 16px;
          padding: 20px;
          text-align: center;
          transition: border-color 0.2s, transform 0.2s;
        }
        .kpi-card:hover {
          border-color: #3f3f52;
          transform: translateY(-2px);
        }
        .kpi-icon {
          font-size: 28px;
          display: block;
          margin-bottom: 8px;
        }
        .kpi-value {
          display: block;
          font-size: 24px;
          font-weight: 700;
          color: #fff;
        }
        .kpi-label {
          font-size: 12px;
          color: #71717a;
          margin-top: 4px;
          display: block;
        }
        .body-figures-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 32px;
          flex-wrap: wrap;
          padding: 32px 24px;
          background: rgba(24, 24, 36, 0.8);
          border: 1px solid #2a2a3d;
          border-radius: 16px;
        }
        .body-figure-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px;
          background: rgba(30, 30, 46, 0.6);
          border-radius: 12px;
          border: 1px solid #2a2a3d;
        }
        .body-figure-card.body-figure-single {
          padding: 24px 32px;
        }
        .body-figure-card-now {
          border-color: rgba(167, 139, 255, 0.5);
          box-shadow: 0 0 24px rgba(139, 92, 255, 0.15);
        }
        .body-figure-card-before {
          border-color: #2a2a3d;
          opacity: 0.92;
        }
        .body-figure-date {
          font-size: 12px;
          color: #71717a;
        }
        .body-figure-hint {
          margin: 8px 0 0;
          font-size: 13px;
          color: #71717a;
          text-align: center;
          max-width: 260px;
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
          padding: 32px;
          text-align: center;
          color: #71717a;
        }
        .body-figure-empty p { margin: 0; }
        .weight-chart {
          background: rgba(24, 24, 36, 0.8);
          border: 1px solid #2a2a3d;
          border-radius: 16px;
          padding: 24px;
          overflow-x: auto;
        }
        .weight-chart-bars {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          min-height: 140px;
          padding: 8px 0;
        }
        .weight-bar-wrap {
          flex: 1;
          min-width: 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .weight-bar {
          width: 100%;
          max-width: 32px;
          min-height: 8px;
          background: linear-gradient(180deg, #9b5cff, #7c3aed);
          border-radius: 6px 6px 0 0;
          transition: height 0.3s;
        }
        .weight-bar-value {
          font-size: 11px;
          font-weight: 600;
          color: #a1a1aa;
        }
        .weight-bar-date {
          font-size: 10px;
          color: #52525b;
        }
        .action-buttons {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .empty-state {
          background: rgba(24, 24, 36, 0.6);
          border: 1px dashed #3f3f52;
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          color: #71717a;
        }
        .empty-state p { margin: 0 0 16px; }
        .workouts-list { display: flex; flex-direction: column; gap: 12px; }
        .workout-card {
          position: relative;
          background: rgba(24, 24, 36, 0.8);
          border: 1px solid #2a2a3d;
          border-radius: 12px;
          padding: 16px 44px 16px 16px;
          transition: border-color 0.2s;
        }
        .workout-card:hover { border-color: #3f3f52; }
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
          background: rgba(155, 92, 255, 0.2);
          color: #a78bfa;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 13px;
        }
        .workout-notes {
          margin: 8px 0 0 40px;
          font-size: 13px;
          color: #a1a1aa;
        }
        .workout-delete {
          position: absolute;
          top: 12px;
          right: 12px;
          background: none;
          border: none;
          color: #71717a;
          font-size: 20px;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          transition: color 0.2s;
        }
        .workout-delete:hover { color: #ef4444; }
        .metrics-list, .plans-list { display: flex; flex-direction: column; gap: 16px; }
        .metric-card, .plan-card {
          background: rgba(24, 24, 36, 0.8);
          border: 1px solid #2a2a3d;
          border-radius: 12px;
          padding: 20px;
        }
        .metric-card h3, .plan-header {
          font-size: 14px;
          color: #a78bfa;
          margin: 0 0 12px;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 12px;
        }
        .metric-grid div { font-size: 14px; }
        .metric-grid .muted { display: block; font-size: 11px; color: #71717a; margin-bottom: 2px; }
        .metric-notes { margin: 12px 0 0; font-size: 13px; color: #a1a1aa; }
        .plan-type { font-weight: 600; }
        .plan-date { float: right; font-size: 12px; color: #71717a; }
        .plan-card p { margin: 4px 0; font-size: 14px; }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 24px;
        }
        .modal {
          background: #12121a;
          border: 1px solid #2a2a3d;
          border-radius: 20px;
          width: 100%;
          max-width: 400px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #2a2a3d;
        }
        .modal-header h3 { margin: 0; font-size: 18px; color: #fff; }
        .modal-header button {
          background: none;
          border: none;
          color: #71717a;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .modal-header button:hover { color: #fff; }
        .modal-form {
          padding: 24px;
        }
        .modal-form > div { margin-bottom: 16px; }
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
          border-radius: 10px;
          border: 1px solid #2a2a3d;
          background: #0f0f0f;
          color: #fff;
          font-size: 15px;
        }
        .modal-error {
          margin: 0 0 16px;
          padding: 12px;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          border-radius: 8px;
          color: #f87171;
          font-size: 14px;
        }
        .modal-hint {
          margin: 0 0 16px;
          font-size: 13px;
          color: #71717a;
          line-height: 1.4;
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
