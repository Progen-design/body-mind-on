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
import { getPlanTypeLabel } from '../lib/planLabels';
import { getHabitById } from '../lib/habits';

const PROGRAM_LABELS = {
  START: { greeting: 'Ahoj', subtitle: 'Každý trénink, každé měření.' },
  ON_CLUB: { greeting: 'Vítej v ON Clubu', subtitle: 'Jsi členem ON Clubu – sleduj návyky, tréninky a svůj progres.' },
  VIP: { greeting: 'Vítej v VIP', subtitle: 'Jsi VIP člen – máš přístup ke všem funkcím včetně habit trackeru.' },
};

const WORKOUT_TYPES = [
  { id: 'silovy', label: 'Silový', emoji: '🏋️' },
  { id: 'kardio', label: 'Kardio', emoji: '🏃' },
  { id: 'beh', label: 'Běh', emoji: '👟' },
  { id: 'kolo', label: 'Kolo', emoji: '🚴' },
  { id: 'chuze', label: 'Chůze', emoji: '🚶' },
  { id: 'plavani', label: 'Plavání', emoji: '🏊' },
  { id: 'strečink', label: 'Strečink', emoji: '🧘' },
  { id: 'joga', label: 'Jóga', emoji: '🪷' },
  { id: 'nordic_walking', label: 'Nordic walking', emoji: '🥢' },
  { id: 'brusleni', label: 'Bruslení', emoji: '⛸️' },
  { id: 'lyzovani', label: 'Lyžování', emoji: '🎿' },
  { id: 'sauna', label: 'Sauna', emoji: '🧖' },
  { id: 'ostatni', label: 'Ostatní', emoji: '✨' },
];

const WORKOUT_DIFFICULTY_OPTIONS = [
  { id: 'easy', label: 'Snadné, zvládl bych více' },
  { id: 'just_right', label: 'Tak akorát' },
  { id: 'hard', label: 'Náročné, ale zvládl jsem to' },
  { id: 'too_hard', label: 'Příliš náročné' },
];

