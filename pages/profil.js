// /pages/profil.js – Modern Premium Profil (real-time update, refetch on focus, timeout 15s)

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';

const PricingTable = dynamic(() => import('../components/PricingTable'), { ssr: false });
import BodyFigure from '../components/BodyFigure';
import WelcomeTour from '../components/WelcomeTour';
import PlanViewer, { parsePlanHtml } from '../components/PlanViewer';
import HabitTracker from '../components/HabitTracker';
import HabitEntryWizard from '../components/HabitEntryWizard';
import HabitSelection from '../components/HabitSelection';
import Toast from '../components/Toast';
import { supabase } from '../lib/supabaseClient';
import { getPlanTypeLabel } from '../lib/planLabels';
import { getHabitById } from '../lib/habits';
import { normalizeOccupationForForm, activityToFormLabel, goalToFormLabel } from '../lib/preferenceConstants';

const PROGRAM_LABELS = {
  START: { subtitle: 'Každý trénink, každé měření.' },
  ON_CLUB: { subtitle: 'Sleduj návyky, tréninky a svůj progres.' },
  VIP: { subtitle: 'Máš přístup ke všem funkcím včetně habit trackeru.' },
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

const WORKOUT_DISTANCE_KCAL_PER_KM = {
  beh: 60,
  kolo: 30,
  chuze: 35,
  nordic_walking: 45,
  brusleni: 50,
  lyzovani: 55,
};

const WORKOUT_DISTANCE_PACE_MIN_PER_KM = {
  beh: 6.5,
  kolo: 3.3,
  chuze: 12,
  nordic_walking: 10,
  brusleni: 5,
  lyzovani: 6,
};

function parseWorkoutMetaFromNotes(rawNotes) {
  const notes = typeof rawNotes === 'string' ? rawNotes : '';
  const marker = /\n?\[BMO_META\](\{[\s\S]*\})$/;
  const m = notes.match(marker);
  if (!m) return { userNotes: notes.trim(), meta: {} };
  try {
    const meta = JSON.parse(m[1]) || {};
    return { userNotes: notes.replace(marker, '').trim(), meta };
  } catch (_) {
    return { userNotes: notes.trim(), meta: {} };
  }
}

function serializeWorkoutNotesWithMeta(userNotes, meta) {
  const clean = (userNotes || '').trim();
  const normalizedMeta = {};
  Object.entries(meta || {}).forEach(([key, value]) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      normalizedMeta[key] = numeric;
    }
  });
  if (Object.keys(normalizedMeta).length === 0) return clean;
  const payload = `${clean}\n[BMO_META]${JSON.stringify(normalizedMeta)}`.trim();
  return payload;
}

function getWorkoutDistanceKm(workout) {
  const type = (workout?.workout_type || 'ostatni').toLowerCase();
  const { meta } = parseWorkoutMetaFromNotes(workout?.notes);
  if (type === 'plavani') {
    const meters = Number(meta?.distance_m) || 0;
    return meters > 0 ? meters / 1000 : 0;
  }
  const km = Number(meta?.distance_km) || 0;
  return km > 0 ? km : 0;
}

function getWorkoutDurationMinutes(workout) {
  const explicit = Number(workout?.duration_min) || 0;
  if (explicit > 0) return explicit;
  const type = (workout?.workout_type || 'ostatni').toLowerCase();
  const km = getWorkoutDistanceKm(workout);
  const pace = WORKOUT_DISTANCE_PACE_MIN_PER_KM[type];
  if (km > 0 && pace) return Math.round(km * pace);
  return 0;
}

function getWorkoutDetailLabel(workout) {
  const type = (workout?.workout_type || 'ostatni').toLowerCase();
  const { meta } = parseWorkoutMetaFromNotes(workout?.notes);
  if (type === 'plavani') {
    const meters = Number(meta?.distance_m) || 0;
    if (meters > 0) return `${meters} m`;
  }
  const km = Number(meta?.distance_km) || 0;
  if (km > 0) return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  return '';
}

