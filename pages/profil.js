// /pages/profil.js – Modern Premium Profil (real-time update zachován)

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

  const fetchProfileWithToken = (accessToken) =>
    fetch('/api/profile', { headers: { Authorization: `Bearer ${accessToken}` } })
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

  const refetchProfile = () => {
    if (!session?.access_token) return Promise.resolve();
    return fetchProfileWithToken(session.access_token);
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
    const res = await fetch('/api/workouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(workoutForm),
    });

    const json = await res.json();
    if (res.ok) {
      setProfile((p) => ({
        ...p,
        workouts: [json.workout, ...(p.workouts || [])],
      }));
      setShowWorkoutModal(false);
      await refetchProfile();
    }
  }

  async function handleAddWeight(e) {
    e.preventDefault();

    const res = await fetch('/api/quick-weight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        weight_kg: Number(weightForm.weight_kg),
        date: weightForm.date,
      }),
    });

    const json = await res.json();

    if (res.ok && json.metric) {
      setProfile((p) => ({
        ...p,
        body_metrics: [json.metric, ...(p.body_metrics || [])],
      }));
      setShowWeightModal(false);
      await refetchProfile();
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
            {/* POSTAVA */}
            <section className="card center">
              <h2>Tvůj progres</h2>

              {latestMetric && (
                <BodyFigure
                  weight={latestMetric.weight_kg}
                  height={latestMetric.height_cm}
                  gender={latestMetric.gender}
                  goal={latestMetric.goal}
                  size={150}
                />
              )}

              {weightDiff && (
                <p className="trend">
                  Změna od začátku:{' '}
                  <strong>
                    {weightDiff > 0 ? '+' : ''}
                    {weightDiff} kg
                  </strong>
                </p>
              )}
            </section>

            {/* KPI */}
            <section className="kpis">
              <div className="kpi">
                <span>🏋️</span>
                <h3>{workouts.length}</h3>
                <p>Tréninků</p>
              </div>

              <div className="kpi">
                <span>⏱️</span>
                <h3>{totalMinutes} min</h3>
                <p>V pohybu</p>
              </div>

              <div className="kpi">
                <span>🔥</span>
                <h3>{estimatedCaloriesAll}</h3>
                <p>Spáleno (odhad)</p>
              </div>

              <div className="kpi">
                <span>⚖️</span>
                <h3>{currentWeight ?? '—'} kg</h3>
                <p>Aktuální váha</p>
              </div>
            </section>

            {/* GRAF */}
            {chartWeightData.length >= 2 && (
              <section className="card">
                <h2>Vývoj váhy</h2>
                <div className="chart">
                  {chartWeightData.map((p) => (
                    <div key={p.date} className="chart-item">
                      <strong>{p.weight}</strong>
                      <span>{formatShortDate(p.date)}</span>
                    </div>
                  ))}
                </div>
              </section>
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
          margin-top: 20px;
          font-size: 18px;
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

        .kpi span {
          font-size: 30px;
        }

        .kpi h3 {
          margin: 10px 0;
          font-size: 24px;
        }

        .chart {
          display: flex;
          gap: 20px;
          overflow-x: auto;
        }

        .chart-item {
          text-align: center;
          min-width: 80px;
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