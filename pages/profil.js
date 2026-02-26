// /pages/profil.js – Modern Premium Profil (real-time update, refetch on focus, timeout 15s)

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BodyFigure from '../components/BodyFigure';
import WelcomeTour from '../components/WelcomeTour';
import PlanViewer, { parsePlanHtml } from '../components/PlanViewer';
import HabitTracker from '../components/HabitTracker';
import HabitEntryWizard from '../components/HabitEntryWizard';
import Toast from '../components/Toast';
import { supabase } from '../lib/supabaseClient';

const PROGRAM_LABELS = {
  START: { greeting: 'Ahoj', subtitle: 'Každý trénink, každé měření.' },
  ON_CLUB: { greeting: 'Vítej v ON Clubu', subtitle: 'Jsi členem ON Clubu – sleduj návyky, tréninky a svůj progres.' },
  VIP: { greeting: 'Vítej v VIP', subtitle: 'Jsi VIP člen – máš přístup ke všem funkcím včetně habit trackeru.' },
};

const WORKOUT_TYPES = [
  { id: 'silovy', label: 'Silový', emoji: '🏋️' },
  { id: 'kardio', label: 'Kardio', emoji: '🏃' },
  { id: 'strečink', label: 'Strečink', emoji: '🧘' },
  { id: 'joga', label: 'Jóga', emoji: '🪷' },
  { id: 'ostatni', label: 'Ostatní', emoji: '✨' },
];