// Odhad kcal/min dle typu (orientační)
const KCAL_PER_MIN_BY_TYPE = {
  silovy: 5,
  kardio: 8,
  beh: 10,
  kolo: 7,
  chuze: 4,
  plavani: 10,
  strečink: 2.5,
  joga: 3,
  nordic_walking: 6,
  brusleni: 8,
  lyzovani: 8,
  sauna: 1.5,
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

// Pondělí daného týdne (Po = první den týdne)
function getMondayOfWeek(d) {
  const date = new Date(d);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
}
function dateStrAddDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return getLocalDateStr(d);
}
/** Vrací YYYY-MM-DD v lokálním čase (ne UTC). */
function getLocalDateStr(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
// Jeden týden: 7 dní od pondělí
function getWeekDays(weekStartStr) {
  const out = [];
  const todayStr = getLocalDateStr(new Date());
  for (let i = 0; i < 7; i++) {
    const dateKey = dateStrAddDays(weekStartStr, i);
    const d = new Date(dateKey + 'T12:00:00');
    out.push({
      dateKey,
      dayNum: d.getDate(),
      isToday: dateKey === todayStr,
    });
  }
  return out;
}
function formatWeekRange(weekStartStr) {
  const start = new Date(weekStartStr + 'T12:00:00');
  const end = new Date(dateStrAddDays(weekStartStr, 6) + 'T12:00:00');
  const fmt = (d) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Události seskupí podle lokálního data (ne UTC), aby se zobrazily ve správném dnu. */
function getEventsByDate(events) {
  const byDate = {};
  (events || []).forEach((ev) => {
    if (!ev.start) return;
    const d = new Date(ev.start);
    if (isNaN(d.getTime())) return;
    const key = getLocalDateStr(d);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(ev);
  });
  return byDate;
}

const WEEKDAY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

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
  const [trainerSchedule, setTrainerSchedule] = useState({ events: [], connected: false });
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [scheduleRefreshAt, setScheduleRefreshAt] = useState(0);
  const [calendarEventForm, setCalendarEventForm] = useState({
    date: '',
    time: '10:00',
    title: 'Trénink',
    userEmails: '',
    durationMin: 60,
  });
  const [calendarEventSubmit, setCalendarEventSubmit] = useState({ loading: false, message: '', checklist: [] });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef(null);
  const [avatarCrop, setAvatarCrop] = useState({ open: false, src: null, file: null, offset: { x: 0, y: 0 }, size: { w: 0, h: 0 }, dragStart: null });
  const avatarCropImageRef = useRef(null);
  const avatarCropContainerRef = useRef(null);
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => {
    const monday = getMondayOfWeek(new Date());
    return getLocalDateStr(monday);
  });
  const [trainerClients, setTrainerClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showFullClientCard, setShowFullClientCard] = useState(false);

  const [workoutForm, setWorkoutForm] = useState({
    workout_date: '',
    workout_type: 'silovy',
    duration_min: 45,
    notes: '',
    perceived_difficulty: '',
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
          habit_summary_7d: data.habit_summary_7d ? { ...data.habit_summary_7d } : null,
          program: data.program || 'START',
          membershipStatus: data.membershipStatus || 'active',
          membershipSince: data.membershipSince || null,
          can_create_calendar_events: data.can_create_calendar_events === true,
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

  // Habit wizard jen pro ON Club a VIP; průvodce (tour) jen pro ON Club a VIP – START to mít nesmí (přidaná hodnota)
  useEffect(() => {
    if (!loading && session && !error && profile) {
      const program = profile.program || 'START';
      const habitWizardSeen = localStorage.getItem('habitEntryWizardSeen');
      const welcomeTourSeen = localStorage.getItem('welcomeTourSeen');
      const timer = setTimeout(() => {
        const hasNoHabits = !profile.user_habits || profile.user_habits.length === 0;
        if ((program === 'ON_CLUB' || program === 'VIP') && !habitWizardSeen && hasNoHabits) {
          setShowHabitEntryWizard(true);
        } else if ((program === 'ON_CLUB' || program === 'VIP') && !welcomeTourSeen) {
          setShowWelcomeTour(true);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, session, error, profile?.program, profile?.user_habits]);

  // Načíst seznam klientů (jen pro trenéra)
  useEffect(() => {
    if (!profile?.can_create_calendar_events || !session?.access_token) return;
    let cancelled = false;
    setLoadingClients(true);
    fetch('/api/trainer/clients', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setTrainerClients(Array.isArray(data.clients) ? data.clients : []); })
      .catch(() => { if (!cancelled) setTrainerClients([]); })
      .finally(() => { if (!cancelled) setLoadingClients(false); });
    return () => { cancelled = true; };
  }, [profile?.can_create_calendar_events, session?.access_token]);

  // Při otevření jiného klienta zobrazit nejdřív souhrn, ne celou kartu
  useEffect(() => {
    setShowFullClientCard(false);
  }, [selectedClient?.id]);

  // Načíst plánované tréninky z kalendáře trenéra (info@) – cca 2 týdny zpět + 90 dní dopředu (pro týdenní zobrazení)
  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    setLoadingSchedule(true);
    const monday = getMondayOfWeek(new Date());
    const mondayStr = monday.toISOString().slice(0, 10);
    const from = dateStrAddDays(mondayStr, -14);
    const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fetch(`${typeof window !== 'undefined' ? '' : ''}/api/trainer-schedule?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTrainerSchedule({ events: data.events || [], connected: data.connected === true });
      })
      .catch(() => { if (!cancelled) setTrainerSchedule((s) => ({ ...s, connected: false })); })
      .finally(() => { if (!cancelled) setLoadingSchedule(false); });
    return () => { cancelled = true; };
  }, [session?.access_token, scheduleRefreshAt]);

  // Výchozí datum ve formuláři „Přidat trénink“ = dnešek (lokální čas, ne server UTC)
  useEffect(() => {
    setCalendarEventForm((prev) => ({ ...prev, date: prev.date || getLocalDateStr(new Date()) }));
  }, []);

  // Toast po propojení kalendáře trenéra (redirect z Google OAuth)
  useEffect(() => {
    if (router.query?.calendar === 'connected') {
      setToast({ message: 'Kalendář trenéra je propojen. Rozvrh tréninků se nyní načítá z info@.', type: 'success' });
      router.replace('/profil', undefined, { shallow: true });
    } else if (router.query?.calendar === 'error') {
      setToast({ message: 'Propojení kalendáře se nepovedlo.', type: 'error' });
      router.replace('/profil', undefined, { shallow: true });
    }
  }, [router.query?.calendar]);

  async function handleCalendarEventSubmit(e) {
    e.preventDefault();
    if (!session?.access_token || calendarEventSubmit.loading) return;
    setCalendarEventSubmit({ loading: true, message: '', checklist: [] });
    try {
      const userEmails = calendarEventForm.userEmails
        ? calendarEventForm.userEmails.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
        : [];
      const res = await fetch('/api/calendar/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          date: calendarEventForm.date,
          time: calendarEventForm.time,
          title: calendarEventForm.title || 'Trénink',
          userEmails,
          durationMin: calendarEventForm.durationMin || 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCalendarEventSubmit({
          loading: false,
          message: data.error || 'Chyba',
          checklist: data.fixChecklist || [],
        });
        return;
      }
      setCalendarEventSubmit({
        loading: false,
        message: data.message || 'Trénink přidán do kalendáře.',
        checklist: data.fixChecklist || [],
      });
      setCalendarEventForm((f) => ({ ...f, date: getLocalDateStr(new Date()), title: 'Trénink', userEmails: '' }));
      setScheduleRefreshAt(Date.now());
    } catch (err) {
      setCalendarEventSubmit({ loading: false, message: err.message || 'Nepodařilo se přidat.', checklist: [] });
    }
  }

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
        setWorkoutForm({ workout_date: getLocalDateStr(new Date()), workout_type: 'silovy', duration_min: 45, notes: '', perceived_difficulty: '' });
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

  function openAvatarCropModal(file) {
    const src = URL.createObjectURL(file);
    setAvatarError('');
    setAvatarCrop({ open: true, src, file, offset: { x: 0, y: 0 }, size: { w: 0, h: 0 }, dragStart: null });
  }

  function closeAvatarCropModal() {
    if (avatarCrop.src) URL.revokeObjectURL(avatarCrop.src);
    setAvatarCrop({ open: false, src: null, file: null, offset: { x: 0, y: 0 }, size: { w: 0, h: 0 }, dragStart: null });
  }

  function onAvatarCropImageLoad() {
    const img = avatarCropImageRef.current;
    if (img && img.naturalWidth) {
      setAvatarCrop((c) => ({ ...c, size: { w: img.naturalWidth, h: img.naturalHeight } }));
    }
  }

  function avatarCropDragStart(e) {
    if (e.button !== 0) return;
    setAvatarCrop((c) => ({ ...c, dragStart: { x: e.clientX - c.offset.x, y: e.clientY - c.offset.y } }));
  }
  function avatarCropDragMove(e) {
    if (avatarCrop.dragStart == null) return;
    setAvatarCrop((c) => ({
      ...c,
      offset: { x: e.clientX - c.dragStart.x, y: e.clientY - c.dragStart.y },
    }));
  }
  function avatarCropDragEnd() {
    setAvatarCrop((c) => ({ ...c, dragStart: null }));
  }

  useEffect(() => {
    if (!avatarCrop.open || !avatarCrop.dragStart) return;
    const onMove = (e) => avatarCropDragMove(e);
    const onUp = () => avatarCropDragEnd();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [avatarCrop.open, avatarCrop.dragStart]);

  function getAvatarCropBlob(callback) {
    const img = avatarCropImageRef.current;
    const { size, offset } = avatarCrop;
    if (!img || !size.w || !size.h) return callback(null);
    const box = 300;
    const cropSize = Math.min(size.w, size.h);
    const centerX = size.w * (0.5 + (offset.x / box) * 0.5);
    const centerY = size.h * (0.5 + (offset.y / box) * 0.5);
    let sx = centerX - cropSize / 2;
    let sy = centerY - cropSize / 2;
    sx = Math.max(0, Math.min(size.w - cropSize, sx));
    sy = Math.max(0, Math.min(size.h - cropSize, sy));
    const out = 400;
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, out, out);
    canvas.toBlob((blob) => callback(blob), 'image/jpeg', 0.88);
  }

  async function confirmAvatarCropAndUpload() {
    getAvatarCropBlob(async (blob) => {
      if (!blob || !session?.user?.id) {
        closeAvatarCropModal();
        return;
      }
      closeAvatarCropModal();
      setAvatarError('');
      setUploadingAvatar(true);
      try {
        const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
        const path = `${session.user.id}/${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
        if (uploadErr) {
          setAvatarError(uploadErr.message || 'Nahrání se nepodařilo.');
          return;
        }
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        const avatarUrl = urlData?.publicUrl || null;
        if (!avatarUrl) {
          setAvatarError('Nepodařilo se získat odkaz na obrázek.');
          return;
        }
        const res = await fetch('/api/profile-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ avatar_url: avatarUrl }),
        });
        const json = await res.json();
        if (!res.ok) {
          setAvatarError(json.error || 'Uložení se nepodařilo.');
          return;
        }
        setProfile((p) => (p?.user ? { ...p, user: { ...p.user, avatar_url: avatarUrl }, _updated: Date.now() } : p));
        setToast({ message: 'Profilový obrázek byl uložen.', type: 'success' });
      } catch (err) {
        setAvatarError(err.message || 'Chyba při nahrávání.');
      } finally {
        setUploadingAvatar(false);
      }
    });
  }

  function handleAvatarUpload(e) {
    const file = e.target?.files?.[0];
    if (!file || !session?.user?.id) return;
    e.target.value = '';
    if (!file.type.startsWith('image/')) {
      setAvatarError('Vyber obrázek (JPEG, PNG, GIF nebo WebP).');
      return;
    }
    openAvatarCropModal(file);
  }

  if (!session && !loading) return null;

  // Všechny parametry se přepočítají při každé změně profile (trénink, váha)
  // Použít _updated timestamp jako závislost, aby se vždy přepočítalo při změně
  const { program, membershipStatus, membershipSince, metrics, workouts, latestMetric, firstMetric, latestWorkout, currentWeight, weightDiff, workoutsThisWeek, totalMinutesThisWeek, estimatedCaloriesThisWeek, totalMinutes, estimatedCaloriesAll, chartWeightData, userName, firstName, lastWeekCount, lastWeekMinutes, workoutTrend, startWeight, goalWeight, heightCm, estimatedKgLostTotal, estimatedCurrentWeight, estimatedCurrentWeightRounded, kgPerWeekFromWeek, weeksToGoal, weekStartFormatted, weekEndFormatted, periodStartFormatted, periodEndFormatted, thisWeekDates, startWeightDate, lastWeightDate, habitAdjustedWeight, hasHabitData, positiveDone, negativeDone, habitCorrectionKg } = useMemo(() => {
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
    const regDate = profile?.user?.created_at ? new Date(profile.user.created_at) : null;
    const regDow = regDate != null ? regDate.getDay() : 1;
    const daysSinceWeekStart = (now.getDay() - regDow + 7) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceWeekStart);
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

    const positiveDone = profile?.habit_summary_7d?.positiveDone ?? 0;
    const negativeDone = profile?.habit_summary_7d?.negativeDone ?? 0;
    const habitCorrectionKg = (negativeDone * 0.05) - (positiveDone * 0.02);
    const habitAdjustedWeight = estimatedCurrentWeightRounded != null
      ? (goalWeight != null && (estimatedCurrentWeightRounded + habitCorrectionKg) < goalWeight
          ? goalWeight
          : Math.round((estimatedCurrentWeightRounded + habitCorrectionKg) * 10) / 10)
      : null;
    const hasHabitData = (profile?.habit_summary_7d != null) && (positiveDone > 0 || negativeDone > 0);

    const program = profile?.program || 'START';
    const membershipStatus = profile?.membershipStatus || 'active';
    const membershipSince = profile?.membershipSince || null;

    return {
      program,
      membershipStatus,
      membershipSince,
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
      firstName: (name || '').trim().split(/\s+/)[0] || name || 'ty',
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
      periodStartFormatted: chartData.length > 0 ? formatShortDate(chartData[0].date) : (registrationMetric?.created_at ? formatShortDate(String(registrationMetric.created_at).split('T')[0]) : formatShortDate(getLocalDateStr(now))),
      periodEndFormatted: formatShortDate(getLocalDateStr(now)),
      thisWeekDates,
      startWeightDate: chartData.length > 0 ? chartData[0].date : (registrationMetric?.created_at ? String(registrationMetric.created_at).split('T')[0] : null),
      lastWeightDate: chartData.length > 0 ? chartData[chartData.length - 1].date : null,
      habitAdjustedWeight,
      hasHabitData,
      positiveDone,
      negativeDone,
      habitCorrectionKg,
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
    profile?.user?.created_at,
    profile?.user?.height_cm,
    profile?.program,
    profile?.habit_summary_7d?.positiveDone,
    profile?.habit_summary_7d?.negativeDone,
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

  // Najít plán platný pro aktuální týden / dnes – jídelníček se mění s časem
  const currentPlan = useMemo(() => {
    if (!profile?.plans || !Array.isArray(profile.plans) || profile.plans.length === 0) {
      return null;
    }
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    // 1) Plány, jejichž interval (valid_from, valid_until) obsahuje dnes
    const containingToday = profile.plans.filter((p) => {
      const from = p.valid_from ? new Date(p.valid_from) : null;
      const until = p.valid_until ? new Date(p.valid_until) : null;
      if (!from || !until) return false;
      return from <= today && until >= today;
    });
    if (containingToday.length > 0) {
      // Preferuj plán s nejpozdějším valid_from (aktuální týden při víc plánech)
      containingToday.sort((a, b) => (b.valid_from || '').localeCompare(a.valid_from || ''));
      return containingToday[0];
    }
    // 2) Jinak plán, který ještě nevypršel (valid_until >= dnes)
    const stillValid = profile.plans.find((p) => p.valid_until && new Date(p.valid_until) >= today);
    if (stillValid) return stillValid;
    // 3) Fallback: nejnovější plán
    return profile.plans[0];
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
        {/* Hlavní cíl plánu úplně nahoře – jen pro klienty, ne pro trenéra */}
        {!profile?.can_create_calendar_events && (currentPlan || program === 'ON_CLUB' || program === 'VIP') && (
          <div className="plan-goal-hero">
            <h2 className="plan-goal-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
            <span className="plan-goal-badge plan-goal-badge-program">
              {program === 'ON_CLUB' ? 'ON Club' : program === 'VIP' ? 'VIP' : getPlanTypeLabel(currentPlan?.plan_type) || 'START'}
            </span>
          </div>
        )}

        <section className="hero">
          <div className="hero-avatar-wrap">
            {profile?.user?.avatar_url ? (
              <img src={profile.user.avatar_url} alt="" className="hero-avatar" />
            ) : (
              <span className="hero-avatar-placeholder" aria-hidden>{firstName?.charAt(0)?.toUpperCase() || '?'}</span>
            )}
            <input
              type="file"
              ref={avatarInputRef}
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hero-avatar-input-hidden"
              onChange={handleAvatarUpload}
            />
            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar} className="hero-avatar-change">
              {uploadingAvatar ? 'Nahrávám…' : 'Změnit obrázek'}
            </button>
            {avatarError && <p className="hero-avatar-error" role="alert">{avatarError}</p>}
          </div>

          {avatarCrop.open && avatarCrop.src && (
            <div className="avatar-crop-overlay" onClick={closeAvatarCropModal}>
              <div className="avatar-crop-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="avatar-crop-title">Uprav obrázek</h3>
                <p className="avatar-crop-hint">Posuň obrázek pro výběr oblasti. Ořízne se na čtverec a zmenší pro nahrání.</p>
                <div
                  className="avatar-crop-box"
                  ref={avatarCropContainerRef}
                  onMouseDown={avatarCropDragStart}
                  onMouseLeave={avatarCropDragEnd}
                >
                  <img
                    ref={avatarCropImageRef}
                    src={avatarCrop.src}
                    alt=""
                    className="avatar-crop-img"
                    style={{
                      objectPosition: `${50 + (avatarCrop.offset.x / 300) * 50}% ${50 + (avatarCrop.offset.y / 300) * 50}%`,
                    }}
                    onLoad={onAvatarCropImageLoad}
                    draggable={false}
                  />
                </div>
                <div className="avatar-crop-actions">
                  <button type="button" className="avatar-crop-btn-cancel" onClick={closeAvatarCropModal}>Zrušit</button>
                  <button type="button" className="avatar-crop-btn-confirm" onClick={confirmAvatarCropAndUpload} disabled={!avatarCrop.size.w}>Oříznout a nahrát</button>
                </div>
              </div>
            </div>
          )}

          <p className="hero-intro">
            {profile?.can_create_calendar_events ? 'Trenér' : (PROGRAM_LABELS[program] || PROGRAM_LABELS.START).greeting}
            {!profile?.can_create_calendar_events && (program === 'ON_CLUB' || program === 'VIP') && (
              <span className="hero-program-badge">{program === 'ON_CLUB' ? 'ON Club' : 'VIP'}</span>
            )}
          </p>
          <h1 className="hero-name">
            Ahoj, <span>{firstName}</span>
          </h1>
          <p className="hero-sub">{profile?.can_create_calendar_events ? 'Přehled klientů a kalendář tréninků.' : (PROGRAM_LABELS[program] || PROGRAM_LABELS.START).subtitle}</p>
          {!loading && !error && !profile?.can_create_calendar_events && (
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
                <span className="hero-stat-value">{(hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeight) != null ? `${(hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeight).toFixed(1)} kg` : '—'}</span>
                <span className="hero-stat-label">{hasHabitData ? 'Odhad (tréninky + návyky)' : 'Odhad z tréninků'}</span>
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
            {/* Membership karta – tier badge (jen pro klienty, trenér ji nepotřebuje) */}
            {!profile?.can_create_calendar_events && (
            <div className={`membership-card membership-card--${(program || 'START').toLowerCase().replace('_', '-')}`}>
              <div className="membership-card-left">
                <span className="membership-icon">
                  {program === 'VIP' ? '👑' : program === 'ON_CLUB' ? '⚡' : '🚀'}
                </span>
                <div>
                  <div className="membership-tier-label">
                    {program === 'ON_CLUB' ? 'Program ON Club' : program === 'VIP' ? 'Program VIP Coaching' : 'Program Start'}
                  </div>
                  <div className="membership-tier-sub">
                    {program === 'VIP' && 'Plný přístup · Osobní coaching · Prémiová podpora'}
                    {program === 'ON_CLUB' && 'Habit tracker · AI plán · Tréninky · Statistiky'}
                    {program !== 'VIP' && program !== 'ON_CLUB' && 'AI plán · Jídelníček · Základní sledování'}
                  </div>
                </div>
              </div>
              <div className="membership-card-right">
                <span className={`membership-status-badge membership-status--${membershipStatus}`}>
                  {membershipStatus === 'active' ? 'Aktivní' : membershipStatus === 'trial' ? 'Zkušební' : membershipStatus === 'cancelled' ? 'Zrušeno' : 'Neaktivní'}
                </span>
                {membershipSince && (
                  <span className="membership-since">
                    od {new Date(membershipSince).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            )}

            {/* Trenér: Moji klienti */}
            {profile?.can_create_calendar_events && (
              <>
              <section className="card trainer-clients-section">
                <h2 className="section-head">Moji klienti</h2>
                {loadingClients ? (
                  <p className="trainer-clients-loading">Načítám seznam klientů…</p>
                ) : trainerClients.length === 0 ? (
                  <p className="trainer-clients-empty">Zatím nemáš žádné klienty v aplikaci. Klienti se objeví po registraci (START).</p>
                ) : (
                  <div className="trainer-clients-table-wrap">
                    <table className="trainer-clients-table">
                      <thead>
                        <tr>
                          <th>Jméno</th>
                          <th>E-mail</th>
                          <th>Program</th>
                          <th>Váha (kg)</th>
                          <th>Cíl (kg)</th>
                          <th>Výška (cm)</th>
                          <th>Registrace</th>
                          <th>Tréninků</th>
                          <th>Poslední trénink</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trainerClients.map((c) => (
                          <tr key={c.id} className="trainer-clients-row" onClick={() => setSelectedClient(c)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelectedClient(c)}>
                            <td className="trainer-clients-name">{c.name || '—'}</td>
                            <td className="trainer-clients-email">{c.email || '—'}</td>
                            <td>{c.program === 'ON_CLUB' ? 'ON Club' : c.program === 'VIP' ? 'VIP' : 'START'}</td>
                            <td>{c.weight_kg != null ? String(c.weight_kg) : '—'}</td>
                            <td>{c.goal_weight_kg != null ? String(c.goal_weight_kg) : '—'}</td>
                            <td>{c.height_cm != null ? String(c.height_cm) : '—'}</td>
                            <td>{c.registered_at ? formatShortDate(String(c.registered_at).slice(0, 10)) : '—'}</td>
                            <td>{c.workout_count ?? 0}</td>
                            <td>{c.last_workout_date ? formatShortDate(c.last_workout_date) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Modal karta klienta */}
              {selectedClient && (
                <div className="trainer-client-modal-overlay" onClick={() => setSelectedClient(null)} role="dialog" aria-modal="true" aria-label="Karta klienta">
                  <div className={`trainer-client-modal${showFullClientCard ? ' trainer-client-modal-full' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className="trainer-client-modal-header">
                      <h3 className="trainer-client-modal-title">{selectedClient.name || 'Klient'}</h3>
                      <div className="trainer-client-modal-header-actions">
                        <button type="button" className="trainer-client-modal-btn-toggle" onClick={() => setShowFullClientCard((v) => !v)}>
                          {showFullClientCard ? 'Zabalit' : 'Zobrazit celou kartu'}
                        </button>
                        <button type="button" className="trainer-client-modal-close" onClick={() => setSelectedClient(null)} aria-label="Zavřít">×</button>
                      </div>
                    </div>
                    <div className="trainer-client-modal-body">
                      <dl className="trainer-client-dl">
                        <dt>E-mail</dt><dd>{selectedClient.email || '—'}</dd>
                        <dt>Program</dt><dd>{selectedClient.program === 'ON_CLUB' ? 'ON Club' : selectedClient.program === 'VIP' ? 'VIP' : 'START'}</dd>
                        <dt>Váha (kg)</dt><dd>{selectedClient.weight_kg != null ? String(selectedClient.weight_kg) : '—'}</dd>
                        <dt>Cílová váha (kg)</dt><dd>{selectedClient.goal_weight_kg != null ? String(selectedClient.goal_weight_kg) : '—'}</dd>
                        <dt>Výška (cm)</dt><dd>{selectedClient.height_cm != null ? String(selectedClient.height_cm) : '—'}</dd>
                        <dt>Registrace</dt><dd>{selectedClient.registered_at ? formatDate(String(selectedClient.registered_at).slice(0, 10)) : '—'}</dd>
                        <dt>Počet tréninků</dt><dd>{selectedClient.workout_count ?? 0}</dd>
                        <dt>Poslední trénink</dt><dd>{selectedClient.last_workout_date ? formatDate(selectedClient.last_workout_date) : '—'}</dd>
                      </dl>
                      {(selectedClient.habit_summary_7d || (selectedClient.user_habits && selectedClient.user_habits.length > 0)) && (
                        <div className="trainer-client-modal-section">
                          <h4 className="trainer-client-modal-section-title">Denní výzvy / návyky</h4>
                          <p className="trainer-client-modal-habits-intro">
                            {selectedClient.user_habits?.length > 0 ? `Sleduje ${selectedClient.user_habits.length} návyk${selectedClient.user_habits.length === 1 ? '' : selectedClient.user_habits.length >= 2 && selectedClient.user_habits.length <= 4 ? 'y' : 'ů'}.` : 'Zatím nemá vybrané návyky.'}
                          </p>
                          {selectedClient.habit_summary_7d && (selectedClient.habit_summary_7d.positiveDone > 0 || selectedClient.habit_summary_7d.negativeDone > 0) && (
                            <div className="trainer-client-modal-habits-summary">
                              <span className="trainer-client-habit-positive"><strong>{selectedClient.habit_summary_7d.positiveDone ?? 0}</strong>× zdravých návyků tento týden</span>
                              <span className="trainer-client-habit-negative"><strong>{selectedClient.habit_summary_7d.negativeDone ?? 0}</strong>× zlozvyků (čím méně, tím lépe)</span>
                            </div>
                          )}
                        </div>
                      )}
                      {selectedClient.last_workout && !showFullClientCard && (
                        <div className="trainer-client-modal-section">
                          <h4 className="trainer-client-modal-section-title">Detail posledního tréninku</h4>
                          <dl className="trainer-client-dl trainer-client-dl-compact">
                            <dt>Datum</dt><dd>{formatDate(selectedClient.last_workout.workout_date)}</dd>
                            <dt>Typ</dt><dd>{selectedClient.last_workout.workout_name || selectedClient.last_workout.workout_type || '—'}</dd>
                            {selectedClient.last_workout.duration_min != null && (
                              <><dt>Délka</dt><dd>{selectedClient.last_workout.duration_min} min</dd></>
                            )}
                            {selectedClient.last_workout.notes && (
                              <><dt>Poznámka</dt><dd>{selectedClient.last_workout.notes}</dd></>
                            )}
                          </dl>
                        </div>
                      )}
                      {showFullClientCard && (
                        <>
                          <div className="trainer-client-modal-section">
                            <h4 className="trainer-client-modal-section-title">Sledované návyky – rozpis</h4>
                            {selectedClient.user_habits?.length > 0 ? (
                              <ul className="trainer-client-habits-list">
                                {(selectedClient.user_habits || []).map((h) => {
                                  const habit = getHabitById(h.habit_id);
                                  return (
                                    <li key={h.habit_id} className="trainer-client-habit-item">
                                      <span className="trainer-client-habit-emoji">{habit?.emoji || '•'}</span>
                                      <span>{habit?.label || h.habit_id}</span>
                                      {selectedClient.habit_summary_7d?.byHabit?.[h.habit_id] != null && (
                                        <span className="trainer-client-habit-count"> tento týden {selectedClient.habit_summary_7d.byHabit[h.habit_id]}×</span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="trainer-client-modal-habits-intro">Zatím nemá vybrané návyky.</p>
                            )}
                          </div>
                          {(selectedClient.last_workouts?.length > 0) && (
                            <div className="trainer-client-modal-section">
                              <h4 className="trainer-client-modal-section-title">Historie tréninků (posledních {selectedClient.last_workouts.length})</h4>
                              <div className="trainer-client-workouts-table-wrap">
                                <table className="trainer-client-workouts-table">
                                  <thead>
                                    <tr>
                                      <th>Datum</th>
                                      <th>Typ</th>
                                      <th>Délka</th>
                                      <th>Poznámka</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedClient.last_workouts.map((w, i) => (
                                      <tr key={`${w.workout_date}-${i}`}>
                                        <td>{formatDate(w.workout_date)}</td>
                                        <td>{w.workout_name || w.workout_type || '—'}</td>
                                        <td>{w.duration_min != null ? `${w.duration_min} min` : '—'}</td>
                                        <td className="trainer-client-workout-notes">{w.notes || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </>
            )}

            {/* Jasná první akce – pro uživatele bez tréninku (jen klienti) */}
            {!profile?.can_create_calendar_events && workouts.length === 0 && currentPlan && (
              <div className="first-action-banner">
                <p>
                  <strong>Tvůj plán je připraven.</strong>{' '}
                  V plánu níže máš jídelníček a detailní tréninkový návod (rozcvička, cviky, progrese).{' '}
                  {program === 'ON_CLUB' && 'Jsi v programu ON Club – zapiš první trénink, sleduj denní návyky nebo se podívej na dnešní jídlo.'}
                  {program === 'VIP' && 'Jsi v programu VIP – zapiš první trénink, sleduj denní návyky nebo se podívej na dnešní jídlo.'}
                  {program !== 'ON_CLUB' && program !== 'VIP' && 'První krok: zapiš svůj první trénink nebo se podívej na dnešní jídlo v plánu níže.'}
                </p>
              </div>
            )}

            {/* Tvé milníky (jen pro klienty) */}
            {!profile?.can_create_calendar_events && (
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
            )}

            {/* Mindset na tento týden (jen klienti) */}
            {!profile?.can_create_calendar_events && mindsetTipFromPlan && (
              <div className="mindset-block">
                <div className="mindset-header">
                  <span className="mindset-icon">🧠</span>
                  <h3 className="mindset-block-title">Mindset na tento týden</h3>
                </div>
                <div
                  className="mindset-content"
                  dangerouslySetInnerHTML={{ __html: mindsetTipFromPlan }}
                />
              </div>
            )}

            {!profile?.can_create_calendar_events && (
            <>
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

            {/* RYCHLÉ AKCE – výrazný pruh (jen klienti) */}
            <section className="actions-block">
              <h2 className="actions-title">Co chceš zapsat?</h2>
              <div className="action-buttons">
                <button type="button" onClick={() => { setShowWorkoutModal(true); setWorkoutError(''); setWorkoutForm((f) => ({ ...f, workout_date: getLocalDateStr(new Date()) })); }} className="btn-primary">
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
            </>
            )}

            {/* Plánované tréninky – z kalendáře trenéra (info@) */}
            <section className="card trainer-schedule-section">
              <h2 className="section-head">{profile?.can_create_calendar_events ? 'Můj kalendář tréninků' : 'Kdy mám trénink?'}</h2>
              <p className="trainer-schedule-lead">
                {profile?.can_create_calendar_events
                  ? 'Tvůj rozvrh z Google Kalendáře. V každé události vidíš přiřazené klienty (účastníky). Přepínání týdnů šipkami ‹ ›.'
                  : 'Rozvrh plánovaných tréninků z kalendáře trenéra. Zdroj: info@ (Google Kalendář). Zobrazuje se vždy jeden týden (Po–Ne); v každém dnu jsou události přiřazené tobě (čas a název). Přepínání týdnů šipkami ‹ ›.'}
              </p>
              <p className="trainer-schedule-actions">
                <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer" className="trainer-calendar-link">
                  Otevřít Google Kalendář (přidat / upravit tréninky)
                </a>
              </p>
              {profile?.can_create_calendar_events && trainerSchedule.connected && (
                <details className="trainer-schedule-add-form-wrap" open={calendarEventSubmit.message ? true : undefined}>
                  <summary className="trainer-schedule-add-form-summary">Přidat plánovaný trénink přímo z webu</summary>
                  <form onSubmit={handleCalendarEventSubmit} className="trainer-schedule-add-form">
                    <div className="trainer-schedule-add-form-row">
                      <label className="trainer-schedule-add-label">
                        Datum <input type="date" value={calendarEventForm.date} onChange={(e) => setCalendarEventForm((f) => ({ ...f, date: e.target.value }))} required className="trainer-schedule-add-input" />
                      </label>
                      <label className="trainer-schedule-add-label">
                        Čas <input type="time" value={calendarEventForm.time} onChange={(e) => setCalendarEventForm((f) => ({ ...f, time: e.target.value }))} required className="trainer-schedule-add-input" />
                      </label>
                      <label className="trainer-schedule-add-label">
                        Délka (min) <input type="number" min={15} max={480} value={calendarEventForm.durationMin} onChange={(e) => setCalendarEventForm((f) => ({ ...f, durationMin: Number(e.target.value) || 60 }))} className="trainer-schedule-add-input" style={{ width: 72 }} />
                      </label>
                    </div>
                    <label className="trainer-schedule-add-label">
                      Název <input type="text" value={calendarEventForm.title} onChange={(e) => setCalendarEventForm((f) => ({ ...f, title: e.target.value }))} placeholder="Trénink" className="trainer-schedule-add-input trainer-schedule-add-title" />
                    </label>
                    <label className="trainer-schedule-add-label">
                      Přiřadit klientům
                    </label>
                    {trainerClients.length > 0 && (
                      <div className="trainer-schedule-add-clients-wrap">
                        <select
                          className="trainer-schedule-add-select"
                          value=""
                          onChange={(e) => {
                            const email = e.target.value;
                            if (!email) return;
                            setCalendarEventForm((f) => {
                              const current = (f.userEmails || '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
                              if (current.includes(email)) return f;
                              return { ...f, userEmails: [...current, email].join(', ') };
                            });
                            e.target.value = '';
                          }}
                          aria-label="Vybrat klienta"
                        >
                          <option value="">— Vybrat klienta (jméno, e-mail) —</option>
                          {trainerClients.map((c) => (
                            <option key={c.id} value={c.email || ''}>{c.name || '—'} ({c.email})</option>
                          ))}
                        </select>
                        <span className="trainer-schedule-add-select-hint">Vyber ze seznamu nebo doplň e-maily níže.</span>
                      </div>
                    )}
                    <label className="trainer-schedule-add-label">
                      E-maily (můžeš doplnit ručně, čárka nebo středník)
                      <textarea value={calendarEventForm.userEmails} onChange={(e) => setCalendarEventForm((f) => ({ ...f, userEmails: e.target.value }))} placeholder="jan@example.cz, eva@example.cz" rows={2} className="trainer-schedule-add-textarea" />
                    </label>
                    <button type="submit" disabled={calendarEventSubmit.loading} className="trainer-schedule-add-submit">
                      {calendarEventSubmit.loading ? 'Ukládám…' : 'Přidat trénink do kalendáře'}
                    </button>
                    {calendarEventSubmit.message && (
                      <div className="trainer-schedule-add-feedback">
                        <p className={`trainer-schedule-add-message ${calendarEventSubmit.message.startsWith('Trénink') && !calendarEventSubmit.message.includes('nepodařilo') ? 'success' : 'error'}`}>{calendarEventSubmit.message}</p>
                        {calendarEventSubmit.checklist?.length > 0 && (
                          <div className="trainer-schedule-add-checklist">
                            <strong>Postup opravy:</strong>
                            <ol>
                              {calendarEventSubmit.checklist.map((item, i) => (
                                <li key={i}>{item.replace(/^\d+\.\s*/, '')}</li>
                              ))}
                            </ol>
                            <p className="trainer-schedule-add-doc">Podrobný návod: <code>docs/KALENDAR_TRENER_NASTAVENI.md</code> v repozitáři.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </form>
                </details>
              )}
              {loadingSchedule ? (
                <p className="trainer-schedule-loading">Načítám rozvrh…</p>
              ) : !trainerSchedule.connected ? (
                <p className="trainer-schedule-disconnected">Rozvrh zatím není propojen. Trenér může propojit kalendář (info@) v nastavení.</p>
              ) : (() => {
                const eventsByDate = getEventsByDate(trainerSchedule.events);
                return (
                <>
                  <div className="trainer-calendar-wrap">
                    <div className="trainer-calendar-header">
                      <button
                        type="button"
                        className="trainer-calendar-nav"
                        onClick={() => setCalendarWeekStart((s) => dateStrAddDays(s, -7))}
                        aria-label="Předchozí týden"
                      >
                        ‹
                      </button>
                      <span className="trainer-calendar-title">{formatWeekRange(calendarWeekStart)}</span>
                      <button
                        type="button"
                        className="trainer-calendar-nav"
                        onClick={() => setCalendarWeekStart((s) => dateStrAddDays(s, 7))}
                        aria-label="Následující týden"
                      >
                        ›
                      </button>
                    </div>
                    <div className="trainer-calendar-grid trainer-calendar-grid-week">
                      {WEEKDAY_LABELS.map((label) => (
                        <div key={label} className="trainer-calendar-weekday">{label}</div>
                      ))}
                      {getWeekDays(calendarWeekStart).map((day) => {
                        const eventsForDay = eventsByDate[day.dateKey] || [];
                        return (
                          <div
                            key={day.dateKey}
                            className={`trainer-calendar-day ${day.isToday ? 'trainer-calendar-day-today' : ''}`}
                          >
                            <span className="trainer-calendar-day-num">{day.dayNum}{day.isToday ? ' DNES' : ''}</span>
                            <div className="trainer-calendar-day-events">
                              {eventsForDay.slice(0, 5).map((ev) => {
                                const timeStr = ev.start && ev.start.length > 10 ? new Date(ev.start).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : null;
                                const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
                                const title = [ev.summary, attendees.length ? `Účastníci: ${attendees.join(', ')}` : ''].filter(Boolean).join('\n');
                                const attendeeEmailsLower = attendees.map((e) => String(e).toLowerCase());
                                const clientFromEvent = profile?.can_create_calendar_events && trainerClients?.length > 0 && attendeeEmailsLower.length > 0
                                  ? trainerClients.find((c) => attendeeEmailsLower.includes((c.email || '').toLowerCase()))
                                  : null;
                                const openClientCard = clientFromEvent ? () => setSelectedClient(clientFromEvent) : undefined;
                                return (
                                  <div
                                    key={ev.id || ev.start + ev.summary}
                                    className={`trainer-calendar-event${ev.unconfirmed ? ' trainer-calendar-event-unconfirmed' : ''}${ev.confirmed ? ' trainer-calendar-event-confirmed' : ''}${openClientCard ? ' trainer-calendar-event-clickable' : ''}`}
                                    title={title}
                                    onClick={openClientCard}
                                    role={openClientCard ? 'button' : undefined}
                                    tabIndex={openClientCard ? 0 : undefined}
                                    onKeyDown={openClientCard ? (e) => e.key === 'Enter' && openClientCard() : undefined}
                                  >
                                    {timeStr && <span className="trainer-calendar-event-time">{timeStr}</span>}
                                    <span className="trainer-calendar-event-summary">{ev.summary}</span>
                                    {profile?.can_create_calendar_events && attendees.length > 0 && (
                                      <span className="trainer-calendar-event-attendees">{attendees.join(', ')}</span>
                                    )}
                                  </div>
                                );
                              })}
                              {eventsForDay.length > 5 && <span className="trainer-calendar-event-more">+{eventsForDay.length - 5}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {trainerSchedule.events.length === 0 && (
                    <p className="trainer-schedule-empty">V příštích 90 dnech zatím nejsou v kalendáři žádné události. Přidej tréninky v Google Kalendáři nebo v Admin → Přidat trénink.</p>
                  )}
                  {trainerSchedule.events.length > 0 && (
                    <details className="trainer-schedule-list-details">
                      <summary className="trainer-schedule-list-summary">Seznam událostí (text)</summary>
                      <ul className="trainer-schedule-list">
                        {trainerSchedule.events.map((ev) => {
                          const start = ev.start ? new Date(ev.start) : null;
                          const dateStr = start && !isNaN(start.getTime()) ? formatShortDate(ev.start.slice(0, 10)) : ev.start?.slice(0, 10) || '—';
                          const timeStr = ev.start && ev.start.length > 10 ? new Date(ev.start).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : null;
                          const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
                          return (
                            <li key={ev.id || ev.start + ev.summary} className="trainer-schedule-item">
                              <span className="trainer-schedule-date">{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>
                              <span className="trainer-schedule-summary">{ev.summary}</span>
                              {profile?.can_create_calendar_events && attendees.length > 0 && (
                                <span className="trainer-schedule-item-attendees"> → {attendees.join(', ')}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </>
              );
              })()}
            </section>

            {/* Souhrn návyků tento týden – propojení s profilem (trenér nepotřebuje denní návyky) */}
            {!profile?.can_create_calendar_events && (program === 'ON_CLUB' || program === 'VIP') && profile?.user_habits?.length > 0 && (
              <div className="habit-summary-card">
                <h3 className="habit-summary-title">Návyky tento týden</h3>
                <div className="habit-summary-row">
                  <span className="habit-summary-item habit-summary-positive">
                    <strong>{profile?.habit_summary_7d?.positiveDone ?? 0}</strong> zdravých návyků splněno
                  </span>
                  <span className="habit-summary-item habit-summary-negative">
                    <strong>{profile?.habit_summary_7d?.negativeDone ?? 0}</strong> zlozvyků (uděláno) – čím méně, tím lépe
                  </span>
                </div>
                <p className="habit-summary-note">Odhad váhy v profilu vychází z tréninků. Na výsledky má vliv i strava a to, jak plníš zdravé návyky a vyhýbáš se zlozvykům.</p>
              </div>
            )}

            {/* Denní návyky (jen pro klienty, trenér nepotřebuje) */}
            {!profile?.can_create_calendar_events && (
            <HabitTracker
              session={session}
              userHabits={profile?.user_habits}
              onToast={(t) => setToast({ message: t.message, type: t.type })}
              onHabitSaved={() => refetchProfile(session?.access_token)}
            />
            )}

            {/* TVŮJ PROGRES – nahoře, nejdůležitější (jen klienti) */}
            {!profile?.can_create_calendar_events && (
            <section className="card card-accent center progress-section">
              <h2 className="section-head">Tvůj progres</h2>
              <p className="progress-lead">Hodnoty vycházejí z <strong>zapsaných tréninků</strong> a z tvého nastavení (výchozí váha, cíl, výška). Ruční váha do výpočtu nezasahuje. Odhad váhy dále zohledňuje <strong>denní návyky</strong> (zdravé i zlozvyky) z tohoto týdne – čím víc zdravých a míň zlozvyků, tím lépe pro odhad.</p>
              <p className="progress-period-hint">Tréninky: ze <strong>všech</strong> zapsaných od začátku. Návyky: z vyplněných polí v „Denní návyky“ za aktuální týden. Spálené kcal a odhad váhy níže jsou celkové a navazují na sebe.</p>

              <p className="progress-dates">Období od začátku: <strong>{periodStartFormatted}</strong> – <strong>{periodEndFormatted}</strong></p>
              <div className="progress-activity">
                <div className="progress-activity-main">
                  <span className="progress-big-num">{workouts?.length ?? 0}</span>
                  <span className="progress-big-label">celkem tréninků</span>
                </div>
                <div className="progress-activity-main">
                  <span className="progress-big-num">{totalMinutes ?? 0}</span>
                  <span className="progress-big-label">celkem minut v pohybu</span>
                </div>
                <div className="progress-activity-main">
                  <span className="progress-big-num">~{Math.round(estimatedCaloriesAll ?? 0)}</span>
                  <span className="progress-big-label">celkem kcal (odhad)</span>
                </div>
              </div>
              {(workoutsThisWeek?.length ?? 0) > 0 && (
                <p className="progress-dates-detail">Tento týden ({weekStartFormatted} – {weekEndFormatted}): {workoutsThisWeek?.length ?? 0} tréninků, {totalMinutesThisWeek ?? 0} min. Dny s tréninkem: {thisWeekDates?.join(', ') || '—'}</p>
              )}
              {workouts.length === 0 && (
                <p className="progress-empty-hint">Zatím nemáš zapsané tréninky. Po přidání tréninků („Zapsat trénink“) se zde objeví odhad spálených kcal a vliv na váhu.</p>
              )}
              {workouts.length > 0 && (workoutsThisWeek?.length ?? 0) === 0 && (
                <p className="progress-total-hint">V tomto týdnu zatím žádný trénink. Celkem máš <strong>{workouts.length}</strong> tréninků, <strong>{totalMinutes ?? 0}</strong> minut – odhad váhy níže vychází z těchto dat.</p>
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
                      <>
                        <p className="progress-calc-line">
                          Odhadovaná váha z tréninků: <strong>{estimatedCurrentWeightRounded} kg</strong>
                          {startWeight != null && ` (výchozí ${startWeight} kg)`}.
                        </p>
                        {hasHabitData && habitAdjustedWeight != null && (
                          <p className="progress-calc-line progress-habit-line">
                            S ohledem na návyky tohoto týdne ({positiveDone}× zdravé, {negativeDone}× zlozvyky): <strong>{habitAdjustedWeight} kg</strong>. Zdravé návyky odhad zlepšují, zlozvyky zhoršují.
                          </p>
                        )}
                      </>
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
                          weight={hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : (estimatedCurrentWeightRounded ?? startWeight)}
                          height={heightCm}
                          size={130}
                          variant="now"
                          label={hasHabitData ? 'Odhad (tréninky + návyky)' : 'Odhad z tréninků'}
                          weightDiff={estimatedCurrentWeight != null && startWeight != null ? ((hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeightRounded) - startWeight).toFixed(1) : null}
                        />
                        <span className="figure-weight">{(hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeightRounded) != null ? `${(hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeightRounded)} kg` : '—'}</span>
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
            )}

            {/* MŮJ PLÁN (jen klienti) */}
            {!profile?.can_create_calendar_events && currentPlan && <PlanViewer plan={currentPlan} userName={userName} hideHero />}

            {/* Historie tréninků (jen klienti) */}
            {!profile?.can_create_calendar_events && (
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
            )}

            {/* KPI – horizontální pruh (jen klienti) */}
            {!profile?.can_create_calendar_events && (
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
                  <span className="kpi-num">{(hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeightRounded) != null ? `${(hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeightRounded)} kg` : '—'}</span>
                  <span className="kpi-label">{hasHabitData ? 'odhad (tréninky + návyky)' : 'odhad z tréninků'}</span>
                </div>
              </div>
            </section>
            )}

            {/* GRAF VÁHY (jen klienti) */}
            {!profile?.can_create_calendar_events && (
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
                    <label>Jak náročné to pro tebe bylo?</label>
                    <div className="workout-difficulty-options">
                      {WORKOUT_DIFFICULTY_OPTIONS.map((opt) => (
                        <label key={opt.id} className="workout-difficulty-option">
                          <input
                            type="radio"
                            name="perceived_difficulty"
                            value={opt.id}
                            checked={(workoutForm.perceived_difficulty || '') === opt.id}
                            onChange={() => setWorkoutForm((f) => ({ ...f, perceived_difficulty: opt.id }))}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
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
        .hero-avatar-wrap {
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .hero-avatar, .hero-avatar-placeholder {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(148, 163, 184, 0.3);
        }
        .hero-avatar-placeholder {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #3b3b5c, #2d2d44);
          color: #94a3b8;
          font-size: 28px;
          font-weight: 600;
        }
        .hero-avatar-input-hidden { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
        .hero-avatar-change {
          font-size: 13px;
          color: #94a3b8;
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
        }
        .hero-avatar-change:hover:not(:disabled) { color: #e2e8f0; }
        .hero-avatar-change:disabled { opacity: 0.7; cursor: wait; }
        .hero-avatar-error { margin: 0; font-size: 13px; color: #fca5a5; }
        .avatar-crop-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center;
          z-index: 9999; padding: 20px; box-sizing: border-box;
        }
        .avatar-crop-modal {
          background: #1e1e2e; border: 1px solid #334155; border-radius: 16px; padding: 24px; max-width: 360px; width: 100%;
        }
        .avatar-crop-title { margin: 0 0 8px; font-size: 1.25rem; font-weight: 600; color: #f1f5f9; }
        .avatar-crop-hint { margin: 0 0 20px; font-size: 13px; color: #94a3b8; line-height: 1.5; }
        .avatar-crop-box {
          width: 300px; height: 300px; border-radius: 50%; overflow: hidden; margin: 0 auto 20px;
          background: #0f0f0f; cursor: move; position: relative; flex-shrink: 0;
        }
        .avatar-crop-img {
          width: 100%; height: 100%; object-fit: cover; display: block; user-select: none; pointer-events: none;
        }
        .avatar-crop-actions { display: flex; gap: 12px; justify-content: flex-end; }
        .avatar-crop-btn-cancel { padding: 10px 20px; border-radius: 10px; border: 1px solid #475569; background: transparent; color: #94a3b8; font-size: 14px; cursor: pointer; }
        .avatar-crop-btn-cancel:hover { background: #1e293b; color: #e2e8f0; }
        .avatar-crop-btn-confirm { padding: 10px 20px; border-radius: 10px; border: none; background: #0ea5e9; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
        .avatar-crop-btn-confirm:hover:not(:disabled) { background: #0284c7; }
        .avatar-crop-btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
        .hero-intro {
          margin: 0 0 6px;
          font-size: 18px;
          font-weight: 600;
          color: #94a3b8;
          letter-spacing: -0.01em;
        }
        .hero-name {
          margin: 0 0 4px;
          font-size: 36px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .hero-name > span {
          background: linear-gradient(90deg, #9b5cff, #00cfff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-program-badge {
          display: inline-block;
          margin-left: 10px;
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
          margin: 0;
          font-size: 16px;
          line-height: 1.4;
        }

        /* ── Membership karta ─────────────────────────────────── */
        .membership-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          padding: 16px 22px;
          border-radius: 16px;
          border: 1px solid;
          flex-wrap: wrap;
        }
        .membership-card--start {
          background: linear-gradient(135deg, rgba(100,116,139,0.12), rgba(71,85,105,0.08));
          border-color: rgba(100,116,139,0.35);
        }
        .membership-card--on-club {
          background: linear-gradient(135deg, rgba(109,40,217,0.18), rgba(59,130,246,0.10));
          border-color: rgba(139,92,255,0.45);
          box-shadow: 0 4px 20px rgba(109,40,217,0.12);
        }
        .membership-card--vip {
          background: linear-gradient(135deg, rgba(180,130,20,0.18), rgba(234,179,8,0.10));
          border-color: rgba(234,179,8,0.45);
          box-shadow: 0 4px 20px rgba(180,130,20,0.18);
        }
        .membership-card-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .membership-icon {
          font-size: 28px;
          line-height: 1;
          flex-shrink: 0;
        }
        .membership-tier-label {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .membership-card--start .membership-tier-label { color: #94a3b8; }
        .membership-card--on-club .membership-tier-label { color: #c4b5fd; }
        .membership-card--vip .membership-tier-label { color: #fde68a; }
        .membership-tier-sub {
          font-size: 13px;
          color: #64748b;
          margin-top: 2px;
        }
        .membership-card--on-club .membership-tier-sub { color: #a78bfa; }
        .membership-card--vip .membership-tier-sub { color: #ca8a04; }
        .membership-card-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .membership-status-badge {
          font-size: 12px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .membership-status--active {
          background: rgba(34,197,94,0.15);
          color: #4ade80;
          border: 1px solid rgba(34,197,94,0.3);
        }
        .membership-status--trial {
          background: rgba(234,179,8,0.15);
          color: #fbbf24;
          border: 1px solid rgba(234,179,8,0.3);
        }
        .membership-status--cancelled, .membership-status--expired {
          background: rgba(239,68,68,0.12);
          color: #f87171;
          border: 1px solid rgba(239,68,68,0.25);
        }
        .membership-since {
          font-size: 12px;
          color: #64748b;
        }
        /* ───────────────────────────────────────────────────────── */

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
          padding: 28px 28px 24px;
          background: linear-gradient(135deg, rgba(109, 40, 217, 0.18) 0%, rgba(139, 92, 255, 0.10) 50%, rgba(59, 130, 246, 0.10) 100%);
          border-radius: 20px;
          border: 1px solid rgba(139, 92, 255, 0.35);
          box-shadow: 0 8px 32px rgba(109, 40, 217, 0.15), inset 0 1px 0 rgba(255,255,255,0.06);
          position: relative;
          overflow: hidden;
        }
        .mindset-block::before {
          content: '';
          position: absolute;
          top: -60px;
          right: -60px;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(139, 92, 255, 0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .mindset-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }
        .mindset-icon {
          font-size: 26px;
          line-height: 1;
          filter: drop-shadow(0 0 8px rgba(139, 92, 255, 0.6));
        }
        .mindset-block-title {
          margin: 0;
          font-size: 19px;
          font-weight: 700;
          color: #e9d5ff;
          letter-spacing: -0.01em;
        }
        .mindset-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mindset-content p {
          margin: 0;
          color: #d8b4fe;
          line-height: 1.65;
          font-size: 15px;
          padding: 12px 16px;
          background: rgba(255,255,255,0.04);
          border-radius: 12px;
          border-left: 3px solid rgba(139, 92, 255, 0.5);
        }
        .mindset-content p b {
          color: #f3e8ff;
          display: block;
          margin-bottom: 4px;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
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
        .trainer-schedule-section { margin-bottom: 32px; }
        .trainer-schedule-actions { margin: 0 0 16px; }
        .trainer-calendar-link {
          display: inline-block;
          padding: 10px 18px;
          background: rgba(66, 133, 244, 0.2);
          border: 1px solid rgba(66, 133, 244, 0.5);
          border-radius: 10px;
          color: #93c5fd;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
        }
        .trainer-calendar-link:hover { background: rgba(66, 133, 244, 0.35); color: #bfdbfe; }
        .trainer-schedule-add-form-wrap { margin: 16px 0; border: 1px solid rgba(148,163,184,0.25); border-radius: 12px; background: rgba(30,41,59,0.4); overflow: hidden; }
        .trainer-schedule-add-form-summary { padding: 12px 16px; cursor: pointer; font-weight: 600; color: #c4b5fd; font-size: 14px; list-style: none; }
        .trainer-schedule-add-form-summary::-webkit-details-marker { display: none; }
        .trainer-schedule-add-form { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; }
        .trainer-schedule-add-form-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
        .trainer-schedule-add-label { display: block; font-size: 13px; color: #94a3b8; }
        .trainer-schedule-add-label .trainer-schedule-add-input { margin-left: 6px; padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.3); background: rgba(15,23,42,0.8); color: #e2e8f0; }
        .trainer-schedule-add-title { min-width: 200px; }
        .trainer-schedule-add-clients-wrap { margin-bottom: 12px; }
        .trainer-schedule-add-select {
          display: block; width: 100%; max-width: 420px; margin-top: 4px; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.3); background: rgba(15,23,42,0.8); color: #e2e8f0; font-size: 14px;
        }
        .trainer-schedule-add-select:focus { outline: none; border-color: #a78bfa; }
        .trainer-schedule-add-select-hint { display: block; font-size: 12px; color: #64748b; margin-top: 4px; }
        .trainer-schedule-add-textarea { display: block; margin-top: 4px; width: 100%; max-width: 400px; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.3); background: rgba(15,23,42,0.8); color: #e2e8f0; font-size: 14px; resize: vertical; }
        .trainer-schedule-add-submit { align-self: flex-start; padding: 10px 20px; border-radius: 10px; background: #7c3aed; color: #fff; font-weight: 600; border: none; cursor: pointer; }
        .trainer-schedule-add-submit:hover:not(:disabled) { background: #6d28d9; }
        .trainer-schedule-add-submit:disabled { opacity: 0.7; cursor: wait; }
        .trainer-schedule-add-feedback { margin-top: 8px; }
        .trainer-schedule-add-message { font-size: 14px; margin: 4px 0 0; }
        .trainer-schedule-add-message.success { color: #86efac; }
        .trainer-schedule-add-message.error { color: #fca5a5; }
        .trainer-schedule-add-checklist { margin-top: 12px; padding: 12px; background: rgba(30,41,59,0.5); border-radius: 8px; font-size: 13px; color: #94a3b8; }
        .trainer-schedule-add-checklist strong { color: #e2e8f0; }
        .trainer-schedule-add-checklist ol { margin: 8px 0 0; padding-left: 20px; }
        .trainer-schedule-add-checklist li { margin: 4px 0; }
        .trainer-schedule-add-doc { margin: 10px 0 0; font-size: 12px; color: #64748b; }
        .trainer-schedule-add-doc code { font-size: 11px; }
        .trainer-schedule-lead {
          font-size: 14px;
          color: #94a3b8;
          margin: -8px 0 16px;
        }
        .trainer-schedule-loading,
        .trainer-schedule-disconnected,
        .trainer-schedule-empty {
          font-size: 14px;
          color: #64748b;
          margin: 0;
        }
        .trainer-schedule-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .trainer-schedule-item {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(148,163,184,0.2);
          font-size: 15px;
        }
        .trainer-schedule-item:last-child { border-bottom: none; }
        .trainer-schedule-date {
          color: #94a3b8;
          font-size: 14px;
          min-width: 140px;
        }
        .trainer-schedule-summary { font-weight: 500; }
        .trainer-schedule-item-attendees { font-size: 12px; color: #94a3b8; margin-left: 6px; }
        .trainer-calendar-wrap { margin-top: 8px; }
        .trainer-calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding: 0 4px;
        }
        .trainer-calendar-title {
          font-size: 18px;
          font-weight: 600;
          color: #e2e8f0;
        }
        .trainer-calendar-nav {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(148,163,184,0.3);
          border-radius: 10px;
          color: #94a3b8;
          font-size: 20px;
          cursor: pointer;
          line-height: 1;
        }
        .trainer-calendar-nav:hover { background: rgba(255,255,255,0.1); color: #c4b5fd; }
        .trainer-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 1px;
          background: rgba(148,163,184,0.2);
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(148,163,184,0.2);
        }
        .trainer-calendar-weekday {
          padding: 10px 6px;
          text-align: center;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          background: rgba(30,41,59,0.6);
        }
        .trainer-calendar-day {
          min-height: 72px;
          padding: 6px;
          background: rgba(30,41,59,0.5);
          display: flex;
          flex-direction: column;
        }
        .trainer-calendar-day-other { opacity: 0.5; }
        .trainer-calendar-day-today { background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.4); }
        .trainer-calendar-grid-week .trainer-calendar-day { min-height: 96px; }
        .trainer-calendar-day-num {
          font-size: 13px;
          color: #94a3b8;
          margin-bottom: 4px;
        }
        .trainer-calendar-day-events {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .trainer-calendar-event {
          font-size: 11px;
          padding: 2px 6px;
          background: rgba(124,58,237,0.35);
          border-radius: 6px;
          color: #e9d5ff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .trainer-calendar-event-unconfirmed {
          background: rgba(202, 138, 4, 0.35);
          border-left: 3px solid #eab308;
        }
        .trainer-calendar-event-confirmed {
          background: rgba(34, 197, 94, 0.35);
          border-left: 3px solid #22c55e;
        }
        .trainer-calendar-event-clickable {
          cursor: pointer;
        }
        .trainer-calendar-event-clickable:hover {
          filter: brightness(1.1);
        }
        .trainer-calendar-event-time {
          margin-right: 4px;
          color: #c4b5fd;
        }
        .trainer-calendar-event-summary { font-weight: 500; }
        .trainer-calendar-event-more {
          font-size: 10px;
          color: #94a3b8;
          padding: 2px 0;
        }
        .trainer-calendar-event-attendees {
          display: block;
          font-size: 10px;
          color: #94a3b8;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .trainer-clients-section { margin-bottom: 32px; }
        .trainer-clients-loading,
        .trainer-clients-empty { color: #94a3b8; margin: 0; font-size: 14px; }
        .trainer-clients-table-wrap { overflow-x: auto; margin-top: 12px; }
        .trainer-clients-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .trainer-clients-table th,
        .trainer-clients-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #334155; }
        .trainer-clients-table th { color: #94a3b8; font-weight: 600; }
        .trainer-clients-table td { color: #e2e8f0; }
        .trainer-clients-name { font-weight: 500; }
        .trainer-clients-email { font-size: 13px; color: #94a3b8; }
        .trainer-clients-row { cursor: pointer; transition: background 0.15s; }
        .trainer-clients-row:hover { background: rgba(124, 58, 237, 0.12); }
        .trainer-client-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px;
        }
        .trainer-client-modal {
          background: #121212; border: 1px solid #334155; border-radius: 16px; max-width: 420px; width: 100%; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }
        .trainer-client-modal-header {
          display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #1a1a2e; border-bottom: 1px solid #334155;
        }
        .trainer-client-modal-header-actions { display: flex; align-items: center; gap: 12px; }
        .trainer-client-modal-btn-toggle {
          padding: 6px 12px; font-size: 13px; color: #c4b5fd; background: rgba(124, 58, 237, 0.25);
          border: 1px solid #7c3aed; border-radius: 8px; cursor: pointer;
        }
        .trainer-client-modal-btn-toggle:hover { background: rgba(124, 58, 237, 0.4); color: #e9d5ff; }
        .trainer-client-modal-full { max-width: 560px; max-height: 90vh; }
        .trainer-client-modal-full .trainer-client-modal-body { max-height: calc(90vh - 60px); overflow-y: auto; }
        .trainer-client-modal-title { margin: 0; font-size: 1.25rem; color: #e2e8f0; }
        .trainer-client-modal-close {
          background: none; border: none; color: #94a3b8; font-size: 24px; cursor: pointer; padding: 0 4px; line-height: 1;
        }
        .trainer-client-modal-close:hover { color: #fff; }
        .trainer-client-modal-body { padding: 20px; }
        .trainer-client-dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 20px; font-size: 14px; }
        .trainer-client-dl dt { color: #94a3b8; }
        .trainer-client-dl dd { margin: 0; color: #e2e8f0; }
        .trainer-client-modal-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #334155; }
        .trainer-client-modal-section-title { margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #c4b5fd; }
        .trainer-client-modal-habits-intro { margin: 0 0 8px; font-size: 13px; color: #94a3b8; }
        .trainer-client-modal-habits-summary { display: flex; flex-wrap: wrap; gap: 12px 20px; font-size: 13px; }
        .trainer-client-habit-positive { color: #86efac; }
        .trainer-client-habit-negative { color: #fca5a5; }
        .trainer-client-dl-compact { gap: 4px 16px; font-size: 13px; }
        .trainer-client-habits-list { margin: 0; padding-left: 20px; font-size: 14px; color: #e2e8f0; }
        .trainer-client-habit-item { margin-bottom: 6px; }
        .trainer-client-habit-emoji { margin-right: 8px; }
        .trainer-client-habit-count { color: #94a3b8; font-size: 13px; margin-left: 4px; }
        .trainer-client-workouts-table-wrap { overflow-x: auto; margin-top: 8px; }
        .trainer-client-workouts-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .trainer-client-workouts-table th,
        .trainer-client-workouts-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #334155; }
        .trainer-client-workouts-table th { color: #94a3b8; font-weight: 600; }
        .trainer-client-workouts-table td { color: #e2e8f0; }
        .trainer-client-workout-notes { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .trainer-schedule-list-details { margin-top: 20px; }
        .trainer-schedule-list-summary {
          font-size: 14px;
          color: #94a3b8;
          cursor: pointer;
        }
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
        .progress-period-hint {
          font-size: 12px;
          color: #64748b;
          margin: -4px auto 12px;
          max-width: 420px;
        }
        .progress-empty-hint,
        .progress-total-hint {
          font-size: 13px;
          color: #94a3b8;
          margin: 0 0 16px;
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
        .progress-habit-line { font-size: 13px; color: #94a3b8; }
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
        .workout-difficulty-options {
          display: flex; flex-direction: column; gap: 8px;
          margin: 8px 0 0;
        }
        .workout-difficulty-option {
          display: flex; align-items: center; gap: 10px;
          cursor: pointer; font-size: 14px; color: #cbd5e1;
          padding: 8px 10px; border-radius: 8px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        }
        .workout-difficulty-option:hover { background: rgba(255,255,255,0.07); }
        .workout-difficulty-option input[type="radio"] {
          width: 18px; height: 18px; margin: 0; accent-color: #7c3aed;
        }
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