function estimatedCalories(workout) {
  const type = (workout.workout_type || 'ostatni').toLowerCase();
  const km = getWorkoutDistanceKm(workout);
  if (km > 0) {
    if (type === 'plavani') {
      // Orientační výdej: cca 10 kcal / 100 m plavání.
      return Math.round(km * 1000 * 0.1);
    }
    const perKm = WORKOUT_DISTANCE_KCAL_PER_KM[type];
    if (perKm) return Math.round(km * perKm);
  }
  const min = getWorkoutDurationMinutes(workout);
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
  const renderPortal = (node) => (typeof document !== 'undefined' ? createPortal(node, document.body) : null);
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [workoutError, setWorkoutError] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [showHabitEntryWizard, setShowHabitEntryWizard] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);
  const [sendingPlan, setSendingPlan] = useState(false);
  const [generatingNextWeek, setGeneratingNextWeek] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [mindsetTipFromPlan, setMindsetTipFromPlan] = useState('');
  const [workoutModalAnchor, setWorkoutModalAnchor] = useState(null);
  const [preferencesModalAnchor, setPreferencesModalAnchor] = useState(null);
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
  const anyProfileModalOpen = showWorkoutModal || showPreferencesModal || showSettingsModal || showDeleteAccountModal;
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
  const [profileOpenSections, setProfileOpenSections] = useState(new Set(['muj-plan', 'moji-klienti']));
  const [planTab, setPlanTab] = useState('current'); // 'current' | 'next' – Varianta C: Můj plán
  const [statsTab, setStatsTab] = useState('overview'); // 'overview' | 'weight' | 'progress' – Varianta C: Statistiky a progres

  const toggleProfileSection = (id) => {
    setProfileOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [workoutForm, setWorkoutForm] = useState({
    workout_date: '',
    workout_type: 'silovy',
    duration_min: 45,
    distance_km: '',
    distance_m: '',
    notes: '',
    perceived_difficulty: '',
  });

  const [settingsForm, setSettingsForm] = useState({
    start_weight_kg: '',
    goal_weight_kg: '',
    height_cm: '',
  });

  const [preferencesForm, setPreferencesForm] = useState({
    activity: '',
    stress_level: '',
    occupation: '',
    goal: '',
    freq_choice: '',
    workout_days: [],
    diet_type: '',
    dietary_restrictions: '',
    foods_to_avoid: '',
    selected_habits: [],
  });
  const WORKOUT_DAY_LABELS = [{ v: 1, label: 'Po' }, { v: 2, label: 'Út' }, { v: 3, label: 'St' }, { v: 4, label: 'Čt' }, { v: 5, label: 'Pá' }, { v: 6, label: 'So' }, { v: 0, label: 'Ne' }];

  const profileRef = useRef(null);
  const lastMutatedAtRef = useRef(0);
  const workoutDateInputRef = useRef(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const prevScrollRestoration = window.history?.scrollRestoration;
      if (window.history && 'scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
      const forceTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      forceTop();
      requestAnimationFrame(forceTop);
      const t = setTimeout(forceTop, 120);
      return () => {
        clearTimeout(t);
        if (window.history && 'scrollRestoration' in window.history && prevScrollRestoration) {
          window.history.scrollRestoration = prevScrollRestoration;
        }
      };
    }
  }, []);
  useEffect(() => {
    if (!loading && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [loading]);

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
          trialEndsAt: data.trialEndsAt || null,
          isTrialExpired: data.isTrialExpired === true,
          daysUntilTrialEnd: data.daysUntilTrialEnd != null ? data.daysUntilTrialEnd : null,
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

  /** Normalizuje freq_choice/weekly_sessions_user na hodnotu pro select (1-2x | 2-3x | 4-5x týdně). */
  const getFreqFromMetrics = (lm) => {
    const fc = lm?.freq_choice;
    if (fc && typeof fc === 'string') {
      const t = fc.replace(/\u2013/g, '-').trim().toLowerCase();
      if ((t.includes('1') && t.includes('2')) || t === '1-2x týdně') return '1-2x týdně';
      if ((t.includes('2') && t.includes('3')) || t === '2-3x týdně') return '2-3x týdně';
      if ((t.includes('4') || t.includes('5')) || t === '4-5x týdně') return '4-5x týdně';
    }
    const w = Number(lm?.weekly_sessions_user);
    if (w === 1) return '1-2x týdně';
    if (w === 5) return '4-5x týdně';
    if (w === 3) return '2-3x týdně';
    return '';
  };

  const getAnchoredModalStyle = (triggerEl, modalWidth, estimatedHeight = 560) => {
    if (typeof window === 'undefined' || !triggerEl) return null;
    const rect = triggerEl.getBoundingClientRect();
    const pad = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const effectiveWidth = Math.min(modalWidth, Math.max(280, viewportW - pad * 2));
    let left = rect.left + rect.width / 2 - effectiveWidth / 2;
    left = Math.max(pad, Math.min(left, viewportW - effectiveWidth - pad));
    let top = rect.bottom + 10;
    const minVisibleHeight = 220;
    const spaceBelow = viewportH - top - pad;
    if (spaceBelow < minVisibleHeight) {
      top = Math.max(pad, rect.top - estimatedHeight - 10);
    }
    const maxHeight = Math.max(minVisibleHeight, viewportH - top - pad);
    return {
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(effectiveWidth)}px`,
      maxWidth: `${Math.round(effectiveWidth)}px`,
      margin: 0,
      maxHeight: `${Math.round(maxHeight)}px`,
    };
  };

  useEffect(() => {
    if (router.query.edit === 'preferences' && profile && !profile?.can_create_calendar_events) {
      const lm = profile?.body_metrics?.[0];
      const freq = getFreqFromMetrics(lm);
      setPreferencesForm({
        activity: activityToFormLabel(lm?.activity) || '',
        stress_level: lm?.stress_level ?? '',
        occupation: normalizeOccupationForForm(lm?.occupation) || '',
        goal: goalToFormLabel(lm?.goal) || '',
        freq_choice: freq,
        frequency: freq,
        diet_type: lm?.diet_type ?? '',
        dietary_restrictions: lm?.dietary_restrictions ?? '',
        foods_to_avoid: lm?.foods_to_avoid ?? '',
        selected_habits: (profile?.user_habits || []).map((h) => h.habit_id).filter(Boolean),
      });
      setPreferencesModalAnchor(null);
      setShowPreferencesModal(true);
      router.replace('/profil', undefined, { shallow: true });
    }
  }, [router.query.edit, profile]);

  // Automatické obnovení dat méně často (3 min), aby stránka ne„přeskakovala“
  useEffect(() => {
    if (!session?.access_token || loading) return;
    const interval = setInterval(async () => {
      try {
        const { data: { session: fresh } } = await supabase.auth.refreshSession();
        const token = fresh?.access_token ?? session?.access_token;
        if (token) await refetchProfile(token);
      } catch (err) {}
    }, 180000);
    return () => clearInterval(interval);
  }, [session, loading]);

  // Refetch při návratu na záložku jen pokud byla skrytá aspoň 60 s (sníží „přeskakování“)
  useEffect(() => {
    if (!session?.access_token) return;
    let hiddenAt = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAt != null) {
        const hiddenDuration = Date.now() - hiddenAt;
        if (hiddenDuration >= 60000) refetchProfile(session.access_token, profileRef.current);
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [session?.access_token]);


  // Když se otevře modal, zarovnej stránku nahoru a zamkni scroll pod overlayem,
  // aby se formulář otevíral hned u horní hrany místo "dole".
  useEffect(() => {
    if (!anyProfileModalOpen || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const activeElement = document.activeElement;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const shouldForceTop =
      showSettingsModal ||
      showDeleteAccountModal ||
      (showWorkoutModal && !workoutModalAnchor) ||
      (showPreferencesModal && !preferencesModalAnchor);
    if (shouldForceTop) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    const rafId = window.requestAnimationFrame(() => {
      if (shouldForceTop) {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      document.querySelectorAll('.modal-overlay').forEach((node) => {
        try { node.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (_) {}
      });
      document.querySelectorAll('.modal').forEach((node) => {
        try { node.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (_) {}
      });
      if (activeElement && typeof activeElement.blur === 'function') {
        activeElement.blur();
      }
    });
    const timeoutId = window.setTimeout(() => {
      if (shouldForceTop) {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      document.querySelectorAll('.modal-overlay').forEach((node) => {
        try { node.scrollTop = 0; } catch (_) {}
      });
      document.querySelectorAll('.modal').forEach((node) => {
        try { node.scrollTop = 0; } catch (_) {}
      });
    }, 80);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [anyProfileModalOpen, showWorkoutModal, showPreferencesModal, showSettingsModal, showDeleteAccountModal, workoutModalAnchor, preferencesModalAnchor]);

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
    const mondayStr = getLocalDateStr(monday);
    const from = dateStrAddDays(mondayStr, -14);
    const to = getLocalDateStr(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
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

  // Toast po úspěšné platbě (redirect ze Stripe)
  useEffect(() => {
    if (router.query?.payment === 'success') {
      setToast({ message: 'Platba proběhla. Tvůj přístup bude aktivní během chvíle.', type: 'success' });
      router.replace('/profil', undefined, { shallow: true });
    }
  }, [router.query?.payment]);

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
        router.replace('/');
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
        body: JSON.stringify({
          ...workoutForm,
          notes: serializeWorkoutNotesWithMeta(workoutForm.notes, {
            distance_km: workoutForm.distance_km ? Number(workoutForm.distance_km) : null,
            distance_m: workoutForm.distance_m ? Number(workoutForm.distance_m) : null,
          }),
        }),
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
        setWorkoutForm({
          workout_date: getLocalDateStr(new Date()),
          workout_type: 'silovy',
          duration_min: 45,
          distance_km: '',
          distance_m: '',
          notes: '',
          perceived_difficulty: '',
        });
        setShowWorkoutModal(false);
        setWorkoutModalAnchor(null);
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
      payload.daily_email = settingsForm.daily_email !== false;
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
          user: p?.user ? { ...p.user, ...(json.user_metadata || {}), ...(json.daily_email !== undefined && { daily_email: json.daily_email }) } : { ...json.user_metadata, ...(json.daily_email !== undefined && { daily_email: json.daily_email }) },
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

  async function handleSavePreferences(e) {
    e.preventDefault();
    setPreferencesError('');
    setSavingPreferences(true);
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      if (!token) {
        setPreferencesError('Session vypršela. Obnov stránku.');
        return;
      }
      if (preferencesForm.selected_habits.length === 0) {
        setPreferencesError('Vyber alespoň jeden návyk.');
        return;
      }
      const res = await fetch('/api/profile-preferences', {
        ...fetchOptions,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          activity: preferencesForm.activity || undefined,
          stress_level: preferencesForm.stress_level || undefined,
          occupation: preferencesForm.occupation || preferencesForm.worktype || undefined,
          goal: preferencesForm.goal || undefined,
          freq_choice: preferencesForm.freq_choice || preferencesForm.frequency || undefined,
          workout_days: Array.isArray(preferencesForm.workout_days) && preferencesForm.workout_days.length > 0 ? preferencesForm.workout_days : undefined,
          diet_type: preferencesForm.diet_type || undefined,
          dietary_restrictions: preferencesForm.dietary_restrictions || undefined,
          foods_to_avoid: preferencesForm.foods_to_avoid || undefined,
          selected_habits: preferencesForm.selected_habits,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setShowPreferencesModal(false);
        setPreferencesModalAnchor(null);
        setToast({ message: json.message || 'Preference uloženy a plán přegenerován.', type: 'success' });
        lastMutatedAtRef.current = Date.now();
        const result = await refetchProfile(token, profile);
        if (result?.ok) setProfile((prev) => ({ ...prev, _updated: Date.now() }));
      } else {
        setPreferencesError(json.error || 'Nepodařilo se uložit.');
      }
    } catch (err) {
      setPreferencesError(err.message || 'Chyba připojení');
    } finally {
      setSavingPreferences(false);
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
  const { program, membershipStatus, membershipSince, trialEndsAt, isTrialExpired, daysUntilTrialEnd, metrics, workouts, latestMetric, firstMetric, latestWorkout, currentWeight, weightDiff, workoutsThisWeek, totalMinutesThisWeek, estimatedCaloriesThisWeek, totalMinutes, estimatedCaloriesAll, chartWeightData, userName, firstName, lastWeekCount, lastWeekMinutes, workoutTrend, startWeight, goalWeight, heightCm, estimatedKgLostTotal, estimatedCurrentWeight, estimatedCurrentWeightRounded, kgPerWeekFromWeek, weeksToGoal, weekStartFormatted, weekEndFormatted, periodStartFormatted, periodEndFormatted, thisWeekDates, startWeightDate, lastWeightDate, habitAdjustedWeight, hasHabitData, positiveDone, negativeDone, habitCorrectionKg } = useMemo(() => {
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
    const weekStartStr = getLocalDateStr(weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = getLocalDateStr(weekEnd);
    const getDate = (x) => (x.workout_date || '').toString().slice(0, 10);
    const thisWeek = w.filter((x) => getDate(x) >= weekStartStr);
    const thisWeekDates = [...new Set(thisWeek.map((x) => getDate(x)))].sort().map((d) => formatShortDate(d));
    const minWeek = thisWeek.reduce((s, x) => s + getWorkoutDurationMinutes(x), 0);
    const kcalWeek = thisWeek.reduce((s, x) => s + estimatedCalories(x), 0);
    const minTotal = w.reduce((s, x) => s + getWorkoutDurationMinutes(x), 0);
    const kcalTotal = w.reduce((s, x) => s + estimatedCalories(x), 0);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekStartStr = getLocalDateStr(lastWeekStart);
    const lastWeek = w.filter((x) => getDate(x) >= lastWeekStartStr && getDate(x) < weekStartStr);
    const lastWeekMin = lastWeek.reduce((s, x) => s + getWorkoutDurationMinutes(x), 0);
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
    const trialEndsAt = profile?.trialEndsAt || null;
    const isTrialExpired = profile?.isTrialExpired === true;
    const daysUntilTrialEnd = profile?.daysUntilTrialEnd != null ? profile.daysUntilTrialEnd : null;

    return {
      program,
      membershipStatus,
      membershipSince,
      trialEndsAt,
      isTrialExpired,
      daysUntilTrialEnd,
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

  async function handleGenerateNextWeek() {
    setGeneratingNextWeek(true);
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession();
      const token = fresh?.access_token ?? session?.access_token;
      if (!token) {
        setToast({ message: 'Session vypršela. Přihlas se znovu.', type: 'error' });
        return;
      }
      const res = await fetch('/api/generate-plan-next-week', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setToast({ message: 'Jídelníček na příští týden vygenerován. Zkontroluj náhled níže.', type: 'success' });
        const result = await refetchProfile(token);
        if (result?.ok) setProfile((prev) => ({ ...prev, _updated: Date.now() }));
      } else {
        setToast({ message: json.error || 'Nepodařilo vygenerovat plán.', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Chyba připojení.', type: 'error' });
    } finally {
      setGeneratingNextWeek(false);
    }
  }

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

  // Plán na příští týden (valid_from až po dnešním datu – porovnání jen datum, ne čas kvůli timezone)
  const nextPlan = useMemo(() => {
    if (!profile?.plans || !Array.isArray(profile.plans)) return null;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const future = profile.plans.filter((p) => {
      const fromStr = (p.valid_from || '').split('T')[0];
      return fromStr && fromStr > todayStr;
    });
    if (future.length === 0) return null;
    future.sort((a, b) => (a.valid_from || '').localeCompare(b.valid_from || ''));
    return future[0];
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
        <div className="page-bg-decor" aria-hidden>
          <span className="page-bg-orb page-bg-orb--center" />
        </div>
        {!loading && !error && (
          <header className={`profile-hero ${(!profile?.can_create_calendar_events && (currentPlan || program === 'ON_CLUB' || program === 'VIP')) ? 'profile-hero--with-program' : 'profile-hero--centered'}`}>
            <div className="profile-hero-inner">
              {!profile?.can_create_calendar_events && (currentPlan || program === 'ON_CLUB' || program === 'VIP') && (
                <div className="profile-hero-brand">
                  <span className="profile-hero-brand-label">Body & Mind ON</span>
                  <span className="profile-hero-brand-welcome">
                    Vítej v programu {program === 'ON_CLUB' ? 'ON club' : program === 'VIP' ? 'VIP' : (getPlanTypeLabel(currentPlan?.plan_type) || 'START').toLowerCase()}
                  </span>
                </div>
              )}
              <div className="profile-hero-main">
                {!profile?.can_create_calendar_events ? (
                  <>
                    <div className="profile-hero-copy">
                      <h1 className="profile-hero-title">
                        <span>{firstName}</span>
                      </h1>
                      <p className="profile-hero-tagline">Sleduj návyky, tréninky a svůj progres.</p>
                      <p className="profile-hero-date" aria-hidden>
                        {new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <div className="profile-hero-avatar-wrap">
                      <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar} className="profile-hero-avatar-btn" aria-label="Změnit profilový obrázek">
                        {profile?.user?.avatar_url ? (
                          <img src={profile.user.avatar_url} alt="" className="profile-hero-avatar" />
                        ) : (
                          <span className="profile-hero-avatar-placeholder" aria-hidden>{firstName?.charAt(0)?.toUpperCase() || '?'}</span>
                        )}
                      </button>
                      <input
                        type="file"
                        ref={avatarInputRef}
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hero-avatar-input-hidden"
                        onChange={handleAvatarUpload}
                      />
                      <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar} className="profile-hero-avatar-change">
                        {uploadingAvatar ? 'Nahrávám…' : 'Změnit foto'}
                      </button>
                      {avatarError && <p className="profile-hero-avatar-error" role="alert">{avatarError}</p>}
                    </div>
                  </>
                ) : (
                  <div className="profile-hero-copy">
                    <h1 className="profile-hero-title"><span>{firstName}</span></h1>
                    <p className="profile-hero-tagline">Přehled klientů a kalendář tréninků.</p>
                    <p className="profile-hero-date" aria-hidden>
                      {new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </header>
        )}
        {/* Členství + osobní plán v jedné bublině – jen pro klienty */}
        {!loading && !error && !profile?.can_create_calendar_events && (
          <>
            <div className={`profile-membership-plan-card membership-card--${(program || 'START').toLowerCase().replace('_', '-')}`}>
              <div className="membership-card-row">
                <div className="membership-card-left">
                  <span className="membership-icon">
                    {program === 'VIP' ? '👑' : program === 'ON_CLUB' ? '⚡' : '🚀'}
                  </span>
                  <div className="membership-card-nav-wrap">
                    <nav className="profile-quick-nav" aria-label="Rychlá navigace">
                      <button type="button" className="profile-quick-nav-btn" onClick={() => { document.getElementById('muj-plan')?.scrollIntoView({ behavior: 'smooth' }); toggleProfileSection('muj-plan'); }}>Můj plán</button>
                      <button type="button" className="profile-quick-nav-btn" onClick={() => { document.getElementById('denni-navyky')?.scrollIntoView({ behavior: 'smooth' }); toggleProfileSection('denni-navyky'); }}>Denní návyky</button>
                      <button type="button" className="profile-quick-nav-btn" onClick={() => { document.getElementById('muj-plan')?.scrollIntoView({ behavior: 'smooth' }); toggleProfileSection('muj-plan'); }} title="Zobrazit jídelníček a tréninkový plán">
                        Tréninkový plán
                      </button>
                      <button type="button" className="profile-quick-nav-btn" onClick={() => { document.getElementById('statistiky')?.scrollIntoView({ behavior: 'smooth' }); toggleProfileSection('statistiky'); }}>Statistiky a progres</button>
                    </nav>
                  </div>
                </div>
                <div className="membership-card-right">
                  <button
                    type="button"
                    className="profile-main-workout-btn"
                    onClick={(e) => {
                      if (typeof window !== 'undefined' && window.innerWidth > 640) {
                        setWorkoutModalAnchor(getAnchoredModalStyle(e.currentTarget, 400, 560));
                      } else {
                        setWorkoutModalAnchor(null);
                      }
                      setShowWorkoutModal(true);
                      setWorkoutError('');
                      setWorkoutForm((f) => ({ ...f, workout_date: getLocalDateStr(new Date()) }));
                    }}
                  >
                    <span className="profile-main-workout-btn-emoji" aria-hidden>🏋️</span>
                    Zapsat trénink
                  </button>
                  <div className="membership-status-block">
                    <span className={`membership-status-badge membership-status--${membershipStatus}`}>
                      {membershipStatus === 'active' ? 'Aktivní' : membershipStatus === 'trial' ? 'Zkušební' : membershipStatus === 'cancelled' ? 'Zrušeno' : 'Neaktivní'}
                    </span>
                  </div>
                  <div className="profile-quick-nav-account">
                    <button type="button" className="profile-quick-nav-btn profile-quick-nav-btn-account" onClick={handleLogout}>Odhlásit se</button>
                    <button type="button" className="profile-quick-nav-btn profile-quick-nav-btn-danger" onClick={() => setShowDeleteAccountModal(true)} title="Trvale smazat účet a všechna data">Zrušit profil</button>
                  </div>
                </div>
              </div>
              {(currentPlan || program === 'ON_CLUB' || program === 'VIP') && (
                <div className="plan-goal-in-card">
                  <div className="plan-goal-row">
                    {!loading && !error && (
                      <div className="plan-goal-stats">
                        <div className="plan-goal-stat">
                          <span className="plan-goal-stat-value">{workoutsThisWeek?.length ?? 0} {workoutTrend ? <span className="trend-arrow" title={workoutTrend === '↑' ? 'Víc než minulý týden' : workoutTrend === '↓' ? 'Méně než minulý týden' : 'Stejně'}>{workoutTrend}</span> : null}</span>
                          <span className="plan-goal-stat-label">Tréninků tento týden</span>
                        </div>
                        <div className="plan-goal-stat">
                          <span className="plan-goal-stat-value">{totalMinutesThisWeek ?? 0} min</span>
                          <span className="plan-goal-stat-label">V pohybu</span>
                        </div>
                        <div className="plan-goal-stat">
                          <span className="plan-goal-stat-value">{(hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeight) != null ? `${(hasHabitData && habitAdjustedWeight != null ? habitAdjustedWeight : estimatedCurrentWeight).toFixed(1)} kg` : '—'}</span>
                          <span className="plan-goal-stat-label">{hasHabitData ? 'Odhad (tréninky + návyky)' : 'Odhad z tréninků'}</span>
                        </div>
                      </div>
                    )}
                    <div className="plan-goal-actions">
                      <button
                        type="button"
                        onClick={(e) => {
                          const lm = profile?.body_metrics?.[0];
                          const freq = getFreqFromMetrics(lm);
                          const wdRaw = lm?.workout_days;
                          const workoutDays = (Array.isArray(wdRaw) ? wdRaw : (typeof wdRaw === 'string' && wdRaw ? wdRaw.split(',').map((s) => Number(s.trim())) : [])).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
                          setPreferencesError('');
                          setPreferencesForm({
                            activity: activityToFormLabel(lm?.activity) || '',
                            stress_level: lm?.stress_level ?? '',
                            occupation: normalizeOccupationForForm(lm?.occupation) || '',
                            goal: goalToFormLabel(lm?.goal) || '',
                            freq_choice: freq,
                            frequency: freq,
                            workout_days: workoutDays,
                            diet_type: lm?.diet_type ?? '',
                            dietary_restrictions: lm?.dietary_restrictions ?? '',
                            foods_to_avoid: lm?.foods_to_avoid ?? '',
                            selected_habits: (profile?.user_habits || []).map((h) => h.habit_id).filter(Boolean),
                          });
                          if (typeof window !== 'undefined' && window.innerWidth > 640) {
                            setPreferencesModalAnchor(getAnchoredModalStyle(e.currentTarget, 520, 700));
                          } else {
                            setPreferencesModalAnchor(null);
                          }
                          setShowPreferencesModal(true);
                        }}
                        className="hero-prefs-btn plan-goal-prefs-btn"
                      >
                        <span className="hero-prefs-emoji">✏️</span>
                        Upravit preference
                        <span className="hero-prefs-sublabel">Aktivita, cíl, strava, návyky</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {program === 'START' && (isTrialExpired || (daysUntilTrialEnd != null && daysUntilTrialEnd >= 0 && daysUntilTrialEnd <= 2)) && (
              <div className={`trial-banner trial-banner--${isTrialExpired ? 'expired' : 'soon'}`}>
                {isTrialExpired ? (
                  <>
                    <p className="trial-banner-text">Tvůj 7denní START program vypršel. Pro pokračování zaplať předplatné 499 Kč/měsíc.</p>
                    <div className="trial-banner-stripe">
                      <PricingTable />
                    </div>
                    <div className="trial-banner-upgrade">
                      <p className="trial-banner-upgrade-headline">Nebo zvol vyšší program – víc benefitů, víc výsledků</p>
                      <div className="trial-banner-upgrade-cards">
                        <a href="/on-club" className="trial-upgrade-card trial-upgrade-card--club">
                          <span className="trial-upgrade-badge">Doporučeno</span>
                          <h3 className="trial-upgrade-title">ON Club</h3>
                          <p className="trial-upgrade-subtitle">AI trenér 24/7, habit tracker, komunita a video konzultace</p>
                          <span className="trial-upgrade-price">1 499 Kč/měsíc</span>
                          <span className="trial-upgrade-cta">Připojit se k ON Clubu →</span>
                        </a>
                        <a href="/chci-vip" className="trial-upgrade-card trial-upgrade-card--vip">
                          <h3 className="trial-upgrade-title">VIP Coaching</h3>
                          <p className="trial-upgrade-subtitle">Elitní lidský kouč, týdenní 1:1 konzultace, strategie na míru</p>
                          <span className="trial-upgrade-price">3 999 Kč/měsíc</span>
                          <span className="trial-upgrade-cta">Chci VIP přístup →</span>
                        </a>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="trial-banner-text">
                    Tvůj START program vyprší za {daysUntilTrialEnd === 0 ? 'dnes' : daysUntilTrialEnd === 1 ? '1 den' : `${daysUntilTrialEnd} dny`}. Připoj se k <a href="/on-club">ON Clubu</a> pro plný přístup.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <section className={`hero ${profile?.can_create_calendar_events ? '' : 'hero--empty'}`}>
          <div className="hero-avatar-wrap">
            {profile?.can_create_calendar_events && (
              <>
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
              </>
            )}
          </div>

          {avatarCrop.open && avatarCrop.src && renderPortal(
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

          {profile?.can_create_calendar_events && (
            <p className="hero-intro">Trenér</p>
          )}
          {!loading && !error && profile?.can_create_calendar_events && (
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
          {profile?.can_create_calendar_events && (
            <div className="hero-actions">
              <button onClick={handleLogout} className="logout">Odhlásit se</button>
              <button type="button" onClick={() => setShowDeleteAccountModal(true)} className="logout logout-danger" title="Trvale smazat účet a všechna data">Zrušit profil</button>
            </div>
          )}
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
            {/* Trenér: Moji klienti – bublina */}
            {profile?.can_create_calendar_events && (
              <>
              <div className="profile-bubbles">
              <div className="profile-bubble" id="moji-klienti">
                <button type="button" id="profile-bubble-header-moji-klienti" className="profile-bubble-header" onClick={() => toggleProfileSection('moji-klienti')} aria-expanded={profileOpenSections.has('moji-klienti')} aria-controls="profile-bubble-body-moji-klienti">
                  <span className="profile-bubble-title">Moji klienti</span>
                  <span className={`profile-bubble-chevron ${profileOpenSections.has('moji-klienti') ? 'open' : ''}`} aria-hidden>▼</span>
                </button>
                <div id="profile-bubble-body-moji-klienti" role="region" aria-labelledby="profile-bubble-header-moji-klienti" className="profile-bubble-body" data-open={profileOpenSections.has('moji-klienti')}>
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
                </div>
              </div>
              </div>

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
                          {(() => {
                            const minutes = getWorkoutDurationMinutes(selectedClient.last_workout);
                            const detailLabel = getWorkoutDetailLabel(selectedClient.last_workout);
                            const { userNotes } = parseWorkoutMetaFromNotes(selectedClient.last_workout.notes);
                            return (
                          <dl className="trainer-client-dl trainer-client-dl-compact">
                            <dt>Datum</dt><dd>{formatDate(selectedClient.last_workout.workout_date)}</dd>
                            <dt>Typ</dt><dd>{selectedClient.last_workout.workout_name || selectedClient.last_workout.workout_type || '—'}</dd>
                            {minutes > 0 && (
                              <><dt>Délka</dt><dd>{minutes} min</dd></>
                            )}
                            {detailLabel && (
                              <><dt>Objem</dt><dd>{detailLabel}</dd></>
                            )}
                            {userNotes && (
                              <><dt>Poznámka</dt><dd>{userNotes}</dd></>
                            )}
                          </dl>
                            );
                          })()}
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
                                    {selectedClient.last_workouts.map((w, i) => {
                                      const minutes = getWorkoutDurationMinutes(w);
                                      const detailLabel = getWorkoutDetailLabel(w);
                                      const { userNotes } = parseWorkoutMetaFromNotes(w.notes);
                                      return (
                                        <tr key={`${w.workout_date}-${i}`}>
                                          <td>{formatDate(w.workout_date)}</td>
                                          <td>{w.workout_name || w.workout_type || '—'}</td>
                                          <td>{minutes > 0 ? `${minutes} min${detailLabel ? ` / ${detailLabel}` : ''}` : (detailLabel || '—')}</td>
                                          <td className="trainer-client-workout-notes">{userNotes || '—'}</td>
                                        </tr>
                                      );
                                    })}
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

            {/* Krátký tip – pro uživatele bez tréninku (jen klienti) */}
            {!profile?.can_create_calendar_events && workouts.length === 0 && currentPlan && (
              <div className="first-action-banner">
                <p className="first-action-banner-lead">Tvůj plán je připraven.</p>
                <p className="first-action-banner-text">Rozklikni sekce níže – <strong>Jídelníček a tréninkový plán</strong> nebo <strong>Denní návyky</strong>. Trénink zapíšeš tlačítkem nahoře v hlavní kartě.</p>
              </div>
            )}

            {/* Sjednocený kontejner bublin – pro trenéra i klienta */}
            <div className="profile-bubbles">
            {/* Mindset na tento týden (jen klienti) – nahoře před plánem */}
            {!profile?.can_create_calendar_events && mindsetTipFromPlan && (
            <div className="profile-bubble" id="mindset">
              <button type="button" id="profile-bubble-header-mindset" className="profile-bubble-header" onClick={() => toggleProfileSection('mindset')} aria-expanded={profileOpenSections.has('mindset')} aria-controls="profile-bubble-body-mindset">
                <span className="profile-bubble-title">Mindset na tento týden</span>
                <span className={`profile-bubble-chevron ${profileOpenSections.has('mindset') ? 'open' : ''}`} aria-hidden>▼</span>
              </button>
              <div id="profile-bubble-body-mindset" role="region" aria-labelledby="profile-bubble-header-mindset" className="profile-bubble-body" data-open={profileOpenSections.has('mindset')}>
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
              </div>
            </div>
            )}

            {/* Můj plán – první blok pro klienta (Varianta C) */}
            {!profile?.can_create_calendar_events && (currentPlan || nextPlan) && (
            <div className="profile-bubble" id="muj-plan">
              <button type="button" id="profile-bubble-header-muj-plan" className="profile-bubble-header" onClick={() => toggleProfileSection('muj-plan')} aria-expanded={profileOpenSections.has('muj-plan')} aria-controls="profile-bubble-body-muj-plan">
                <span className="profile-bubble-title">Můj plán</span>
                <span className={`profile-bubble-chevron ${profileOpenSections.has('muj-plan') ? 'open' : ''}`} aria-hidden>▼</span>
              </button>
              <div id="profile-bubble-body-muj-plan" role="region" aria-labelledby="profile-bubble-header-muj-plan" className="profile-bubble-body" data-open={profileOpenSections.has('muj-plan')}>
              {currentPlan && nextPlan ? (
                <>
                  <div className="profile-bubble-tabs" role="tablist" aria-label="Týden plánu">
                    <button type="button" role="tab" aria-selected={planTab === 'current'} className={`profile-bubble-tab ${planTab === 'current' ? 'profile-bubble-tab--active' : ''}`} onClick={() => setPlanTab('current')}>Tento týden</button>
                    <button type="button" role="tab" aria-selected={planTab === 'next'} className={`profile-bubble-tab ${planTab === 'next' ? 'profile-bubble-tab--active' : ''}`} onClick={() => setPlanTab('next')}>Příští týden</button>
                  </div>
                  {planTab === 'current' ? (
                    <PlanViewer
                      plan={currentPlan}
                      userName={userName}
                      hideHero
                      dietaryPreferences={(() => {
                        const lm = profile?.body_metrics?.[0];
                        if (!lm) return '';
                        const parts = [];
                        if (lm.dietary_restrictions?.trim()) parts.push(lm.dietary_restrictions.trim());
                        if (lm.foods_to_avoid?.trim()) parts.push(lm.foods_to_avoid.trim());
                        return parts.join('. ');
                      })()}
                      onToast={(t) => setToast({ message: t.message, type: t.type || 'success' })}
                      canPinMeals={membershipStatus === 'active' || (membershipStatus === 'trial' && !isTrialExpired)}
                    />
                  ) : (
                    <PlanViewer
                      plan={nextPlan}
                      userName={userName}
                      hideHero
                      dietaryPreferences={(() => {
                        const lm = profile?.body_metrics?.[0];
                        if (!lm) return '';
                        const parts = [];
                        if (lm.dietary_restrictions?.trim()) parts.push(lm.dietary_restrictions.trim());
                        if (lm.foods_to_avoid?.trim()) parts.push(lm.foods_to_avoid.trim());
                        return parts.join('. ');
                      })()}
                      onToast={(t) => setToast({ message: t.message, type: t.type || 'success' })}
                      canPinMeals={false}
                    />
                  )}
                </>
              ) : currentPlan ? (
                <PlanViewer
                  plan={currentPlan}
                  userName={userName}
                  hideHero
                  dietaryPreferences={(() => {
                    const lm = profile?.body_metrics?.[0];
                    if (!lm) return '';
                    const parts = [];
                    if (lm.dietary_restrictions?.trim()) parts.push(lm.dietary_restrictions.trim());
                    if (lm.foods_to_avoid?.trim()) parts.push(lm.foods_to_avoid.trim());
                    return parts.join('. ');
                  })()}
                  onToast={(t) => setToast({ message: t.message, type: t.type || 'success' })}
                  canPinMeals={membershipStatus === 'active' || (membershipStatus === 'trial' && !isTrialExpired)}
                />
              ) : nextPlan ? (
                <PlanViewer
                  plan={nextPlan}
                  userName={userName}
                  hideHero
                  dietaryPreferences={(() => {
                    const lm = profile?.body_metrics?.[0];
                    if (!lm) return '';
                    const parts = [];
                    if (lm.dietary_restrictions?.trim()) parts.push(lm.dietary_restrictions.trim());
                    if (lm.foods_to_avoid?.trim()) parts.push(lm.foods_to_avoid.trim());
                    return parts.join('. ');
                  })()}
                  onToast={(t) => setToast({ message: t.message, type: t.type || 'success' })}
                  canPinMeals={false}
                />
              ) : null}
              </div>
            </div>
            )}

            {!profile?.can_create_calendar_events && (
            <div className="profile-bubble" id="milniky">
              <button type="button" id="profile-bubble-header-milniky" className="profile-bubble-header" onClick={() => toggleProfileSection('milniky')} aria-expanded={profileOpenSections.has('milniky')} aria-controls="profile-bubble-body-milniky">
                <span className="profile-bubble-title">Tvé milníky</span>
                <span className={`profile-bubble-chevron ${profileOpenSections.has('milniky') ? 'open' : ''}`} aria-hidden>▼</span>
              </button>
              <div id="profile-bubble-body-milniky" role="region" aria-labelledby="profile-bubble-header-milniky" className="profile-bubble-body" data-open={profileOpenSections.has('milniky')}>
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
              </div>
            </div>
            )}

            {/* Kdy mám trénink? / Můj kalendář – bublina (pro oba) */}
            <div className="profile-bubble" id="kalendar">
              <button type="button" id="profile-bubble-header-kalendar" className="profile-bubble-header" onClick={() => toggleProfileSection('kalendar')} aria-expanded={profileOpenSections.has('kalendar')} aria-controls="profile-bubble-body-kalendar">
                <span className="profile-bubble-title">{profile?.can_create_calendar_events ? 'Můj kalendář tréninků' : 'Kdy mám trénink?'}</span>
                <span className={`profile-bubble-chevron ${profileOpenSections.has('kalendar') ? 'open' : ''}`} aria-hidden>▼</span>
              </button>
              <div id="profile-bubble-body-kalendar" role="region" aria-labelledby="profile-bubble-header-kalendar" className="profile-bubble-body" data-open={profileOpenSections.has('kalendar')}>
            <section className="card trainer-schedule-section">
              <h2 className="section-head">{profile?.can_create_calendar_events ? 'Můj kalendář tréninků' : 'Kdy mám trénink?'}</h2>
              <p className="trainer-schedule-lead">
                {profile?.can_create_calendar_events
                  ? 'Tvůj rozvrh z Google Kalendáře. V každé události vidíš přiřazené klienty (účastníky). Přepínání týdnů šipkami ‹ ›.'
                  : 'Rozvrh plánovaných tréninků z kalendáře trenéra. Zdroj: info@ (Google Kalendář). Zobrazuje se vždy jeden týden (Po–Ne); v každém dnu jsou události přiřazené tobě (čas a název). Přepínání týdnů šipkami ‹ ›.'}
              </p>
              {!profile?.can_create_calendar_events && (
                <p className="trainer-schedule-lead trainer-schedule-lead-how">
                  Tréninky zapisuje trenér do kalendáře; tobě přijde pozvánka na e-mail a po potvrzení se událost zobrazí zde (zelená = potvrzeno, žlutá = čeká na schválení).
                </p>
              )}
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
              </div>
            </div>

            {/* Denní návyky – bublina (souhrn + tracker + graf v jednom) */}
            {!profile?.can_create_calendar_events && (
            <div className="profile-bubble" id="denni-navyky">
              <button type="button" id="profile-bubble-header-denni-navyky" className="profile-bubble-header" onClick={() => toggleProfileSection('denni-navyky')} aria-expanded={profileOpenSections.has('denni-navyky')} aria-controls="profile-bubble-body-denni-navyky">
                <span className="profile-bubble-title">Denní návyky</span>
                <span className={`profile-bubble-chevron ${profileOpenSections.has('denni-navyky') ? 'open' : ''}`} aria-hidden>▼</span>
              </button>
              <div id="profile-bubble-body-denni-navyky" role="region" aria-labelledby="profile-bubble-header-denni-navyky" className="profile-bubble-body" data-open={profileOpenSections.has('denni-navyky')}>
            {(program === 'ON_CLUB' || program === 'VIP') && profile?.user_habits?.length > 0 && (
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
            <HabitTracker
              session={session}
              userHabits={profile?.user_habits}
              onToast={(t) => setToast({ message: t.message, type: t.type })}
              onHabitSaved={() => refetchProfile(session?.access_token)}
            />
              </div>
            </div>
            )}

            {/* Historie tréninků – bublina (jen klienti) */}
            {!profile?.can_create_calendar_events && (
            <div className="profile-bubble" id="historie">
              <button type="button" id="profile-bubble-header-historie" className="profile-bubble-header" onClick={() => toggleProfileSection('historie')} aria-expanded={profileOpenSections.has('historie')} aria-controls="profile-bubble-body-historie">
                <span className="profile-bubble-title">Historie tréninků</span>
                <span className={`profile-bubble-chevron ${profileOpenSections.has('historie') ? 'open' : ''}`} aria-hidden>▼</span>
              </button>
              <div id="profile-bubble-body-historie" role="region" aria-labelledby="profile-bubble-header-historie" className="profile-bubble-body" data-open={profileOpenSections.has('historie')}>
            <section className="card history-section">
              <h2 className="section-head">Historie tréninků</h2>
              {workouts.length === 0 ? (
                <p className="empty-history">Zatím nemáš žádné záznamy. Klikni na „Zapsat trénink“ a první trénink se objeví zde i v přehledu.</p>
              ) : (
                <>
                  <ul className="workout-list" key={`workouts-${profile?._updated ?? 0}`}>
                    {(showAllWorkouts ? workouts : workouts.slice(0, 3)).map((w, idx) => {
                      const { userNotes } = parseWorkoutMetaFromNotes(w.notes);
                      const minutes = getWorkoutDurationMinutes(w);
                      const detailLabel = getWorkoutDetailLabel(w);
                      return (
                        <li key={w.id ?? `w-${idx}-${w.workout_date}`} className="workout-item">
                          <span className="workout-icon">{WORKOUT_TYPES.find((t) => t.id === (w.workout_type || '').toLowerCase())?.emoji || '🏋️'}</span>
                          <div className="workout-info">
                            <strong>{WORKOUT_TYPES.find((t) => t.id === (w.workout_type || '').toLowerCase())?.label || w.workout_name || 'Trénink'}</strong>
                            <span className="workout-meta">
                              {formatShortDate(w.workout_date)} · {minutes} min
                              {detailLabel ? ` · ${detailLabel}` : ''}
                              {userNotes ? ` · ${userNotes}` : ''}
                            </span>
                          </div>
                          <button type="button" onClick={() => handleDeleteWorkout(w.id)} className="workout-delete" title="Smazat">✕</button>
                        </li>
                      );
                    })}
                  </ul>
                  {workouts.length > 3 && (
                    <button type="button" className="workout-expand-btn" onClick={() => setShowAllWorkouts((v) => !v)}>
                      {showAllWorkouts ? 'Skrýt starší tréninky' : `Zobrazit starší tréninky (${workouts.length - 3})`}
                    </button>
                  )}
                </>
              )}
            </section>
              </div>
            </div>
            )}

            {/* Statistiky a progres – Varianta C: Statistiky + Vývoj váhy + Tvůj progres v jednom bloku s tabs */}
            {!profile?.can_create_calendar_events && (
            <div className="profile-bubble" id="statistiky">
              <button type="button" id="profile-bubble-header-statistiky" className="profile-bubble-header" onClick={() => toggleProfileSection('statistiky')} aria-expanded={profileOpenSections.has('statistiky')} aria-controls="profile-bubble-body-statistiky">
                <span className="profile-bubble-title">Statistiky a progres</span>
                <span className={`profile-bubble-chevron ${profileOpenSections.has('statistiky') ? 'open' : ''}`} aria-hidden>▼</span>
              </button>
              <div id="profile-bubble-body-statistiky" role="region" aria-labelledby="profile-bubble-header-statistiky" className="profile-bubble-body" data-open={profileOpenSections.has('statistiky')}>
              <div className="profile-bubble-tabs" role="tablist" aria-label="Sekce statistik">
                <button type="button" role="tab" aria-selected={statsTab === 'overview'} className={`profile-bubble-tab ${statsTab === 'overview' ? 'profile-bubble-tab--active' : ''}`} onClick={() => setStatsTab('overview')}>Přehled</button>
                <button type="button" role="tab" aria-selected={statsTab === 'weight'} className={`profile-bubble-tab ${statsTab === 'weight' ? 'profile-bubble-tab--active' : ''}`} onClick={() => setStatsTab('weight')}>Vývoj váhy</button>
                <button type="button" role="tab" aria-selected={statsTab === 'progress'} className={`profile-bubble-tab ${statsTab === 'progress' ? 'profile-bubble-tab--active' : ''}`} onClick={() => setStatsTab('progress')}>Progres</button>
              </div>
              {statsTab === 'overview' && (
            <section className="kpi-section">
              <h2 className="section-head">Přehled</h2>
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
              {statsTab === 'weight' && (
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
              {statsTab === 'progress' && (
            <section className="card card-accent center progress-section progress-detail-end">
              <h2 className="section-head">Tvůj progres</h2>
              <p className="progress-dates">Období: <strong>{periodStartFormatted}</strong> – <strong>{periodEndFormatted}</strong></p>
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
                <p className="progress-dates-detail">Tento týden ({weekStartFormatted}–{weekEndFormatted}): {workoutsThisWeek?.length ?? 0} tréninků, {totalMinutesThisWeek ?? 0} min. Dny: {thisWeekDates?.join(', ') || '—'}</p>
              )}
              {workouts.length === 0 && (
                <p className="progress-empty-hint">Zapiš tréninky – zde se pak objeví odhad kcal a váhy.</p>
              )}
              {workouts.length > 0 && (workoutsThisWeek?.length ?? 0) === 0 && (
                <p className="progress-total-hint">Tento týden zatím žádný trénink. Celkem <strong>{workouts.length}</strong> tréninků, <strong>{totalMinutes ?? 0}</strong> min.</p>
              )}
              {workoutTrend && (
                <p className="progress-trend-hint">
                  {workoutTrend === '↑' && 'Víc než minulý týden. '}
                  {workoutTrend === '↓' && 'Méně než minulý týden. '}
                  {workoutTrend === '→' && 'Stejně jako minulý týden. '}
                  Minulý týden: {lastWeekCount} tréninků, {lastWeekMinutes} min.
                </p>
              )}
              {startWeight != null || goalWeight != null ? (
                <>
                  <div className="progress-calc">
                    <p className="progress-calc-line">
                      <strong>~{Math.round(estimatedCaloriesAll)} kcal</strong> ≈ úbytek <strong>~{estimatedKgLostTotal.toFixed(1)} kg</strong>.
                    </p>
                    {estimatedCurrentWeightRounded != null && (
                      <>
                        <p className="progress-calc-line">
                          Z tréninků: <strong>{estimatedCurrentWeightRounded} kg</strong>
                          {startWeight != null && ` (výchozí ${startWeight} kg)`}.
                        </p>
                        {hasHabitData && habitAdjustedWeight != null && (
                          <p className="progress-calc-line progress-habit-line">
                            S návyky ({positiveDone}× zdravé, {negativeDone}× zlozvyky): <strong>{habitAdjustedWeight} kg</strong>.
                          </p>
                        )}
                      </>
                    )}
                    {goalWeight != null && estimatedCurrentWeight != null && estimatedCurrentWeight > goalWeight && (
                      <p className="progress-calc-line">
                        Do cíle <strong>{goalWeight} kg</strong> zbývá <strong>{(estimatedCurrentWeight - goalWeight).toFixed(1)} kg</strong>
                        {weeksToGoal != null && weeksToGoal > 0 && (
                          <> · odhad <strong>{weeksToGoal.toFixed(0)} týdnů</strong></>
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
                  Cílovou váhu doplň v <strong>„Nastavení pro výpočet“</strong>.
                </p>
              )}
            </section>
              )}
              </div>
            </div>
            )}

            </div>
            {/* konec profile-bubbles */}

            {/* Modaly */}
            {showWorkoutModal && renderPortal(
              <div className="modal-overlay" onClick={() => { setShowWorkoutModal(false); setWorkoutError(''); setWorkoutModalAnchor(null); }}>
                <div className="modal modal-workout" style={workoutModalAnchor || undefined} onClick={(e) => e.stopPropagation()}>
                  <h3>Zapsat trénink</h3>
                  <form onSubmit={handleAddWorkout}>
                    <label>Datum</label>
                    <div className="modal-date-wrap">
                      <input
                        ref={workoutDateInputRef}
                        type="date"
                        id="workout-date-input"
                        value={workoutForm.workout_date}
                        onChange={(e) => setWorkoutForm((f) => ({ ...f, workout_date: e.target.value }))}
                        min={getLocalDateStr(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))}
                        max={getLocalDateStr(new Date())}
                        required
                        className="modal-date-input"
                      />
                      <button
                        type="button"
                        className="modal-date-calendar-btn"
                        onClick={() => { try { workoutDateInputRef.current?.showPicker?.(); } catch (_) { workoutDateInputRef.current?.focus(); } }}
                        title="Otevřít kalendář"
                        aria-label="Otevřít kalendář"
                      >
                        📅
                      </button>
                    </div>
                    <label>Typ</label>
                    <select
                      value={workoutForm.workout_type}
                      onChange={(e) => setWorkoutForm((f) => ({
                        ...f,
                        workout_type: e.target.value,
                        distance_m: e.target.value === 'plavani' ? f.distance_m : '',
                        distance_km: ['beh', 'kolo', 'chuze', 'nordic_walking', 'brusleni', 'lyzovani'].includes(e.target.value) ? f.distance_km : '',
                      }))}
                    >
                      {WORKOUT_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
                      ))}
                    </select>
                    <label>Délka (min)</label>
                    <input type="number" min={1} value={workoutForm.duration_min} onChange={(e) => setWorkoutForm((f) => ({ ...f, duration_min: Number(e.target.value) || 0 }))} />
                    {workoutForm.workout_type === 'plavani' && (
                      <>
                        <label>Počet metrů</label>
                        <input
                          type="number"
                          min={25}
                          step={25}
                          value={workoutForm.distance_m}
                          onChange={(e) => setWorkoutForm((f) => ({ ...f, distance_m: e.target.value }))}
                          placeholder="např. 1000"
                        />
                      </>
                    )}
                    {['beh', 'kolo', 'chuze', 'nordic_walking', 'brusleni', 'lyzovani'].includes(workoutForm.workout_type) && (
                      <>
                        <label>Vzdálenost (km)</label>
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={workoutForm.distance_km}
                          onChange={(e) => setWorkoutForm((f) => ({ ...f, distance_km: e.target.value }))}
                          placeholder="např. 5.5"
                        />
                      </>
                    )}
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
                      <button type="button" onClick={() => { setShowWorkoutModal(false); setWorkoutError(''); setWorkoutModalAnchor(null); }} disabled={savingWorkout}>Zrušit</button>
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
            {showPreferencesModal && renderPortal(
              <div className="modal-overlay" onClick={() => { if (!savingPreferences) { setShowPreferencesModal(false); setPreferencesError(''); setPreferencesModalAnchor(null); } }}>
                <div className="modal modal-preferences" style={preferencesModalAnchor || undefined} onClick={(e) => e.stopPropagation()}>
                  <h3>Upravit preference</h3>
                  <p className="modal-hint">Změny uložíme a podle toho přegenerujeme plán. Při změně <strong>jen stravy</strong> (typ stravy, co nejí) se změní pouze <strong>jídelníček</strong> – rozvrh tréninků (který den odpočinek, který trénink) zůstane. Při změně aktivity nebo cíle se přegeneruje celý plán. Zapsané tréninky zůstanou zachovány.</p>
                  <form onSubmit={handleSavePreferences}>
                    <div className="preferences-section">
                      <h4 className="preferences-section-title">Aktivita a cíl</h4>
                      <div className="preferences-grid">
                        <div>
                          <label>Úroveň aktivity <span className="label-hint">(současný stav)</span></label>
                          <select value={preferencesForm.activity} onChange={(e) => setPreferencesForm((f) => ({ ...f, activity: e.target.value }))}>
                            <option value="">Vyber</option>
                            <option value="Nízká">Nízká</option>
                            <option value="Střední">Střední</option>
                            <option value="Vysoká">Vysoká</option>
                          </select>
                        </div>
                        <div>
                          <label>Míra stresu</label>
                          <select value={preferencesForm.stress_level} onChange={(e) => setPreferencesForm((f) => ({ ...f, stress_level: e.target.value }))}>
                            <option value="">Vyber</option>
                            <option value="low">Nízká</option>
                            <option value="medium">Střední</option>
                            <option value="high">Vysoká</option>
                          </select>
                        </div>
                        <div>
                          <label>Typ práce</label>
                          <select value={preferencesForm.occupation} onChange={(e) => setPreferencesForm((f) => ({ ...f, occupation: e.target.value }))}>
                            <option value="">Vyber</option>
                            <option value="Sedavé zaměstnání">Sedavé zaměstnání</option>
                            <option value="Aktivní zaměstnání">Aktivní zaměstnání</option>
                            <option value="Kombinované">Kombinované</option>
                          </select>
                        </div>
                        <div>
                          <label>Cíl</label>
                          <select value={preferencesForm.goal} onChange={(e) => setPreferencesForm((f) => ({ ...f, goal: e.target.value }))}>
                            <option value="">Vyber</option>
                            <option value="Redukce hmotnosti">Redukce hmotnosti</option>
                            <option value="Nárůst svalů">Nárůst svalů</option>
                            <option value="Zdravý životní styl">Zdravý životní styl</option>
                          </select>
                        </div>
                        <div>
                          <label>Frekvence cvičení</label>
                          <select value={preferencesForm.freq_choice || preferencesForm.frequency} onChange={(e) => setPreferencesForm((f) => ({ ...f, freq_choice: e.target.value, frequency: e.target.value }))}>
                            <option value="">Vyber</option>
                            <option value="1-2x týdně">1–2x týdně</option>
                            <option value="2-3x týdně">2–3x týdně</option>
                            <option value="4-5x týdně">4–5x týdně</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="preferences-section-title">Cvičím v tyto dny</label>
                        <p className="preferences-workout-days-hint">Vyber dny, kdy chceš mít trénink v plánu. Ostatní dny budou odpočinek nebo lehká procházka.</p>
                        <div className="preferences-workout-days">
                          {WORKOUT_DAY_LABELS.map(({ v, label }) => (
                            <label key={v} className="preferences-workout-day-check">
                              <input
                                type="checkbox"
                                checked={preferencesForm.workout_days.includes(v)}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...preferencesForm.workout_days, v].sort((a, b) => a - b)
                                    : preferencesForm.workout_days.filter((d) => d !== v);
                                  setPreferencesForm((f) => ({ ...f, workout_days: next }));
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="preferences-section">
                      <h4 className="preferences-section-title">Strava a omezení</h4>
                      <div>
                        <label>Typ stravy</label>
                        <select value={preferencesForm.diet_type} onChange={(e) => setPreferencesForm((f) => ({ ...f, diet_type: e.target.value }))}>
                          <option value="">Žádná preference</option>
                          <option value="vegetarian">Vegetarián</option>
                          <option value="vegan">Vegan</option>
                          <option value="gluten_free">Bez lepku</option>
                          <option value="lactose_free">Bez laktózy</option>
                          <option value="paleo">Paleo</option>
                          <option value="low_carb">Nízkosacharidová</option>
                          <option value="other">Jiné</option>
                        </select>
                      </div>
                      <div>
                        <label>Co nejí – alergie, intolerance</label>
                        <textarea rows={2} placeholder="např. ořechy, mléko, lepek…" value={preferencesForm.dietary_restrictions} onChange={(e) => setPreferencesForm((f) => ({ ...f, dietary_restrictions: e.target.value }))} />
                      </div>
                      <div>
                        <label>Potraviny k vynechání z jídelníčku</label>
                        <textarea rows={2} placeholder="např. avokádo, brokolice, banány…" value={preferencesForm.foods_to_avoid} onChange={(e) => setPreferencesForm((f) => ({ ...f, foods_to_avoid: e.target.value }))} />
                      </div>
                    </div>
                    <div className="preferences-section">
                      <h4 className="preferences-section-title">Denní návyky</h4>
                      <HabitSelection selectedIds={preferencesForm.selected_habits} onChange={(ids) => setPreferencesForm((f) => ({ ...f, selected_habits: ids }))} />
                    </div>
                    {preferencesError && <p className="modal-error" role="alert">{preferencesError}</p>}
                    {savingPreferences && (
                      <div className="modal-loading">
                        <div className="loading-spinner"></div>
                        <span>Ukládám a přegenerovávám plán… Může to trvat až minutu.</span>
                      </div>
                    )}
                    <div className="modal-actions">
                      <button type="button" onClick={() => { if (!savingPreferences) { setShowPreferencesModal(false); setPreferencesError(''); setPreferencesModalAnchor(null); } }} disabled={savingPreferences}>Zrušit</button>
                      <button type="submit" disabled={savingPreferences || preferencesForm.selected_habits.length === 0} className={savingPreferences ? 'loading' : ''}>
                        {savingPreferences ? (<><span className="button-spinner"></span> Ukládám…</>) : 'Uložit a přegenerovat plán'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {showSettingsModal && renderPortal(
              <div className="modal-overlay" onClick={() => { setShowSettingsModal(false); setSettingsError(''); }}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Nastavení pro výpočet</h3>
                  <p className="modal-hint">Výchozí váha a výška se berou z tvé registrace (Start) – nevyplňuj je znovu. Zde můžeš doplnit jen <strong>cílovou váhu</strong> pro odhad „týdny do cíle“. Žádná ruční váha do výpočtu nezasahuje.</p>
                  <form onSubmit={handleSaveSettings}>
                    <label>Cílová váha (kg)</label>
                    <input type="number" min={30} max={300} step={0.1} placeholder="např. 75" value={settingsForm.goal_weight_kg} onChange={(e) => setSettingsForm((f) => ({ ...f, goal_weight_kg: e.target.value }))} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={settingsForm.daily_email !== false} onChange={(e) => setSettingsForm((f) => ({ ...f, daily_email: e.target.checked }))} />
                      <span>Posílat denní přehled e-mailem</span>
                    </label>
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
            {showDeleteAccountModal && renderPortal(
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
          padding: 0 20px 100px;
          background: transparent;
          color: #fff;
          font-family: Inter, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          position: relative;
          overflow-x: hidden;
        }
        .page-bg-decor {
          position: fixed;
          inset: 0;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
          background-color: #0a0a0f;
          background-image:
            linear-gradient(180deg, rgba(10,10,15,0.75) 0%, rgba(10,10,15,0.65) 50%, rgba(10,10,15,0.78) 100%),
            url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1920&q=80');
          background-size: cover;
          background-position: center;
        }
        .page-bg-decor::before,
        .page-bg-decor::after {
          content: '';
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.35;
        }
        .page-bg-decor::before {
          width: 550px;
          height: 550px;
          background: radial-gradient(circle, rgba(139, 92, 255, 0.5) 0%, transparent 65%);
          top: -180px;
          right: -120px;
        }
        .page-bg-decor::after {
          width: 450px;
          height: 450px;
          background: radial-gradient(circle, rgba(34, 197, 94, 0.2) 0%, transparent 65%);
          bottom: -120px;
          left: -100px;
        }
        .page-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.25;
        }
        .page-bg-orb--center {
          width: 350px;
          height: 350px;
          background: radial-gradient(circle, rgba(124, 58, 237, 0.4) 0%, transparent 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .page > *:not(.page-bg-decor) {
          position: relative;
          z-index: 1;
        }

        /* ── TOP profil: jeden hero panel, profil úplně napravo ── */
        .profile-hero {
          margin-bottom: 24px;
          padding: 0 24px;
          max-width: 1180px;
          margin-left: auto;
          margin-right: auto;
        }
        .profile-hero-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 28px;
          flex-wrap: wrap;
          padding: 26px 34px 30px;
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(109,40,217,0.28), rgba(59,130,246,0.18));
          border: 1px solid rgba(139,92,255,0.45);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 4px 20px rgba(109,40,217,0.12);
        }
        .profile-hero--with-program .profile-hero-main {
          margin-left: auto;
          justify-content: flex-end;
          width: min(620px, 100%);
          flex-shrink: 0;
        }
        .profile-hero--centered .profile-hero-inner {
          justify-content: center;
          text-align: center;
        }
        .profile-hero-brand {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          flex-shrink: 0;
        }
        .profile-hero-brand-label {
          font-size: 42px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.9);
          letter-spacing: -0.02em;
          line-height: 1.05;
          font-family: Inter, system-ui, sans-serif;
        }
        .profile-hero-brand-welcome {
          font-size: 16px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.75);
          letter-spacing: 0.01em;
          font-family: Inter, system-ui, sans-serif;
        }
        .profile-hero-main {
          display: flex;
          align-items: center;
          gap: 24px;
          min-width: 0;
        }
        .profile-hero-avatar-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .profile-hero-avatar-btn {
          width: 88px;
          height: 88px;
          border-radius: 50%;
          border: 3px solid rgba(167, 139, 250, 0.4);
          padding: 0;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.2);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.25s, transform 0.2s, box-shadow 0.25s;
        }
        .profile-hero-avatar-btn:hover {
          border-color: rgba(196, 181, 253, 0.8);
          transform: scale(1.03);
          box-shadow: 0 0 32px rgba(139, 92, 246, 0.35);
        }
        .profile-hero-avatar,
        .profile-hero-avatar-placeholder {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .profile-hero-avatar-placeholder {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #5b4d7a, #4a3b6c);
          color: #c4b5fd;
          font-size: 36px;
          font-weight: 700;
        }
        .profile-hero-avatar-change {
          font-size: 12px;
          color: #94a3b8;
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
          padding: 0;
        }
        .profile-hero-avatar-change:hover:not(:disabled) { color: #c4b5fd; }
        .profile-hero-avatar-change:disabled { opacity: 0.7; cursor: wait; }
        .profile-hero-avatar-error { margin: 0; font-size: 12px; color: #fca5a5; text-align: center; }
        .profile-hero-copy {
          min-width: 0;
          text-align: left;
        }
        .profile-hero--centered .profile-hero-copy { text-align: center; }
        .profile-hero-welcome {
          margin: 0 0 6px;
          font-size: 16px;
          font-weight: 600;
          color: #c4b5fd;
          letter-spacing: 0;
        }
        .profile-hero-program {
          margin: 0 0 8px;
          font-size: 13px;
          font-weight: 600;
          color: #e9d5ff;
          opacity: 0.9;
        }
        .profile-hero-title {
          margin: 0 0 10px;
          font-size: clamp(30px, 4vw, 42px);
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.03em;
          line-height: 1.08;
        }
        .profile-hero-title > span {
          background: linear-gradient(135deg, #e9d5ff, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .profile-hero-tagline {
          margin: 0;
          font-size: 16px;
          color: #e2e8f0;
          line-height: 1.45;
        }
        .profile-hero-date {
          margin: 12px 0 0;
          font-size: 13px;
          color: rgba(148, 163, 184, 0.85);
          font-weight: 500;
          text-transform: capitalize;
        }

        .profile-membership-plan-card {
          margin-bottom: 28px;
          padding: 22px 24px 28px;
          border-radius: 20px;
          border: 1px solid;
          display: flex;
          flex-direction: column;
          gap: 0;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          max-width: 1180px;
          margin-left: auto;
          margin-right: auto;
        }
        .profile-membership-plan-card.membership-card--start {
          background: linear-gradient(135deg, rgba(100,116,139,0.25), rgba(71,85,105,0.18));
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-color: rgba(100,116,139,0.35);
        }
        .profile-membership-plan-card.membership-card--on-club {
          background: linear-gradient(135deg, rgba(109,40,217,0.28), rgba(59,130,246,0.18));
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-color: rgba(139,92,255,0.45);
          box-shadow: 0 4px 20px rgba(109,40,217,0.12);
        }
        .profile-membership-plan-card.membership-card--vip {
          background: linear-gradient(135deg, rgba(180,130,20,0.28), rgba(234,179,8,0.18));
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-color: rgba(234,179,8,0.45);
          box-shadow: 0 4px 20px rgba(180,130,20,0.18);
        }
        .membership-card-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: nowrap;
        }
        .membership-card-nav-wrap {
          flex: 1;
          min-width: 0;
        }
        .profile-quick-nav {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 8px;
          margin-top: 0;
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
        }
        .membership-card-right {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }
        .profile-main-workout-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid rgba(139, 92, 255, 0.55);
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.92), rgba(139, 92, 246, 0.86));
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s, filter 0.2s, box-shadow 0.2s;
          white-space: nowrap;
          box-shadow: 0 8px 20px rgba(109, 40, 217, 0.28);
        }
        .profile-main-workout-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
          box-shadow: 0 12px 22px rgba(109, 40, 217, 0.35);
        }
        .profile-main-workout-btn-emoji {
          font-size: 14px;
          line-height: 1;
        }
        .membership-status-block {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          white-space: nowrap;
        }
        .profile-quick-nav-account {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 8px;
        }
        .profile-quick-nav-btn {
          padding: 9px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.07);
          color: #e2e8f0;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, transform 0.2s;
        }
        .profile-quick-nav-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.28);
          transform: translateY(-1px);
        }
        .profile-quick-nav-btn-danger {
          border-color: rgba(239, 68, 68, 0.5);
          color: #fca5a5;
          font-size: 12px;
        }
        .profile-quick-nav-btn-danger:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.7);
        }
        .plan-goal-in-card {
          padding-top: 22px;
          margin-top: 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .plan-goal-row {
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 18px;
        }
        .plan-goal-text-col {
          text-align: center;
          flex: 1;
          min-width: 200px;
        }
        .plan-goal-stats {
          display: flex;
          align-items: center;
          gap: 28px;
          flex-wrap: wrap;
          padding: 14px 24px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          flex: 1;
          justify-content: center;
          min-width: 280px;
        }
        .plan-goal-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          min-width: 80px;
        }
        .plan-goal-stat-value {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
        }
        .plan-goal-stat-value .trend-arrow { color: #fbbf24; }
        .plan-goal-stat-label {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
          line-height: 1.2;
        }
        .plan-goal-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 230px;
        }
        .plan-goal-hero-title {
          margin: 0 0 12px;
          font-size: 22px;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);
          line-height: 1.3;
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

        /* ── Rozbalovací bubliny profilu (oválné, centrované) ── */
        .profile-bubbles {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
          padding: 0 16px;
          max-width: 1180px;
          margin-left: auto;
          margin-right: auto;
        }
        .profile-bubble {
          width: 100%;
          max-width: 380px;
          border-radius: 50px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: linear-gradient(145deg, rgba(36, 36, 52, 0.55), rgba(24, 24, 36, 0.5));
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s, max-width 0.35s ease, border-radius 0.3s ease;
        }
        .profile-bubble:has(.profile-bubble-body[data-open="true"]) {
          max-width: 100%;
          border-radius: 20px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
        }
        .profile-bubble:hover {
          border-color: rgba(255, 255, 255, 0.22);
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
        }
        .profile-bubble-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px 24px;
          background: transparent;
          border: none;
          color: #f1f5f9;
          font-size: 1.05rem;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          transition: background 0.2s;
        }
        .profile-bubble-header:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .profile-bubble-title {
          flex: 1;
          text-align: center;
        }
        .profile-bubble:has(.profile-bubble-body[data-open="true"]) .profile-bubble-header {
          justify-content: space-between;
          text-align: left;
        }
        .profile-bubble:has(.profile-bubble-body[data-open="true"]) .profile-bubble-title {
          text-align: left;
        }
        .profile-bubble-chevron {
          flex-shrink: 0;
          font-size: 0.65rem;
          color: #94a3b8;
          opacity: 0.8;
          transition: transform 0.25s ease;
        }
        .profile-bubble:not(:has(.profile-bubble-body[data-open="true"])) .profile-bubble-chevron {
          display: none;
        }
        .profile-bubble-chevron.open {
          transform: rotate(180deg);
        }
        .profile-bubble-body {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.4s ease-out;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .profile-bubble-body[data-open="true"] {
          max-height: 5000px;
          padding: 0 20px 20px;
          box-sizing: border-box;
        }
        .profile-bubble-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 16px;
          padding: 4px 0 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }
        .profile-bubble-tab {
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.6);
          background: none;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: color 0.2s, background 0.2s;
        }
        .profile-bubble-tab:hover {
          color: rgba(255, 255, 255, 0.85);
        }
        .profile-bubble-tab--active {
          color: #e2e8f0;
          background: rgba(139, 92, 246, 0.25);
        }

        .hero {
          text-align: center;
          margin-bottom: 48px;
          max-width: 1180px;
          margin-left: auto;
          margin-right: auto;
        }
        .hero.hero--empty {
          margin-bottom: 0;
        }
        .hero.hero--empty .hero-avatar-wrap {
          display: none;
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
        .hero-prefs-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 14px 24px;
          border-radius: 14px;
          border: 1px solid rgba(139, 92, 255, 0.35);
          background: linear-gradient(135deg, rgba(109, 40, 217, 0.18), rgba(59, 130, 246, 0.08));
          color: #e2e8f0;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          transition: background 0.2s, border-color 0.2s, transform 0.2s;
        }
        .hero-prefs-btn:hover {
          background: linear-gradient(135deg, rgba(109, 40, 217, 0.28), rgba(59, 130, 246, 0.12));
          border-color: rgba(139, 92, 255, 0.5);
          transform: translateY(-1px);
        }
        .hero-prefs-emoji { font-size: 18px; }
        .hero-prefs-sublabel { font-size: 12px; font-weight: 400; color: #94a3b8; }
        .plan-goal-prefs-btn {
          width: 100%;
          max-width: 260px;
          min-height: 108px;
          justify-content: center;
        }
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
        .trial-banner {
          margin-bottom: 20px;
          width: 100%;
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid;
        }
        .trial-banner--expired {
          background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(185,28,28,0.08));
          border-color: rgba(239,68,68,0.4);
        }
        .trial-banner--soon {
          background: linear-gradient(135deg, rgba(234,179,8,0.15), rgba(180,130,20,0.08));
          border-color: rgba(234,179,8,0.4);
        }
        .trial-banner-text {
          margin: 0 0 12px;
          font-size: 15px;
          color: #e2e8f0;
          line-height: 1.5;
        }
        .trial-banner-text:last-child { margin-bottom: 0; }
        .trial-banner-text a { color: #a78bfa; text-decoration: none; }
        .trial-banner-text a:hover { text-decoration: underline; }
        .trial-banner-text--small { font-size: 13px; color: #94a3b8; margin-top: 12px; }
        .trial-banner-stripe { margin: 16px 0; width: 100%; display: flex; justify-content: center; }
        .trial-banner-upgrade { margin-top: 28px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.12); }
        .trial-banner-upgrade-headline {
          font-size: 17px; font-weight: 700; color: #f1f5f9; margin: 0 0 20px; text-align: center; letter-spacing: 0.02em;
        }
        .trial-banner-upgrade-cards {
          display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: 100%;
        }
        @media (max-width: 640px) {
          .trial-banner-upgrade-cards { grid-template-columns: 1fr; }
        }
        .trial-upgrade-card {
          display: block; text-decoration: none; padding: 24px 20px; border-radius: 16px; border: 2px solid transparent;
          transition: transform 0.2s ease, box-shadow 0.2s ease; position: relative; text-align: center;
        }
        .trial-upgrade-card:hover {
          transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.35);
        }
        .trial-upgrade-card--club {
          background: rgba(24,24,36,0.95);
          border-color: rgba(34,197,94,0.5);
          box-shadow: 0 8px 24px rgba(34,197,94,0.2);
        }
        .trial-upgrade-card--club:hover { box-shadow: 0 12px 32px rgba(34,197,94,0.35); }
        .trial-upgrade-card--vip {
          background: rgba(24,24,36,0.95);
          border-color: rgba(239,68,68,0.5);
          box-shadow: 0 8px 24px rgba(239,68,68,0.2);
        }
        .trial-upgrade-card--vip:hover { box-shadow: 0 12px 32px rgba(239,68,68,0.35); }
        .trial-upgrade-badge {
          position: absolute; top: 12px; right: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; color: #fff; background: linear-gradient(90deg, #1e40af, #0ea5e9); padding: 4px 10px; border-radius: 20px;
        }
        .trial-upgrade-title {
          font-size: 22px; font-weight: 800; color: #fff; margin: 0 0 8px; letter-spacing: 0.02em;
        }
        .trial-upgrade-subtitle {
          font-size: 13px; color: rgba(255,255,255,0.88); line-height: 1.45; margin: 0 0 16px; min-height: 2.9em;
        }
        .trial-upgrade-price {
          display: block; font-size: 18px; font-weight: 700; margin-bottom: 12px;
        }
        .trial-upgrade-card--club .trial-upgrade-price { color: #22c55e; }
        .trial-upgrade-card--vip .trial-upgrade-price { color: #ef4444; }
        .trial-upgrade-cta {
          display: inline-block; font-size: 14px; font-weight: 600; color: #fff;
          padding: 10px 18px; border-radius: 10px;
          transition: filter 0.2s ease, box-shadow 0.2s ease;
        }
        .trial-upgrade-card--club .trial-upgrade-cta { background: #22c55e; }
        .trial-upgrade-card--club:hover .trial-upgrade-cta { filter: brightness(1.1); box-shadow: 0 0 16px rgba(34,197,94,0.5); }
        .trial-upgrade-card--vip .trial-upgrade-cta { background: #dc2626; }
        .trial-upgrade-card--vip:hover .trial-upgrade-cta { filter: brightness(1.1); box-shadow: 0 0 16px rgba(239,68,68,0.5); }
        .trial-banner-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .trial-banner-btn {
          display: inline-block;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          background: linear-gradient(135deg, #7c3aed, #6d28d9);
          color: #fff;
          border: none;
        }
        .trial-banner-btn:hover { opacity: 0.9; }
        .trial-banner-btn--vip {
          background: linear-gradient(135deg, #ca8a04, #a16207);
        }
        .membership-card-left {
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 1;
          min-width: 0;
        }
        .membership-card-left > div {
          flex: 1;
          min-width: 0;
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
          margin-bottom: 28px;
          padding: 20px 24px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(99, 102, 241, 0.08));
          border: 1px solid rgba(139, 92, 255, 0.25);
          border-radius: 16px;
          text-align: center;
          max-width: 520px;
          margin-left: auto;
          margin-right: auto;
        }
        .first-action-banner-lead {
          margin: 0 0 8px;
          font-size: 17px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .first-action-banner-text {
          margin: 0;
          font-size: 14px;
          color: #c4b5fd;
          line-height: 1.55;
        }
        .first-action-banner strong { color: #e9d5ff; font-weight: 600; }

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
          margin: 0 0 28px;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          max-width: 1180px;
          margin-left: auto;
          margin-right: auto;
        }
        .btn-refresh, .btn-send-plan {
          padding: 10px 18px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, color 0.2s;
        }
        .btn-refresh:hover:not(:disabled), .btn-send-plan:hover:not(:disabled) {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
          color: #c4b5fd;
        }
        .btn-refresh:disabled, .btn-send-plan:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-next-week { border-color: rgba(155, 92, 255, 0.4); color: #c4b5fd; }
        .btn-next-week:hover:not(:disabled) { background: rgba(139, 92, 255, 0.12); }

        .plan-next-week-preview { margin-bottom: 24px; }
        .plan-next-week-summary {
          padding: 14px 18px;
          cursor: pointer;
          font-weight: 600;
          color: #c4b5fd;
          font-size: 15px;
          list-style: none;
          border-radius: 12px;
          background: rgba(124, 58, 237, 0.12);
        }
        .plan-next-week-summary::-webkit-details-marker { display: none; }
        .plan-next-week-preview[open] .plan-next-week-summary { border-radius: 12px 12px 0 0; }

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
        .trainer-schedule-lead-how { margin-top: -4px; }
        .trainer-schedule-lead-how a { color: #a78bfa; text-decoration: none; }
        .trainer-schedule-lead-how a:hover { text-decoration: underline; }
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
          align-items: flex-start;
          justify-content: center;
          z-index: 1000;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: max(16px, env(safe-area-inset-top)) 20px 20px;
        }
        .modal {
          background: #1a1a2e;
          border-radius: 20px;
          padding: 28px;
          max-width: 400px;
          width: 100%;
          align-self: flex-start;
          border: 1px solid #333;
          margin: 0 auto auto;
          max-height: calc(100vh - max(32px, env(safe-area-inset-top)) - 20px);
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        .modal-preferences { max-width: 520px; max-height: 90vh; overflow-y: auto; }
        .preferences-section { margin-bottom: 24px; }
        .preferences-section:last-of-type { margin-bottom: 0; }
        .preferences-section-title { margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #e2e8f0; }
        .preferences-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
        @media (max-width: 480px) { .preferences-grid { grid-template-columns: 1fr; } }
        .preferences-section .modal label { margin-top: 8px; }
        .preferences-section .modal label:first-child { margin-top: 0; }
        .preferences-section textarea { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #444; background: #0f0f1a; color: #fff; font-family: inherit; resize: vertical; }
        .preferences-workout-days-hint { margin: 4px 0 10px; font-size: 13px; color: #64748b; }
        .preferences-workout-days { display: flex; flex-wrap: wrap; gap: 10px 16px; }
        .preferences-workout-day-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; color: #e2e8f0; margin: 0; }
        .preferences-workout-day-check input { width: 18px; height: 18px; accent-color: #7c3aed; }
        .modal h3 { margin: 0 0 20px; }
        .modal label { display: block; margin: 12px 0 4px; color: #94a3b8; font-size: 14px; }
        .label-hint { font-weight: 400; color: #64748b; font-size: 12px; }
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
        .modal-date-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .modal-date-input {
          flex: 1;
          min-width: 0;
        }
        .modal-date-calendar-btn {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid #444;
          background: #0f0f1a;
          color: #c4b5fd;
          font-size: 1.25rem;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .modal-date-calendar-btn:hover {
          background: rgba(139, 92, 255, 0.2);
          border-color: rgba(139, 92, 255, 0.4);
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

        @media (max-width: 640px) {
          .page { padding: 0 12px 80px; width: 100%; box-sizing: border-box; }
          .profile-hero { padding: 0; max-width: 100%; }
          .profile-membership-plan-card { margin-left: 0; margin-right: 0; max-width: 100%; }
          .profile-bubbles { max-width: 100%; }
          .profile-bubble-body { padding-left: 12px; padding-right: 12px; }
          .progress-section, .progress-detail-end { padding: 18px 16px; margin-left: -4px; margin-right: -4px; border-radius: 14px; }
          .progress-lead, .progress-period-hint { font-size: 14px; line-height: 1.5; }
          .progress-dates { font-size: 14px; margin-bottom: 16px; }
          .progress-activity { gap: 16px 24px; padding: 18px 14px; margin-bottom: 20px; }
          .progress-big-num { font-size: 22px; }
          .progress-big-label { font-size: 12px; }
          .progress-calc { padding: 14px 16px; margin: 16px 0 12px; }
          .progress-calc-line { font-size: 13px; }
          .body-figures-row { gap: 16px; margin: 20px 0 10px; flex-direction: column; }
          .body-figure-arrow { transform: rotate(90deg); }
          .kpis-bar { padding: 14px 12px; gap: 0 8px; }
          .kpi-item { min-width: 72px; padding: 6px 4px; }
          .kpis-bar .kpi-num { font-size: 16px; }
          .kpis-bar .kpi-label, .kpis-bar .kpi-sub { font-size: 11px; }
          .kpi-divider { min-height: 40px; }
          .section-head { font-size: 1.25rem; }
          .modal-overlay {
            padding: 0;
            align-items: flex-start;
            justify-content: center;
            padding-top: env(safe-area-inset-top);
            overflow-y: auto;
            overscroll-behavior: contain;
          }
          .modal {
            max-width: 100%; width: 100%; border-radius: 16px;
            padding: 24px 20px; padding-bottom: max(28px, env(safe-area-inset-bottom));
            margin: 0;
            max-height: calc(100vh - env(safe-area-inset-top) - 8px);
            display: flex; flex-direction: column;
            flex-shrink: 0;
          }
          .modal form { display: flex; flex-direction: column; flex: 1; min-height: 0; }
          .modal .modal-actions {
            position: sticky; bottom: 0;
            background: #1a1a2e;
            margin-left: -20px; margin-right: -20px; margin-bottom: -24px;
            padding: 16px 20px max(20px, env(safe-area-inset-bottom)) 20px;
            border-top: 1px solid #334155;
            flex-shrink: 0;
          }
          .modal-preferences { max-height: 96vh; }
          .modal-preferences form { overflow-y: auto; -webkit-overflow-scrolling: touch; }
          .profile-hero { margin-bottom: 20px; }
          .profile-hero-inner { flex-direction: column; align-items: stretch; padding: 24px 20px 28px; gap: 24px; text-align: center; }
          .profile-hero--with-program .profile-hero-brand { justify-content: center; }
          .profile-hero-brand-label { font-size: 34px; }
          .profile-hero--with-program .profile-hero-main { margin-left: 0; width: 100%; justify-content: center; }
          .profile-hero-main { flex-direction: column; align-items: center; text-align: center; }
          .profile-hero-copy { text-align: center; }
          .profile-hero-welcome { font-size: 16px; }
          .profile-hero-avatar-btn { width: 80px; height: 80px; }
          .profile-hero-avatar-placeholder { font-size: 32px; }
          .profile-hero-title { font-size: 34px; line-height: 1.1; }
          .profile-hero-tagline { font-size: 15px; }
          .hero-intro { font-size: 16px; }
          .profile-membership-plan-card { padding: 18px 16px 22px; }
          .membership-card-row { flex-direction: column; align-items: stretch; gap: 20px; }
          .membership-card-left { flex-wrap: wrap; }
          .membership-card-right { align-items: stretch; }
          .profile-main-workout-btn { justify-content: center; width: 100%; }
          .membership-status-block { align-items: flex-start; }
          .profile-quick-nav-account { flex-wrap: wrap; }
          .profile-quick-nav-btn { width: 100%; justify-content: center; }
          .plan-goal-row { flex-direction: column; gap: 20px; padding: 16px; }
          .plan-goal-stats { justify-content: center; gap: 16px; padding: 12px 16px; }
          .plan-goal-stat { min-width: 0; }
          .plan-goal-stat-label { font-size: 10px; }
          .plan-goal-actions { width: 100%; min-width: 0; }
          .plan-goal-prefs-btn { max-width: 100%; min-height: 0; }
          .action-buttons { gap: 10px; }
        }
        @media (max-width: 480px) {
          .page { padding: 0 10px 80px; }
        }
        @media (max-width: 380px) {
          .page { padding: 0 8px 80px; }
          .progress-big-num { font-size: 20px; }
          .kpi-item { min-width: 64px; }
        }
      `}</style>
    </>
  );
}