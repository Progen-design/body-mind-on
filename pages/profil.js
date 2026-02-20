// /pages/profil.js – Modern Premium Profil (real-time update, refetch on focus, timeout 15s)

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BodyFigure from '../components/BodyFigure';
import WelcomeTour from '../components/WelcomeTour';
import PlanViewer from '../components/PlanViewer';
import Toast from '../components/Toast';
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
  // Pokud je to string ve formátu YYYY-MM-DD, přidat čas pro správné parsování
  let dateStr = d;
  if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Přidat čas pro správné parsování (UTC, aby se předešlo problémům s timezone)
    dateStr = `${d}T12:00:00Z`;
  }
  const date = new Date(dateStr);
  // Zkontrolovat, zda je datum platné
  if (isNaN(date.getTime())) {
    console.warn('Invalid date:', d);
    return '—';
  }
  return date.toLocaleDateString('cs-CZ', {
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
  const [weightError, setWeightError] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

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

  const profileRef = useRef(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const fetchOptions = { cache: 'no-store' };

  const fetchProfileWithToken = (accessToken, currentProfileForSkip) =>
    fetch(`/api/profile?t=${Date.now()}`, {
      ...fetchOptions,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return { error: data.error };
        }
        const sortedWorkouts = Array.isArray(data.workouts)
          ? [...data.workouts].sort((a, b) => {
              const dateA = (a.workout_date || '').toString();
              const dateB = (b.workout_date || '').toString();
              return dateB.localeCompare(dateA);
            })
          : [];
        const sortedMetrics = Array.isArray(data.body_metrics)
          ? [...data.body_metrics].sort((a, b) => {
              const dateA = (a.created_at || '').toString();
              const dateB = (b.created_at || '').toString();
              return dateB.localeCompare(dateA);
            })
          : [];
        const freshProfile = {
          user: data.user ? { ...data.user } : null,
          body_metrics: sortedMetrics,
          workouts: sortedWorkouts,
          plans: Array.isArray(data.plans) ? [...data.plans] : [],
          weight_history: Array.isArray(data.weight_history) ? [...data.weight_history] : [],
          stats: data.stats ? { ...data.stats } : {},
          _updated: Date.now(),
        };
        let skipped = false;
        setProfile((prev) => {
          if (!prev) return freshProfile;
          const nw = prev.workouts?.length ?? 0;
          const nm = prev.body_metrics?.length ?? 0;
          if (sortedWorkouts.length < nw || sortedMetrics.length < nm) {
            skipped = true;
            return prev;
          }
          return freshProfile;
        });
        setError('');
        return { ok: true, skipped };
      })
      .catch((err) => {
        console.error('Fetch profile error:', err);
        setError('Chyba při načítání profilu');
        return { error: err.message };
      });

  const refetchProfile = (token, currentProfileForSkip) => {
    const t = token ?? session?.access_token;
    if (!t) return Promise.resolve();
    return fetchProfileWithToken(t, currentProfileForSkip);
  };

  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setError('Načítání trvalo příliš dlouho. Zkontroluj připojení a obnov stránku.');
      }
    }, 15000);
    (async () => {
      const { data: { session: s }, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionErr || !s) {
        router.replace('/login');
        return;
      }
      const { data: { session: fresh }, error: refreshErr } = await supabase.auth.refreshSession();
      const sessionToUse = !refreshErr && fresh ? fresh : s;
      setSession(sessionToUse);

      let result = await fetchProfileWithToken(sessionToUse.access_token);
      if (cancelled) return;
      if (result?.error === 'Neplatná session' || result?.error === 'Nejste přihlášen') {
        const { data: { session: retrySession } } = await supabase.auth.refreshSession();
        if (retrySession) {
          result = await fetchProfileWithToken(retrySession.access_token);
          if (result?.ok) setSession(retrySession);
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
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [router]);

  useEffect(() => {
    if (!session?.access_token || loading) return;
    const interval = setInterval(async () => {
      try {
        const { data: { session: fresh } } = await supabase.auth.refreshSession();
        const token = fresh?.access_token ?? session?.access_token;
        if (token) await refetchProfile(token);
      } catch (err) {}
    }, 30000);
    return () => clearInterval(interval);
  }, [session, loading]);

  useEffect(() => {
    if (!session?.access_token) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchProfile(session.access_token, profileRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [session?.access_token]);

  // Zobrazit welcome tour po prvním přihlášení
  useEffect(() => {
    if (!loading && session && !error) {
      const tourSeen = localStorage.getItem('welcomeTourSeen');
      if (!tourSeen) {
        // Počkat chvíli, aby se stránka načetla, pak zobrazit tour
        const timer = setTimeout(() => {
          setShowWelcomeTour(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, session, error]);

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
        
        // OKAMŽITĚ aktualizovat state - real-time update bez čekání
        setProfile((p) => {
          const prev = p || {};
          // Přidat nový trénink a SORT podle data (nejnovější první)
          const newWorkouts = [newWorkout, ...(prev.workouts || [])].sort((a, b) => {
            const dateA = (a.workout_date || '').toString();
            const dateB = (b.workout_date || '').toString();
            return dateB.localeCompare(dateA); // Descending - nejnovější první
          });
          // Vytvořit NOVÝ objekt s novými referencemi pro všechny pole, aby React viděl změnu
          return { 
            ...prev,
            user: prev.user ? { ...prev.user } : null,
            body_metrics: prev.body_metrics ? [...prev.body_metrics] : [],
            workouts: newWorkouts,
            plans: prev.plans ? [...prev.plans] : [],
            weight_history: prev.weight_history ? [...prev.weight_history] : [],
            stats: prev.stats ? { ...prev.stats } : {},
            _updated: Date.now() // Zajistit změnu reference pro useMemo
          };
        });
        
        // Zavřít modal a resetovat formulář OKAMŽITĚ
        setWorkoutForm({ workout_date: new Date().toISOString().split('T')[0], workout_type: 'silovy', duration_min: 45, notes: '' });
        setShowWorkoutModal(false);
        if (fresh) setSession(fresh);
        
        // Zobrazit toast notifikaci
        setToast({ message: 'Trénink úspěšně přidán! 🏋️', type: 'success' });
        
        (async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const result = await refetchProfile(token, profileRef.current);
            if (result?.skipped) setTimeout(() => refetchProfile(token), 800);
          } catch (err) {
            console.warn('Background refetch failed:', err);
          }
        })();
      } else {
        const errorMsg = json.error || 'Chyba při ukládání tréninku';
        setWorkoutError(errorMsg);
        setToast({ message: errorMsg, type: 'error' });
      }
    } catch (err) {
      const errorMsg = err.message || 'Chyba připojení';
      setWorkoutError(errorMsg);
      setToast({ message: errorMsg, type: 'error' });
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
        // OKAMŽITĚ aktualizovat state - real-time update bez čekání
        setProfile((p) => {
          const prev = p || {};
          const newWorkouts = (prev.workouts || []).filter((w) => w.id !== id);
          // Vytvořit NOVÝ objekt s novými referencemi pro všechny pole
          return { 
            ...prev,
            user: prev.user ? { ...prev.user } : null,
            body_metrics: prev.body_metrics ? [...prev.body_metrics] : [],
            workouts: newWorkouts,
            plans: prev.plans ? [...prev.plans] : [],
            weight_history: prev.weight_history ? [...prev.weight_history] : [],
            stats: prev.stats ? { ...prev.stats } : {},
            _updated: Date.now()
          };
        });
        
        if (fresh) setSession(fresh);
        
        // Zobrazit toast notifikaci
        setToast({ message: 'Trénink smazán', type: 'info' });
        
        (async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const result = await refetchProfile(token, profileRef.current);
            if (result?.skipped) setTimeout(() => refetchProfile(token), 800);
          } catch (err) {
            console.warn('Background refetch failed:', err);
          }
        })();
      } else {
        setToast({ message: 'Nepodařilo se smazat trénink', type: 'error' });
      }
    } catch (err) {
      console.error('Delete workout error:', err);
      setToast({ message: 'Chyba při mazání tréninku', type: 'error' });
    }
  }

  async function handleAddWeight(e) {
    e.preventDefault();
    setWeightError('');
    setSavingWeight(true);
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
        // Normalizovat metrikum: mít pole date pro graf (z created_at nebo date)
        const metric = {
          ...json.metric,
          date: json.metric.date || (json.metric.created_at ? String(json.metric.created_at).slice(0, 10) : weightForm.date),
        };
        setProfile((p) => {
          const prev = p || {};
          const newMetrics = [metric, ...(prev.body_metrics || [])].sort((a, b) => {
            const dateA = (a.created_at || '').toString();
            const dateB = (b.created_at || '').toString();
            return dateB.localeCompare(dateA); // Descending - nejnovější první
          });
          // Vytvořit NOVÝ objekt s novými referencemi pro všechny pole, aby React viděl změnu
          return { 
            ...prev,
            user: prev.user ? { ...prev.user } : null,
            body_metrics: newMetrics,
            workouts: prev.workouts ? [...prev.workouts] : [],
            plans: prev.plans ? [...prev.plans] : [],
            weight_history: prev.weight_history ? [...prev.weight_history] : [],
            stats: prev.stats ? { ...prev.stats } : {},
            _updated: Date.now() // Zajistit změnu reference pro useMemo
          };
        });
        
        // Zavřít modal a resetovat formulář OKAMŽITĚ
        setWeightForm((f) => ({ ...f, weight_kg: '' }));
        setShowWeightModal(false);
        if (fresh) setSession(fresh);
        
        // Zobrazit toast notifikaci
        setToast({ message: 'Váha úspěšně přidána! ⚖️', type: 'success' });
        
        (async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const result = await refetchProfile(token, profileRef.current);
            if (result?.skipped) setTimeout(() => refetchProfile(token), 800);
          } catch (err) {
            console.warn('Background refetch failed:', err);
          }
        })();
      } else {
        const errorMsg = json.error || 'Chyba při ukládání váhy';
        setWeightError(errorMsg);
        setToast({ message: errorMsg, type: 'error' });
      }
    } catch (err) {
      const errorMsg = err.message || 'Chyba připojení';
      setWeightError(errorMsg);
      setToast({ message: errorMsg, type: 'error' });
    } finally {
      setSavingWeight(false);
    }
  }

  if (!session && !loading) return null;

  // Všechny parametry se přepočítají při každé změně profile (trénink, váha)
  // Použít _updated timestamp jako závislost, aby se vždy přepočítalo při změně
  const { metrics, workouts, latestMetric, firstMetric, latestWorkout, currentWeight, weightDiff, workoutsThisWeek, totalMinutesThisWeek, estimatedCaloriesThisWeek, totalMinutes, estimatedCaloriesAll, chartWeightData, userName } = useMemo(() => {
    // Zajistit, že máme vždy nové reference na pole pro správnou detekci změn
    // A SORT podle data - nejnovější první
    const m = profile?.body_metrics 
      ? [...(profile.body_metrics || [])].sort((a, b) => {
          const dateA = (a.created_at || '').toString();
          const dateB = (b.created_at || '').toString();
          return dateB.localeCompare(dateA); // Descending - nejnovější první
        })
      : [];
    const w = profile?.workouts 
      ? [...(profile.workouts || [])].sort((a, b) => {
          const dateA = (a.workout_date || '').toString();
          const dateB = (b.workout_date || '').toString();
          return dateB.localeCompare(dateA); // Descending - nejnovější první
        })
      : [];
    const latest = m[0];
    const first = m[m.length - 1];
    const cw = latest?.weight_kg ?? null;
    const wd = latest && first ? (latest.weight_kg - first.weight_kg).toFixed(1) : null;
    
    // Najít poslední trénink pro aktualizaci data u postavy
    const latestWorkout = w.length > 0 ? w[0] : null;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const getDate = (x) => (x.workout_date || '').toString().slice(0, 10);
    const thisWeek = w.filter((x) => getDate(x) >= weekStartStr);
    const minWeek = thisWeek.reduce((s, x) => s + (Number(x.duration_min) || 0), 0);
    const kcalWeek = thisWeek.reduce((s, x) => s + estimatedCalories(x), 0);
    const minTotal = w.reduce((s, x) => s + (Number(x.duration_min) || 0), 0);
    const kcalTotal = w.reduce((s, x) => s + estimatedCalories(x), 0);

    // Pro graf: použít datum z created_at, ale pokud je v date poli, použít to
    // Zajistit, že každé měření má své vlastní datum
    const chartData = m
      .filter((x) => x.weight_kg && (x.created_at || x.date))
      .map((x) => {
        // Použít date pokud existuje, jinak created_at
        const dateStr = x.date || (x.created_at ? x.created_at.split('T')[0] : null);
        return { 
          date: dateStr, 
          weight: x.weight_kg,
          // Přidat timestamp pro unikátní identifikaci
          id: x.id || `${dateStr}-${x.weight_kg}`
        };
      })
      .filter((x) => x.date) // Odstranit položky bez data
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')) // Seřadit podle data vzestupně
      .reverse(); // Obrátit pro zobrazení (nejnovější první)

    const name = profile?.user?.name || profile?.user?.email?.split('@')[0] || 'Sportovče';

    return {
      metrics: m,
      workouts: w,
      latestMetric: latest,
      firstMetric: first,
      latestWorkout: latestWorkout, // Poslední trénink pro aktualizaci postavy
      currentWeight: cw,
      weightDiff: wd,
      workoutsThisWeek: thisWeek,
      totalMinutesThisWeek: minWeek,
      estimatedCaloriesThisWeek: kcalWeek,
      totalMinutes: minTotal,
      estimatedCaloriesAll: kcalTotal,
      chartWeightData: chartData,
      userName: name,
    };
  }, [
    profile, 
    profile?._updated, 
    profile?.workouts?.length, 
    profile?.body_metrics?.length,
    // Přidat explicitní závislosti pro zajištění přepočítání
    profile?.workouts?.[0]?.workout_date, // První trénink (nejnovější)
    profile?.workouts?.[0]?.id, // ID prvního tréninku pro detekci změny
    profile?.body_metrics?.[0]?.created_at, // Poslední měření
    profile?.body_metrics?.[0]?.id, // ID posledního měření pro detekci změny
    profile?.body_metrics?.[0]?.weight_kg, // Váha posledního měření - důležité pro postavu
    profile?.workouts?.[0]?.workout_date, // Datum posledního tréninku - důležité pro aktualizaci postavy
    profile?.workouts?.[0]?.workout_type, // Typ posledního tréninku - důležité pro vizuální změnu
    // Přidat JSON string pro detekci změn v datech
    JSON.stringify(profile?.workouts?.slice(0, 5)?.map(w => ({ id: w.id, date: w.workout_date, type: w.workout_type })) || []),
    JSON.stringify(profile?.body_metrics?.slice(0, 5)?.map(m => ({ id: m.id, date: m.created_at, weight: m.weight_kg })) || [])
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      if (fresh) setSession(fresh);
      const result = await refetchProfile(token);
      if (result?.ok) {
        setToast({ message: 'Data obnovena! 🔄', type: 'success' });
      } else {
        setToast({ message: 'Nepodařilo se obnovit data', type: 'warning' });
      }
    } catch (err) {
      setToast({ message: 'Chyba při obnovování dat', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  // Najít aktuální/nejnovější plán
  const currentPlan = useMemo(() => {
    if (!profile?.plans || !Array.isArray(profile.plans) || profile.plans.length === 0) {
      return null;
    }
    // Najít platný plán (valid_until >= dnes) nebo nejnovější
    const now = new Date();
    const validPlan = profile.plans.find(p => {
      if (!p.valid_until) return false;
      return new Date(p.valid_until) >= now;
    });
    // Pokud není platný, vezmi nejnovější
    return validPlan || profile.plans[0];
  }, [profile?.plans]);

  return (
    <>
      {showWelcomeTour && <WelcomeTour onClose={() => setShowWelcomeTour(false)} />}
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: '', type: 'success' })}
        />
      )}
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
              Postava se aktualizuje podle <strong>tvých tréninků</strong> - každý trénink se projeví okamžitě. Graf vychází z měření váhy. Vše se přepočítá hned po každé akci.
              <button type="button" onClick={handleRefresh} disabled={refreshing} className="btn-refresh" title="Obnovit data">
                {refreshing ? 'Obnovuji…' : '🔄 Obnovit přehled'}
              </button>
            </p>

            {/* MŮJ PLÁN */}
            {currentPlan && <PlanViewer plan={currentPlan} userName={userName} />}

            {/* POSTAVA – Předtím vs Teď, nebo jen Teď */}
            <section className="card center progress-section">
              <h2>Tvůj progres</h2>

              {latestMetric ? (
                <>
                  <div className="body-figures-row" key={`progress-${profile?._updated || 0}`}>
                    {firstMetric && firstMetric !== latestMetric ? (
                      <>
                        <div className="body-figure-box body-figure-before">
                          <BodyFigure
                            key={`before-${firstMetric.id}-${profile?._updated || 0}`}
                            weight={firstMetric.weight_kg}
                            height={firstMetric.height_cm}
                            gender={firstMetric.gender}
                            goal={firstMetric.goal}
                            size={130}
                            variant="before"
                            label="Předtím"
                          />
                          <span className="figure-date">{formatShortDate(firstMetric.date || firstMetric.created_at)}</span>
                        </div>
                        <span className="body-figure-arrow" aria-hidden>→</span>
                        <div className="body-figure-box body-figure-now">
                          <BodyFigure
                            key={`now-${latestMetric.id}-${profile?._updated || 0}`}
                            weight={latestMetric.weight_kg}
                            height={latestMetric.height_cm}
                            gender={latestMetric.gender}
                            goal={latestMetric.goal}
                            size={130}
                            variant="now"
                            label="Teď"
                            weightDiff={weightDiff}
                          />
                          <span className="figure-date">{formatShortDate(latestWorkout?.workout_date || latestMetric?.date || latestMetric?.created_at)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="body-figure-box body-figure-now body-figure-single">
                        <BodyFigure
                          key={`single-${latestMetric.id}-${profile?._updated || 0}`}
                          weight={latestMetric.weight_kg}
                          height={latestMetric.height_cm}
                          gender={latestMetric.gender}
                          goal={latestMetric.goal}
                          size={150}
                        />
                        <span className="figure-date">{formatShortDate(latestWorkout?.workout_date || latestMetric?.date || latestMetric?.created_at)}</span>
                      </div>
                    )}
                  </div>
                  {workoutsThisWeek.length > 0 && (
                    <p className="workout-badge">Tento týden: {workoutsThisWeek.length} tréninků 🏋️</p>
                  )}
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
                <p className="empty-progress">
                  Postava vychází z váhy – klikni na <strong>„Přidat váhu“</strong> níže a uvidíš zde tvar i trend. Tréninky se započítají do přehledu.
                </p>
              )}
            </section>

            {/* RYCHLÉ AKCE */}
            <section className="card actions">
              <h2>Rychlé akce</h2>
              <div className="action-buttons">
                <button type="button" onClick={() => { setShowWorkoutModal(true); setWorkoutError(''); }} className="btn-primary">
                  + Zapsat trénink
                </button>
                <button type="button" onClick={() => { setShowWeightModal(true); setWeightError(''); }} className="btn-secondary">
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
                <p className="chart-hint">Data z tlačítka „Přidat váhu“. Každé nové měření se zobrazí ihned.</p>
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
                    {savingWorkout && (
                      <div className="modal-loading">
                        <div className="loading-spinner"></div>
                        <span>Ukládám trénink…</span>
                      </div>
                    )}
                    <div className="modal-actions">
                      <button type="button" onClick={() => { setShowWorkoutModal(false); setWorkoutError(''); }} disabled={savingWorkout}>Zrušit</button>
                      <button type="submit" disabled={savingWorkout} className={savingWorkout ? 'loading' : ''}>
                        {savingWorkout ? (
                          <>
                            <span className="button-spinner"></span>
                            Ukládám…
                          </>
                        ) : (
                          'Uložit'
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {showWeightModal && (
              <div className="modal-overlay" onClick={() => { setShowWeightModal(false); setWeightError(''); }}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Přidat váhu</h3>
                  <form onSubmit={handleAddWeight}>
                    <label>Datum měření</label>
                    <input type="date" value={weightForm.date} onChange={(e) => setWeightForm((f) => ({ ...f, date: e.target.value }))} required />
                    <label>Váha (kg)</label>
                    <input type="number" min={30} max={300} step={0.1} placeholder="např. 78.5" value={weightForm.weight_kg} onChange={(e) => setWeightForm((f) => ({ ...f, weight_kg: e.target.value }))} required />
                    <p className="modal-hint">Postava i graf se přepočítají ihned.</p>
                    {weightError && <p className="modal-error" role="alert">{weightError}</p>}
                    {savingWeight && (
                      <div className="modal-loading">
                        <div className="loading-spinner"></div>
                        <span>Ukládám váhu…</span>
                      </div>
                    )}
                    <div className="modal-actions">
                      <button type="button" onClick={() => { setShowWeightModal(false); setWeightError(''); }} disabled={savingWeight}>Zrušit</button>
                      <button type="submit" disabled={savingWeight} className={savingWeight ? 'loading' : ''}>
                        {savingWeight ? (
                          <>
                            <span className="button-spinner"></span>
                            Ukládám…
                          </>
                        ) : (
                          'Uložit'
                        )}
                      </button>
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
          max-width: 580px;
          margin-left: auto;
          margin-right: auto;
        }
        .btn-refresh {
          display: inline-block;
          margin-left: 12px;
          padding: 6px 14px;
          background: rgba(139, 92, 255, 0.25);
          border: 1px solid #7c3aed;
          border-radius: 8px;
          color: #c4b5fd;
          font-size: 13px;
          cursor: pointer;
          vertical-align: middle;
        }
        .btn-refresh:hover:not(:disabled) { background: rgba(139, 92, 255, 0.4); }
        .btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }

        .progress-section { margin-bottom: 40px; }
        .body-figures-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          flex-wrap: wrap;
          margin: 24px 0 16px;
        }
        .body-figure-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .body-figure-box.body-figure-before { opacity: 0.9; }
        .body-figure-box.body-figure-now .body-figure-svg { filter: drop-shadow(0 8px 24px rgba(139, 92, 255, 0.35)); }
        .body-figure-arrow {
          font-size: 24px;
          color: #a78bfa;
        }
        .body-figure-single { margin: 16px 0; }
        .figure-date { font-size: 12px; color: #64748b; }
        .workout-badge {
          margin-top: 12px;
          padding: 8px 16px;
          background: rgba(139, 92, 255, 0.2);
          border-radius: 20px;
          font-size: 14px;
          color: #c4b5fd;
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
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .modal-actions button[type="submit"]:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .modal-actions button[type="submit"].loading {
          position: relative;
        }

        .modal-loading {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(155, 92, 255, 0.1);
          border-radius: 10px;
          margin: 12px 0;
          color: #a78bfa;
          font-size: 14px;
        }

        .loading-spinner,
        .button-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        .button-spinner {
          width: 14px;
          height: 14px;
          border-width: 2px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .workout-item {
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .kpi {
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .kpi:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(155, 92, 255, 0.2);
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