// Odhad kcal/min dle typu (orientační; zdroje: běh ~8, silový 4–7, strečink/jóga nižší)
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [workoutError, setWorkoutError] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [showHabitEntryWizard, setShowHabitEntryWizard] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);
  const [sendingPlan, setSendingPlan] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [mindsetTipFromPlan, setMindsetTipFromPlan] = useState('');

  const [workoutForm, setWorkoutForm] = useState({
    workout_date: new Date().toISOString().split('T')[0],
    workout_type: 'silovy',
    duration_min: 45,
    notes: '',
  });

  const [settingsForm, setSettingsForm] = useState({
    start_weight_kg: '',
    goal_weight_kg: '',
    height_cm: '',
  });

  const profileRef = useRef(null);
  const lastMutatedAtRef = useRef(0);
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
          user_habits: Array.isArray(data.user_habits) ? [...data.user_habits] : [],
          workouts: sortedWorkouts,
          plans: Array.isArray(data.plans) ? [...data.plans] : [],
          weight_history: Array.isArray(data.weight_history) ? [...data.weight_history] : [],
          stats: data.stats ? { ...data.stats } : {},
          program: data.program || 'START',
          _updated: Date.now(),
        };
        let skipped = false;
        setProfile((prev) => {
          if (!prev) return freshProfile;
          const justMutated = lastMutatedAtRef.current && (Date.now() - lastMutatedAtRef.current) < 2500;
          if (justMutated) {
            skipped = true;
            return prev;
          }
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

  // Zobrazit vstupní formulář (habit wizard) jen pro ON Club a VIP; START má WelcomeTour
  useEffect(() => {
    if (!loading && session && !error && profile) {
      const program = profile.program || 'START';
      const habitWizardSeen = localStorage.getItem('habitEntryWizardSeen');
      const welcomeTourSeen = localStorage.getItem('welcomeTourSeen');
      const timer = setTimeout(() => {
        const hasNoHabits = !profile.user_habits || profile.user_habits.length === 0;
        if ((program === 'ON_CLUB' || program === 'VIP') && !habitWizardSeen && hasNoHabits) {
          setShowHabitEntryWizard(true);
        } else if (!welcomeTourSeen) {
          setShowWelcomeTour(true);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, session, error, profile?.program, profile?.user_habits]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      if (!token) {
        setToast({ message: 'Session vypršela. Odhlas se a přihlas znovu.', type: 'error' });
        return;
      }
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        await supabase.auth.signOut();
        setToast({ message: 'Účet byl smazán.', type: 'success' });
        router.replace('/login');
      } else {
        setToast({ message: json.error || 'Nepodařilo se smazat účet.', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Chyba připojení.', type: 'error' });
    } finally {
      setDeletingAccount(false);
      setShowDeleteAccountModal(false);
    }
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
        lastMutatedAtRef.current = Date.now();
        const newWorkout = { ...json.workout, id: json.workout.id ?? `new-${Date.now()}` };
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
        
        // Automaticky označit habit "Trénink" jako splněný pro datum tréninku
        try {
          await fetch('/api/habits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ log_date: workoutForm.workout_date, habit_id: 'training', completed: true }),
          });
        } catch (_) {}

        // Zobrazit toast notifikaci
        setToast({ message: 'Trénink úspěšně přidán! 🏋️ Habit "Trénink" byl automaticky označen jako splněný.', type: 'success' });
        (async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 2500));
            lastMutatedAtRef.current = 0;
            await refetchProfile(token, profileRef.current);
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
        
        lastMutatedAtRef.current = Date.now();
        (async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 2500));
            lastMutatedAtRef.current = 0;
            await refetchProfile(token, profileRef.current);
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
        lastMutatedAtRef.current = Date.now();
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
        
        setToast({ message: 'Váha úspěšně přidána! ⚖️', type: 'success' });
        (async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 2500));
            lastMutatedAtRef.current = 0;
            await refetchProfile(token, profileRef.current);
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

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSettingsError('');
    setSavingSettings(true);
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      if (!token) {
        setSettingsError('Session vypršela. Obnov stránku.');
        return;
      }
      const payload = {};
      if (settingsForm.goal_weight_kg !== '') payload.goal_weight_kg = Number(settingsForm.goal_weight_kg);
      const res = await fetch('/api/profile-settings', {
        ...fetchOptions,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setProfile((p) => ({
          ...p,
          user: p?.user ? { ...p.user, ...(json.user_metadata || {}) } : { ...json.user_metadata },
          _updated: Date.now(),
        }));
        setShowSettingsModal(false);
        setToast({ message: 'Údaje pro výpočet uloženy.', type: 'success' });
        const result = await refetchProfile(token);
        if (result?.ok) setProfile((prev) => ({ ...prev, _updated: Date.now() }));
      } else {
        setSettingsError(json.error || 'Nepodařilo se uložit.');
      }
    } catch (err) {
      setSettingsError(err.message || 'Chyba připojení');
    } finally {
      setSavingSettings(false);
    }
  }

  if (!session && !loading) return null;

  // Všechny parametry se přepočítají při každé změně profile (trénink, váha)
  // Použít _updated timestamp jako závislost, aby se vždy přepočítalo při změně
  const { program, metrics, workouts, latestMetric, firstMetric, latestWorkout, currentWeight, weightDiff, workoutsThisWeek, totalMinutesThisWeek, estimatedCaloriesThisWeek, totalMinutes, estimatedCaloriesAll, chartWeightData, userName, lastWeekCount, lastWeekMinutes, workoutTrend, startWeight, goalWeight, heightCm, estimatedKgLostTotal, estimatedCurrentWeight, estimatedCurrentWeightRounded, kgPerWeekFromWeek, weeksToGoal, weekStartFormatted, weekEndFormatted, thisWeekDates, startWeightDate, lastWeightDate } = useMemo(() => {
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
    const first = m[m.length - 1]; // nejstarší záznam = z registrace (Start)
    const cw = latest?.weight_kg ?? null;
    const wd = latest && first ? (latest.weight_kg - first.weight_kg).toFixed(1) : null;
    const registrationMetric = first; // údaje z registrace (Start): váha, výška
    const latestWorkout = w.length > 0 ? w[0] : null;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    const getDate = (x) => (x.workout_date || '').toString().slice(0, 10);
    const thisWeek = w.filter((x) => getDate(x) >= weekStartStr);
    const thisWeekDates = [...new Set(thisWeek.map((x) => getDate(x)))].sort().map((d) => formatShortDate(d));
    const minWeek = thisWeek.reduce((s, x) => s + (Number(x.duration_min) || 0), 0);
    const kcalWeek = thisWeek.reduce((s, x) => s + estimatedCalories(x), 0);
    const minTotal = w.reduce((s, x) => s + (Number(x.duration_min) || 0), 0);
    const kcalTotal = w.reduce((s, x) => s + estimatedCalories(x), 0);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekStartStr = lastWeekStart.toISOString().split('T')[0];
    const lastWeek = w.filter((x) => getDate(x) >= lastWeekStartStr && getDate(x) < weekStartStr);
    const lastWeekMin = lastWeek.reduce((s, x) => s + (Number(x.duration_min) || 0), 0);
    const workoutTrend = lastWeek.length > 0 || thisWeek.length > 0
      ? (thisWeek.length > lastWeek.length ? '↑' : thisWeek.length < lastWeek.length ? '↓' : '→')
      : null;

    // Oslovení: jméno a příjmení z registrace (nejstarší body_metrics), ne přezdívka
    const registrationName = registrationMetric?.name?.trim();
    const name = registrationName || profile?.user?.name || profile?.user?.email?.split('@')[0] || 'Sportovče';
    // Výchozí váha a výška z registrace (Start) – nevyplňovat znovu
    const startWeight = registrationMetric?.weight_kg != null ? Number(registrationMetric.weight_kg) : (profile?.user?.start_weight_kg != null ? Number(profile.user.start_weight_kg) : null);
    const heightCm = registrationMetric?.height_cm != null ? Number(registrationMetric.height_cm) : (profile?.user?.height_cm != null ? Number(profile.user.height_cm) : null);
    const goalWeight = profile?.user?.goal_weight_kg != null ? Number(profile.user.goal_weight_kg) : null;
    const KCAL_PER_KG = 7700;
    const estimatedKgLostTotal = kcalTotal / KCAL_PER_KG;
    const estimatedCurrentWeight = startWeight != null ? Math.max(goalWeight != null ? goalWeight : 0, startWeight - estimatedKgLostTotal) : null;
    const estimatedCurrentWeightRounded = estimatedCurrentWeight != null ? Math.round(estimatedCurrentWeight * 10) / 10 : null;

    // Graf váhy: výhradně z tréninků (odhad po každém dni s tréninkem). Vlevo nejstarší, vpravo nejnovější.
    let chartData = [];
    if (startWeight != null && w.length > 0) {
      const startDateStr = registrationMetric?.created_at ? String(registrationMetric.created_at).split('T')[0] : null;
      const sortedByDate = [...w].sort((a, b) => (getDate(a) || '').localeCompare(getDate(b) || ''));
      const firstWorkoutDate = getDate(sortedByDate[0]);
      const chartStartDate = startDateStr || firstWorkoutDate;
      if (chartStartDate !== firstWorkoutDate) {
        chartData.push({ date: chartStartDate, weight: Math.round(startWeight * 10) / 10 });
      }
      let cumulativeKcal = 0;
      const seenDates = new Set();
      sortedByDate.forEach((workout) => {
        const d = getDate(workout);
        if (!d) return;
        cumulativeKcal += estimatedCalories(workout);
        if (seenDates.has(d)) return;
        seenDates.add(d);
        const est = startWeight - cumulativeKcal / KCAL_PER_KG;
        const capped = goalWeight != null && est < goalWeight ? goalWeight : est;
        chartData.push({ date: d, weight: Math.round(capped * 10) / 10 });
      });
    }
    const kgPerWeekFromWeek = minWeek > 0 ? kcalWeek / KCAL_PER_KG : 0;
    let weeksToGoal = null;
    if (goalWeight != null && estimatedCurrentWeight != null && goalWeight < estimatedCurrentWeight && kgPerWeekFromWeek > 0) {
      weeksToGoal = (estimatedCurrentWeight - goalWeight) / kgPerWeekFromWeek;
    }

    const program = profile?.program || 'START';

    return {
      program,
      metrics: m,
      workouts: w,
      latestMetric: latest,
      firstMetric: first,
      latestWorkout: latestWorkout,
      currentWeight: cw,
      weightDiff: wd,
      workoutsThisWeek: thisWeek,
      totalMinutesThisWeek: minWeek,
      estimatedCaloriesThisWeek: kcalWeek,
      totalMinutes: minTotal,
      estimatedCaloriesAll: kcalTotal,
      chartWeightData: chartData,
      userName: name,
      lastWeekCount: lastWeek.length,
      lastWeekMinutes: lastWeekMin,
      workoutTrend,
      startWeight,
      goalWeight,
      heightCm,
      estimatedKgLostTotal,
      estimatedCurrentWeight,
      estimatedCurrentWeightRounded,
      kgPerWeekFromWeek,
      weeksToGoal,
      weekStartFormatted: formatShortDate(weekStartStr),
      weekEndFormatted: formatShortDate(weekEndStr),
      thisWeekDates,
      startWeightDate: chartData.length > 0 ? chartData[0].date : (registrationMetric?.created_at ? String(registrationMetric.created_at).split('T')[0] : null),
      lastWeightDate: chartData.length > 0 ? chartData[chartData.length - 1].date : null,
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
    JSON.stringify(profile?.body_metrics?.slice(0, 5)?.map(m => ({ id: m.id, date: m.created_at, weight: m.weight_kg })) || []),
    profile?.user?.start_weight_kg,
    profile?.user?.goal_weight_kg,
    profile?.user?.height_cm,
    profile?.program,
  ]);

  async function handleSendPlanAgain() {
    setSendingPlan(true);
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      if (!token) {
        setToast({ message: 'Session vypršela. Přihlas se znovu.', type: 'error' });
        return;
      }
      const res = await fetch('/api/send-plan-again', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setToast({ message: 'Plán byl odeslán na tvůj e-mail.', type: 'success' });
      } else {
        setToast({ message: json.error || 'Nepodařilo se odeslat plán.', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Chyba připojení.', type: 'error' });
    } finally {
      setSendingPlan(false);
    }
  }

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

  useEffect(() => {
    if (typeof document === 'undefined' || !currentPlan?.plan_html) {
      setMindsetTipFromPlan('');
      return;
    }
    const parsed = parsePlanHtml(currentPlan.plan_html);
    setMindsetTipFromPlan(parsed?.mindsetTip || '');
  }, [currentPlan?.plan_html]);

  return (
    <>
      {showWelcomeTour && <WelcomeTour onClose={() => setShowWelcomeTour(false)} />}
      {showHabitEntryWizard && (
        <HabitEntryWizard
          program={profile?.program || 'START'}
          session={session}
          bodyMetrics={profile?.body_metrics}
          userHabits={profile?.user_habits}
          onClose={() => setShowHabitEntryWizard(false)}
          onHabitsSaved={() => refetchProfile(session?.access_token, profile)}
        />
      )}
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: '', type: 'success' })}
        />
      )}
      <Header />
      <main className="page">
        {/* Hlavní cíl plánu úplně nahoře – vždy pro ON Club/VIP, jinak jen s plánem */}
        {(currentPlan || program === 'ON_CLUB' || program === 'VIP') && (
          <div className="plan-goal-hero">
            <h2 className="plan-goal-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
            <span className="plan-goal-badge plan-goal-badge-program">
              {program === 'ON_CLUB' ? 'ON Club' : program === 'VIP' ? 'VIP' : (currentPlan?.plan_type || 'START')}
            </span>
          </div>
        )}

        <section className="hero">
          <h1>
            {(PROGRAM_LABELS[program] || PROGRAM_LABELS.START).greeting}, <span>{userName}</span>
            {(program === 'ON_CLUB' || program === 'VIP') && (
              <span className="hero-program-badge">{program === 'ON_CLUB' ? 'ON Club' : 'VIP'}</span>
            )}
          </h1>
          <p className="hero-sub">{(PROGRAM_LABELS[program] || PROGRAM_LABELS.START).subtitle}</p>
          {!loading && !error && (
            <div className="hero-strip">
              <div className="hero-stat">
                <span className="hero-stat-value">{workoutsThisWeek?.length ?? 0} {workoutTrend ? <span className="trend-arrow" title={workoutTrend === '↑' ? 'Víc než minulý týden' : workoutTrend === '↓' ? 'Méně než minulý týden' : 'Stejně'}>{workoutTrend}</span> : null}</span>
                <span className="hero-stat-label">Tréninků tento týden</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-value">{totalMinutesThisWeek ?? 0} min</span>
                <span className="hero-stat-label">V pohybu</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-value">{estimatedCurrentWeight != null ? `${estimatedCurrentWeight.toFixed(1)} kg` : '—'}</span>
                <span className="hero-stat-label">Odhad z tréninků</span>
              </div>
            </div>
          )}
          <div className="hero-actions">
            <button onClick={handleLogout} className="logout">
              Odhlásit se
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteAccountModal(true)}
              className="logout logout-danger"
              title="Trvale smazat účet a všechna data"
            >
              Zrušit profil
            </button>
          </div>
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
            {/* Jasná první akce – pro uživatele bez tréninku */}
            {workouts.length === 0 && currentPlan && (
              <div className="first-action-banner">
                <p>
                  <strong>Tvůj plán je připraven.</strong>{' '}
                  {program === 'ON_CLUB' && 'Jsi v ON Clubu – zapiš první trénink, sleduj denní návyky nebo se podívej na dnešní jídlo v plánu níže.'}
                  {program === 'VIP' && 'Jsi VIP – zapiš první trénink, sleduj denní návyky nebo se podívej na dnešní jídlo v plánu níže.'}
                  {program !== 'ON_CLUB' && program !== 'VIP' && 'První krok: zapiš svůj první trénink nebo se podívej na dnešní jídlo v plánu níže.'}
                </p>
              </div>
            )}

            {/* Tvé milníky */}
            <section className="milestones-block">
              <h2 className="section-head">Tvé milníky</h2>
              <div className="milestones-list">
                <div className={`milestone-item ${currentPlan ? 'done' : ''}`}>
                  <span className="milestone-icon">{currentPlan ? '✓' : '○'}</span>
                  <span className="milestone-label">Plán připraven</span>
                </div>
                <div className={`milestone-item ${workouts.length > 0 ? 'done' : ''}`}>
                  <span className="milestone-icon">{workouts.length > 0 ? '✓' : '○'}</span>
                  <span className="milestone-label">První trénink</span>
                </div>
                <div className={`milestone-item ${(() => {
                  const created = profile?.user?.created_at;
                  if (!created) return false;
                  const reg = new Date(created);
                  const now = new Date();
                  const diffDays = (now - reg) / (1000 * 60 * 60 * 24);
                  return diffDays >= 7;
                })() ? 'done' : ''}`}>
                  <span className="milestone-icon">{(() => {
                    const created = profile?.user?.created_at;
                    if (!created) return '○';
                    const reg = new Date(created);
                    const now = new Date();
                    const diffDays = (now - reg) / (1000 * 60 * 60 * 24);
                    return diffDays >= 7 ? '✓' : '○';
                  })()}</span>
                  <span className="milestone-label">Týden s námi</span>
                </div>
              </div>
            </section>

            {/* Mindset na tento týden – hned pod Tvé milníky */}
            {mindsetTipFromPlan && (
              <div className="mindset-block">
                <h3 className="mindset-block-title">Mindset na tento týden</h3>
                <p className="mindset-block-text">{mindsetTipFromPlan}</p>
              </div>
            )}

            <div className="toolbar">
              <button type="button" onClick={handleRefresh} disabled={refreshing} className="btn-refresh" title="Obnovit data">
                {refreshing ? 'Obnovuji…' : '🔄 Obnovit'}
              </button>
              {currentPlan && (
                <button type="button" onClick={handleSendPlanAgain} disabled={sendingPlan} className="btn-send-plan" title="Poslat plán znovu na e-mail">
                  {sendingPlan ? 'Odesílám…' : '📧 Poslat plán znovu'}
                </button>
              )}
            </div>

            {/* RYCHLÉ AKCE – výrazný pruh */}
            <section className="actions-block">
              <h2 className="actions-title">Co chceš zapsat?</h2>
              <div className="action-buttons">
                <button type="button" onClick={() => { setShowWorkoutModal(true); setWorkoutError(''); }} className="btn-primary">
                  <span className="btn-emoji">🏋️</span>
                  Zapsat trénink
                </button>
                <button type="button" onClick={() => { setShowSettingsModal(true); setSettingsError(''); setSettingsForm({ start_weight_kg: '', goal_weight_kg: goalWeight ?? '', height_cm: '' }); }} className="btn-secondary btn-weight">
                  <span className="btn-emoji">📋</span>
                  Nastavení pro výpočet
                  <span className="btn-sublabel">Cílová váha pro odhad do cíle</span>
                </button>
              </div>
            </section>

            {/* Denní návyky */}
            <HabitTracker
              session={session}
              userHabits={profile?.user_habits}
              onToast={(t) => setToast({ message: t.message, type: t.type })}
            />

            {/* TVŮJ PROGRES – nahoře, nejdůležitější */}
            <section className="card card-accent center progress-section">
              <h2 className="section-head">Tvůj progres</h2>
              <p className="progress-lead">Všechny hodnoty vycházejí jen z tréninků a z tvého nastavení (výchozí váha, cíl, výška). Ruční váha do výpočtu nezasahuje.</p>

              <p className="progress-dates">Období: <strong>{weekStartFormatted}</strong> – <strong>{weekEndFormatted}</strong></p>
              <div className="progress-activity">
                <div className="progress-activity-main">
                  <span className="progress-big-num">{workoutsThisWeek?.length ?? 0}</span>
                  <span className="progress-big-label">tréninků tento týden</span>
                </div>
                <div className="progress-activity-main">
                  <span className="progress-big-num">{totalMinutesThisWeek ?? 0}</span>
                  <span className="progress-big-label">minut v pohybu</span>
                </div>
                <div className="progress-activity-main">
                  <span className="progress-big-num">~{estimatedCaloriesThisWeek ?? 0}</span>
                  <span className="progress-big-label">kcal tento týden</span>
                </div>
              </div>
              {thisWeekDates?.length > 0 && (
                <p className="progress-dates-detail">Dny s tréninkem: {thisWeekDates.join(', ')}</p>
              )}
              {workoutTrend && (
                <p className="progress-trend-hint">
                  {workoutTrend === '↑' && 'Víc tréninků než minulý týden. '}
                  {workoutTrend === '↓' && 'Méně než minulý týden – zkus přidat. '}
                  {workoutTrend === '→' && 'Stejný počet jako minulý týden. '}
                  Minulý týden: {lastWeekCount} tréninků, {lastWeekMinutes} min.
                </p>
              )}

              {startWeight != null || goalWeight != null ? (
                <>
                  <div className="progress-calc">
                    <p className="progress-calc-line">
                      Spáleno celkem odhad <strong>~{Math.round(estimatedCaloriesAll)} kcal</strong> ≈ úbytek <strong>~{estimatedKgLostTotal.toFixed(1)} kg</strong> (při 7700 kcal/kg).
                    </p>
                    {estimatedCurrentWeightRounded != null && (
                      <p className="progress-calc-line">
                        Odhadovaná váha z tréninků: <strong>{estimatedCurrentWeightRounded} kg</strong>
                        {startWeight != null && ` (výchozí ${startWeight} kg)`}.
                      </p>
                    )}
                    {goalWeight != null && estimatedCurrentWeight != null && estimatedCurrentWeight > goalWeight && (
                      <p className="progress-calc-line">
                        Do cíle <strong>{goalWeight} kg</strong> zbývá <strong>{(estimatedCurrentWeight - goalWeight).toFixed(1)} kg</strong>
                        {weeksToGoal != null && weeksToGoal > 0 && (
                          <> · Při tempu tohoto týdne odhad <strong>{weeksToGoal.toFixed(0)} týdnů</strong></>
                        )}.
                      </p>
                    )}
                  </div>
                  {startWeight != null && heightCm != null && (
                    <div className="body-figures-row" key={`progress-${profile?._updated || 0}`}>
                      <div className="body-figure-box body-figure-before">
                        <BodyFigure weight={startWeight} height={heightCm} size={130} variant="before" label="Výchozí" />
                        <span className="figure-weight">{startWeight} kg</span>
                        {startWeightDate && <span className="figure-date">{formatShortDate(startWeightDate)}</span>}
                      </div>
                      <span className="body-figure-arrow" aria-hidden>→</span>
                      <div className="body-figure-box body-figure-now">
                        <BodyFigure
                          weight={estimatedCurrentWeightRounded ?? startWeight}
                          height={heightCm}
                          size={130}
                          variant="now"
                          label="Odhad z tréninků"
                          weightDiff={estimatedCurrentWeight != null && startWeight != null ? (estimatedCurrentWeightRounded - startWeight).toFixed(1) : null}
                        />
                        <span className="figure-weight">{estimatedCurrentWeightRounded != null ? `${estimatedCurrentWeightRounded} kg` : '—'}</span>
                        {lastWeightDate && <span className="figure-date">k {formatShortDate(lastWeightDate)}</span>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="empty-progress">
                  Výchozí váha a výška jsou z registrace (Start). V <strong>„Nastavení pro výpočet“</strong> můžeš doplnit cílovou váhu – odhad zhubnutí se počítá jen z tréninků.
                </p>
              )}
            </section>

            {/* MŮJ PLÁN */}
            {currentPlan && <PlanViewer plan={currentPlan} userName={userName} hideHero />}

            {/* Historie tréninků – poslední 3 viditelné, zbytek v rozbalovacím menu */}
            <section className="card history-section">
              <h2 className="section-head">Historie tréninků</h2>
              {workouts.length === 0 ? (
                <p className="empty-history">Zatím nemáš žádné záznamy. Klikni na „Zapsat trénink“ a první trénink se objeví zde i v přehledu.</p>
              ) : (
                <>
                  <ul className="workout-list" key={`workouts-${profile?._updated ?? 0}`}>
                    {(showAllWorkouts ? workouts : workouts.slice(0, 3)).map((w, idx) => (
                      <li key={w.id ?? `w-${idx}-${w.workout_date}`} className="workout-item">
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
                  {workouts.length > 3 && (
                    <button type="button" className="workout-expand-btn" onClick={() => setShowAllWorkouts((v) => !v)}>
                      {showAllWorkouts ? 'Skrýt starší tréninky' : `Zobrazit starší tréninky (${workouts.length - 3})`}
                    </button>
                  )}
                </>
              )}
            </section>

            {/* KPI – horizontální pruh */}
            <section className="kpi-section">
              <h2 className="section-head">Statistiky</h2>
              <div className="kpis-bar">
                <div className="kpi-item">
                  <span className="kpi-icon">🏋️</span>
                  <span className="kpi-num">{workoutsThisWeek.length}</span>
                  <span className="kpi-label">tento týden</span>
                  <span className="kpi-sub">{workouts.length} celkem</span>
                </div>
                <div className="kpi-divider" />
                <div className="kpi-item">
                  <span className="kpi-icon">⏱️</span>
                  <span className="kpi-num">{totalMinutesThisWeek} min</span>
                  <span className="kpi-label">v pohybu</span>
                  <span className="kpi-sub">{totalMinutes} min celkem</span>
                </div>
                <div className="kpi-divider" />
                <div className="kpi-item">
                  <span className="kpi-icon">🔥</span>
                  <span className="kpi-num">~{estimatedCaloriesThisWeek}</span>
                  <span className="kpi-label">kcal</span>
                  <span className="kpi-sub">~{estimatedCaloriesAll} celkem</span>
                </div>
                <div className="kpi-divider" />
                <div className="kpi-item">
                  <span className="kpi-icon">⚖️</span>
                  <span className="kpi-num">{estimatedCurrentWeightRounded != null ? `${estimatedCurrentWeightRounded} kg` : '—'}</span>
                  <span className="kpi-label">odhad z tréninků</span>
                </div>
              </div>
            </section>

            {/* GRAF VÁHY – odhad z tréninků (automaticky po každém zápisu) */}
            <section className="card chart-section">
              <h2 className="section-head">Vývoj váhy</h2>
              {(chartWeightData || []).length >= 1 ? (
                <>
                <p className="chart-hint">Odhad váhy z tréninků – jeden bod = den s tréninkem. Vlevo nejstarší, vpravo nejnovější. Vše se přepočítá hned po zápisu tréninku.</p>
                {(chartWeightData || []).length >= 2 ? (
                  <>
                    <div className="chart-wrapper">
                      <div className="chart-svg-wrap">
                        <svg className="chart-svg" viewBox="0 0 560 200" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="weightGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#9b5cff" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {(() => {
                          const data = chartWeightData || [];
                          const pad = { t: 24, r: 28, b: 40, l: 48 };
                          const W = 560 - pad.l - pad.r;
                          const H = 200 - pad.t - pad.b;
                          const weights = data.map((x) => x.weight).filter((w) => typeof w === 'number');
                          const minW = weights.length ? Math.min(...weights) : 0;
                          const maxW = weights.length ? Math.max(...weights) : 1;
                          const rangeRaw = maxW - minW || 1;
                          const margin = Math.max(rangeRaw * 0.08, 0.2);
                          const range = rangeRaw + 2 * margin;
                          const minWPlot = minW - margin;
                          const pts = data.map((p, i) => {
                            const x = pad.l + (data.length > 1 ? (i / (data.length - 1)) * W : 0);
                            const y = pad.t + H - ((p.weight - minWPlot) / range) * H;
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
                        <div className="chart-labels-inner" style={{ paddingLeft: '8.57%', paddingRight: '5%' }}>
                        {(chartWeightData || []).map((p, i) => (
                          <div
                            key={`${p.date}-${i}`}
                            className="chart-label-item"
                            style={{
                              left: (chartWeightData || []).length > 1 ? `${(i / ((chartWeightData || []).length - 1)) * 100}%` : '50%',
                              transform: 'translateX(-50%)',
                            }}
                          >
                            <span className="chart-value">{p.weight} kg</span>
                            <span className="chart-date">{formatShortDate(p.date)}</span>
                          </div>
                        ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="chart-single">
                    <span className="chart-value">{(chartWeightData || [])[0]?.weight ?? '—'} kg</span>
                    <span className="chart-date">{formatShortDate((chartWeightData || [])[0]?.date)}</span>
                    <p className="chart-hint">Přidej další tréninky a uvidíš trend.</p>
                  </div>
                )}
                </>
              ) : (
                <p className="chart-empty">Graf se naplní automaticky podle zapsaných tréninků (výchozí váha z registrace). Zapiš tréninky a uvidíš odhad vývoje váhy.</p>
              )}
            </section>

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
            {showSettingsModal && (
              <div className="modal-overlay" onClick={() => { setShowSettingsModal(false); setSettingsError(''); }}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Nastavení pro výpočet</h3>
                  <p className="modal-hint">Výchozí váha a výška se berou z tvé registrace (Start) – nevyplňuj je znovu. Zde můžeš doplnit jen <strong>cílovou váhu</strong> pro odhad „týdny do cíle“. Žádná ruční váha do výpočtu nezasahuje.</p>
                  <form onSubmit={handleSaveSettings}>
                    <label>Cílová váha (kg)</label>
                    <input type="number" min={30} max={300} step={0.1} placeholder="např. 75" value={settingsForm.goal_weight_kg} onChange={(e) => setSettingsForm((f) => ({ ...f, goal_weight_kg: e.target.value }))} />
                    {settingsError && <p className="modal-error" role="alert">{settingsError}</p>}
                    {savingSettings && (
                      <div className="modal-loading">
                        <div className="loading-spinner"></div>
                        <span>Ukládám…</span>
                      </div>
                    )}
                    <div className="modal-actions">
                      <button type="button" onClick={() => { setShowSettingsModal(false); setSettingsError(''); }} disabled={savingSettings}>Zrušit</button>
                      <button type="submit" disabled={savingSettings} className={savingSettings ? 'loading' : ''}>
                        {savingSettings ? (<><span className="button-spinner"></span> Ukládám…</>) : 'Uložit'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {showDeleteAccountModal && (
              <div className="modal-overlay" onClick={() => { if (!deletingAccount) setShowDeleteAccountModal(false); }}>
                <div className="modal modal-danger" onClick={(e) => e.stopPropagation()}>
                  <h3>Zrušit profil</h3>
                  <p className="modal-hint">
                    Opravdu chceš smazat svůj účet? Veškerá data (tréninky, návyky, plán, měření) budou <strong>trvale smazána</strong>. Tato akce je nevratná.
                  </p>
                  <div className="modal-actions">
                    <button type="button" onClick={() => { if (!deletingAccount) setShowDeleteAccountModal(false); }} disabled={deletingAccount}>
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deletingAccount}
                      className="btn-danger"
                    >
                      {deletingAccount ? (<><span className="button-spinner"></span> Mažu…</>) : 'Ano, smazat účet'}
                    </button>
                  </div>
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

        .plan-goal-hero {
          text-align: center;
          padding: 28px 24px 32px;
          margin: -20px -20px 32px -20px;
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%);
          border-radius: 0 0 20px 20px;
          position: relative;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }
        .plan-goal-hero::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.5), transparent);
        }
        .plan-goal-hero-title {
          margin: 0 0 12px;
          font-size: 22px;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);
        }
        .plan-goal-badge {
          display: inline-block;
          background: rgba(255, 255, 255, 0.25);
          color: #e9d5ff;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .plan-goal-badge-program {
          background: rgba(255, 255, 255, 0.35);
          color: #fff;
          font-size: 13px;
          padding: 8px 18px;
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
        }

        .hero {
          text-align: center;
          margin-bottom: 40px;
        }
        .hero h1 {
          font-size: 38px;
          font-weight: 700;
        }
        .hero h1 > span:not(.hero-program-badge) {
          background: linear-gradient(90deg, #9b5cff, #00cfff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-program-badge {
          display: inline-block;
          margin-left: 12px;
          padding: 4px 12px;
          background: rgba(155, 92, 255, 0.25);
          border: 1px solid rgba(155, 92, 255, 0.5);
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          color: #c4b5fd;
          -webkit-text-fill-color: #c4b5fd;
          vertical-align: middle;
        }
        .hero-sub {
          color: #94a3b8;
          margin-top: 8px;
          font-size: 16px;
        }
        .hero-strip {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 24px 32px;
          margin-top: 28px;
          padding: 20px 24px;
          background: rgba(139, 92, 255, 0.12);
          border-radius: 16px;
          border: 1px solid rgba(139, 92, 255, 0.25);
          max-width: 520px;
          margin-left: auto;
          margin-right: auto;
        }
        .hero-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .hero-stat-value {
          font-size: 22px;
          font-weight: 700;
          color: #e9d5ff;
        }
        .hero-stat-value.trend-num { color: #fbbf24; }
        .hero-stat-label {
          font-size: 12px;
          color: #64748b;
        }
        .first-action-banner {
          margin-bottom: 24px;
          padding: 16px 20px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(99, 102, 241, 0.1));
          border: 1px solid rgba(139, 92, 255, 0.3);
          border-radius: 12px;
          text-align: center;
        }
        .first-action-banner p {
          margin: 0;
          font-size: 15px;
          color: #e9d5ff;
          line-height: 1.5;
        }
        .first-action-banner strong { color: #fff; }

        .milestones-block {
          margin-bottom: 28px;
          padding: 20px 24px;
          background: rgba(255,255,255,0.04);
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .milestones-block .section-head { margin-bottom: 16px; }
        .milestones-list {
          display: flex;
          flex-wrap: wrap;
          gap: 16px 24px;
        }
        .milestone-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          background: rgba(255,255,255,0.04);
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .milestone-item.done { border-color: rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.08); }
        .milestone-icon {
          width: 24px;
          height: 24px;
          line-height: 24px;
          text-align: center;
          border-radius: 50%;
          font-size: 14px;
          font-weight: 700;
          color: #64748b;
          background: rgba(255,255,255,0.06);
        }
        .milestone-item.done .milestone-icon { color: #22c55e; background: rgba(34, 197, 94, 0.2); }
        .milestone-label { font-size: 14px; color: #94a3b8; }
        .milestone-item.done .milestone-label { color: #e9d5ff; }

        .mindset-block {
          margin-bottom: 28px;
          padding: 20px 24px;
          background: rgba(139, 92, 255, 0.08);
          border-radius: 16px;
          border: 1px solid rgba(139, 92, 255, 0.2);
        }
        .mindset-block-title {
          margin: 0 0 12px;
          font-size: 18px;
          font-weight: 600;
          color: #e9d5ff;
        }
        .mindset-block-text {
          margin: 0;
          color: #e9d5ff;
          line-height: 1.5;
          font-size: 15px;
        }

        .toolbar {
          text-align: center;
          margin: -8px 0 20px;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 12px;
        }
        .btn-refresh, .btn-send-plan {
          padding: 8px 16px;
          background: rgba(255,255,255,0.06);
          border: 1px solid #444;
          border-radius: 10px;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
        }
        .btn-refresh:hover:not(:disabled), .btn-send-plan:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #c4b5fd; }
        .btn-refresh:disabled, .btn-send-plan:disabled { opacity: 0.6; cursor: not-allowed; }

        .actions-block {
          margin-bottom: 32px;
          padding: 28px 32px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(155, 92, 255, 0.15));
          border-radius: 20px;
          border: 1px solid rgba(139, 92, 255, 0.35);
        }
        .actions-title {
          margin: 0 0 20px;
          font-size: 18px;
          color: #e9d5ff;
          font-weight: 600;
        }
        .action-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
        }
        .btn-emoji { font-size: 20px; margin-right: 8px; }

        .progress-section { margin-bottom: 40px; }
        .progress-lead {
          color: #94a3b8;
          font-size: 14px;
          margin: -8px 0 20px;
          max-width: 420px;
          margin-left: auto;
          margin-right: auto;
        }
        .progress-dates {
          font-size: 13px;
          color: #64748b;
          margin: 0 0 12px;
        }
        .progress-dates-detail {
          font-size: 13px;
          color: #94a3b8;
          margin: -8px 0 16px;
        }
        .progress-activity {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 28px 40px;
          margin-bottom: 24px;
          padding: 24px 20px;
          background: rgba(139, 92, 255, 0.1);
          border-radius: 16px;
          border: 1px solid rgba(139, 92, 255, 0.2);
        }
        .progress-activity-main {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .progress-big-num {
          font-size: 28px;
          font-weight: 700;
          color: #e9d5ff;
        }
        .progress-big-label {
          font-size: 13px;
          color: #64748b;
        }
        .progress-trend-hint {
          font-size: 13px;
          color: #94a3b8;
          margin: 0 0 20px;
        }
        .progress-calc {
          margin: 20px 0 16px;
          padding: 16px 20px;
          background: rgba(0,0,0,0.2);
          border-radius: 12px;
          text-align: left;
          max-width: 480px;
          margin-left: auto;
          margin-right: auto;
        }
        .progress-calc-line {
          margin: 0 0 8px;
          font-size: 14px;
          color: #94a3b8;
        }
        .progress-calc-line:last-child { margin-bottom: 0; }
        .progress-calc-line strong { color: #e9d5ff; }
        .progress-weight-note {
          font-size: 12px;
          color: #64748b;
          margin: 16px 0 8px;
        }
        .trend-arrow {
          font-size: 18px;
          color: #4ade80;
          margin-left: 4px;
        }
        .hero-stat-value .trend-arrow { color: #fbbf24; }
        .body-figures-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          flex-wrap: wrap;
          margin: 24px 0 12px;
        }
        .body-figure-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .body-figure-box.body-figure-before { opacity: 0.9; }
        .body-figure-box.body-figure-now .body-figure-svg { filter: drop-shadow(0 8px 24px rgba(139, 92, 255, 0.35)); }
        .body-figure-arrow {
          font-size: 24px;
          color: #a78bfa;
        }
        .body-figure-single { margin: 16px 0; }
        .figure-weight {
          font-size: 15px;
          font-weight: 700;
          color: #e9d5ff;
        }
        .figure-date {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }
        .progress-summary {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 16px 24px;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .progress-summary .workout-badge {
          padding: 8px 16px;
          background: rgba(139, 92, 255, 0.2);
          border-radius: 20px;
          font-size: 14px;
          color: #c4b5fd;
        }
        .progress-summary .weight-now {
          font-size: 20px;
          font-weight: 700;
          color: #e9d5ff;
        }
        .progress-summary .trend {
          font-size: 15px;
          color: #94a3b8;
        }
        .progress-summary .trend strong { color: #e9d5ff; }
        .empty-progress {
          color: #64748b;
          font-size: 15px;
          margin-top: 16px;
          max-width: 320px;
          margin-left: auto;
          margin-right: auto;
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
          margin-top: 20px;
        }
        .logout {
          background: transparent;
          border: 1px solid #444;
          padding: 8px 16px;
          border-radius: 8px;
          color: #ccc;
          cursor: pointer;
        }
        .logout:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }
        .logout-danger {
          border-color: rgba(239, 68, 68, 0.5);
          color: #f87171;
        }
        .logout-danger:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.7);
          color: #fca5a5;
        }
        .modal-danger .modal-hint { color: #fca5a5; }
        .btn-danger {
          background: rgba(239, 68, 68, 0.3) !important;
          border: 1px solid rgba(239, 68, 68, 0.6) !important;
          color: #fca5a5 !important;
        }
        .btn-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.5) !important;
          border-color: #ef4444 !important;
          color: #fff !important;
        }

        .card {
          background: rgba(255, 255, 255, 0.04);
          padding: 40px;
          border-radius: 24px;
          margin-bottom: 40px;
          backdrop-filter: blur(20px);
        }
        .card-accent {
          border-left: 4px solid #9b5cff;
        }
        .section-head {
          margin: 0 0 24px;
          font-size: 20px;
          font-weight: 600;
          color: #e2e8f0;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .center {
          text-align: center;
        }
        .center .section-head { border-bottom-color: rgba(255,255,255,0.06); }
        .trend {
          margin-top: 8px;
          font-size: 18px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
          border: none;
          padding: 14px 24px;
          border-radius: 14px;
          font-weight: 600;
          cursor: pointer;
          font-size: 15px;
          display: inline-flex;
          align-items: center;
        }
        .btn-primary:hover { opacity: 0.95; filter: brightness(1.05); }
        .btn-secondary {
          background: rgba(255,255,255,0.1);
          color: #e9d5ff;
          border: 1px solid rgba(139, 92, 255, 0.5);
          padding: 14px 24px;
          border-radius: 14px;
          font-weight: 600;
          cursor: pointer;
          font-size: 15px;
          display: inline-flex;
          align-items: center;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.15); }
        .btn-weight {
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .btn-sublabel {
          font-size: 11px;
          font-weight: 400;
          opacity: 0.85;
        }

        .kpi-section { margin-bottom: 40px; }
        .kpis-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: stretch;
          background: rgba(255,255,255,0.04);
          border-radius: 16px;
          padding: 20px 16px;
          gap: 0;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .kpi-item {
          flex: 1;
          min-width: 100px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px;
        }
        .kpi-divider {
          width: 1px;
          background: rgba(255,255,255,0.08);
          min-height: 50px;
          align-self: center;
        }
        .kpis-bar .kpi-icon { font-size: 22px; }
        .kpis-bar .kpi-num {
          font-size: 18px;
          font-weight: 700;
          color: #e9d5ff;
        }
        .kpis-bar .kpi-label { font-size: 12px; color: #94a3b8; }
        .kpis-bar .kpi-sub { font-size: 11px; color: #64748b; }

        .chart-section { margin-bottom: 40px; }
        .chart-hint {
          color: #64748b;
          font-size: 13px;
          margin: 4px 0 16px;
        }
        .chart-wrapper {
          max-width: 560px;
          margin: 0 auto;
          width: 100%;
        }
        .chart-svg-wrap {
          width: 100%;
          margin-bottom: 4px;
        }
        .chart-svg {
          width: 100%;
          height: auto;
          aspect-ratio: 560 / 200;
          display: block;
          vertical-align: top;
        }
        .chart-labels {
          width: 100%;
          margin-top: 10px;
          box-sizing: border-box;
        }
        .chart-labels-inner {
          position: relative;
          width: 100%;
          min-height: 44px;
        }
        .chart-label-item {
          position: absolute;
          top: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          min-width: 56px;
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
        .chart-empty {
          color: #64748b;
          font-size: 14px;
          margin: 0;
          padding: 20px;
        }

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
        .workout-expand-btn {
          display: block;
          width: 100%;
          margin-top: 12px;
          padding: 12px 16px;
          background: rgba(139, 92, 255, 0.15);
          border: 1px solid rgba(139, 92, 255, 0.3);
          border-radius: 12px;
          color: #a78bfa;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .workout-expand-btn:hover {
          background: rgba(139, 92, 255, 0.25);
          border-color: rgba(139, 92, 255, 0.5);
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