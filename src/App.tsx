import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { UserProfileCard } from './components/UserProfileCard';
import { AICoachBanner } from './components/AICoachBanner';
import { NavigationTabs, ActiveTab } from './components/NavigationTabs';
import { QuickActionToolbar } from './components/QuickActionToolbar';
import { OverviewBentoGrid } from './components/OverviewBentoGrid';
import { ProfileSection } from './components/ProfileSection';
import { BodyCompositionSection } from './components/BodyCompositionSection';
import { NutritionSection } from './components/NutritionSection';
import { WorkoutSection } from './components/WorkoutSection';
import { BiometricsSection } from './components/BiometricsSection';

// Modals
import { MealPlanModal } from './components/MealPlanModal';
import { RecipeModal } from './components/RecipeModal';
import { ShoppingListModal } from './components/ShoppingListModal';
import { ExportMealPlanModal } from './components/ExportMealPlanModal';
import { WeeklyWorkoutModal } from './components/WeeklyWorkoutModal';
import { WorkoutLoggerModal } from './components/WorkoutLoggerModal';
import { WithingsSyncModal } from './components/WithingsSyncModal';
import { AddMeasurementModal } from './components/AddMeasurementModal';
import { PreferencesModal } from './components/PreferencesModal';
import { CoachChatModal } from './components/CoachChatModal';
import { LoginScreen } from './components/LoginScreen';

// Kontexty, perzistence a synchronizace
import { AuthProvider, useAuth } from './context/AuthContext';
import { StartRegistrace } from './components/registrace/StartRegistrace';
import { naviguj, useCesta } from './routing';
import { useProfilData } from './hooks/useProfilData';
import { useZdravotniData } from './hooks/useZdravotniData';
import { naBiometrii, maZdravotniData } from './data/adapteryZdravi';
import {
  dnesekPraha, dnesniNavyky, mnozinaDokonceni, naJidla, naNakupniSeznam, naNavyky,
  naPreference, naProfil, naTreninky, naVazeni, naZlozvyky, pouzijDokonceni,
  pouzijDokonceniTreninku, vyberPlan
} from './data/adaptery';
import { ToastProvider, useToast } from './context/ToastContext';
import { useLocalStorage } from './hooks/useLocalStorage';
// buildSyncedBiometrics a buildSyncedWeightRecord se uz nepouzivaji — hodnoty
// si dopocitavaly v prohlizeci (mean-revert HRV k baseline), takze uzivatel
// videl vymyslene zdravotni udaje. Data ted chodi z /api/health/recovery.
import { applyWeightRecord, formatLastSynced } from './lib/syncEngine';
import { apiFetch, jeNeaktivniClenstvi } from './lib/api';
import { dnesniTrenink } from './lib/trenink';

// Initial Data
import {
  initialProfile,
  initialWeightRecords,
  initialMeals,
  weeklyWorkouts,
  initialHabits,
  initialCoachTips,
  appleWatchBiometricsData,
  initialShoppingList,
  initialBadHabits,
  initialPreferences
} from './data/initialData';
import {
  WeightRecord,
  MealItem,
  WorkoutDay,
  HabitItem,
  BadHabitItem,
  ShoppingItem,
  UserPreferences,
  ExerciseItem,
  AppleWatchBiometrics,
  SyncResult,
  UserProfile,
  WithingsConnection
} from './types';

/** Doplní chybějící pole, když jsou uložená data starší než aktuální tvar objektu. */
const mergeObject = <T extends object>(stored: T, initial: T): T => ({ ...initial, ...stored });

const initialWithingsConnection: WithingsConnection = {
  maskedToken: '',
  isConnected: false,
  lastAuthorizedAt: null,
  autoSyncEnabled: true
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

function AppContent() {
  const { account, isAuthenticated, isLoading } = useAuth();
  const { showToast } = useToast();
  const { cesta, parametry } = useCesta();

  // Data se ukládají zvlášť pro každý účet (scope = user.id ze Supabase),
  // ať se dva lidé na jednom zařízení nemíchají.
  const scope = account?.id ?? 'guest';

  // Data vlastnena serverem. Nejdou do localStorage - jedina pravda je /api/profile.
  const {
    data: profilData,
    nacitam: nacitamProfil,
    chyba: chybaProfilu,
    znovu: znovuNacistProfil
  } = useProfilData(isAuthenticated);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dnes');
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [weightRecords, setWeightRecords] =
    useState<Record<string, WeightRecord[]>>(initialWeightRecords);
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutDay[]>([]);
  const [habits, setHabits] = useState<HabitItem[]>([]);
  const [badHabits, setBadHabits] = useState<BadHabitItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const zdravi = useZdravotniData(isAuthenticated);
  const maBiometrii = maZdravotniData(zdravi.regenerace);
  const [biometrics, setBiometrics] = useState<AppleWatchBiometrics>(appleWatchBiometricsData);

  useEffect(() => {
    if (zdravi.nacitam) return;
    setBiometrics((p) =>
      naBiometrii(zdravi.regenerace, zdravi.treninky, zdravi.pripojeno, zdravi.posledniSync, p)
    );
  }, [zdravi]);
  const [preferences, setPreferences] = useLocalStorage<UserPreferences>(
    `${scope}:preferences`,
    initialPreferences,
    mergeObject
  );
  const [withingsConnection, setWithingsConnection] = useLocalStorage<WithingsConnection>(
    `${scope}:withings-connection`,
    initialWithingsConnection,
    mergeObject
  );
  const [coachTips] = useState(initialCoachTips);

  // Prevod odpovedi serveru na tvary, ktere ceka UI. Bezi jednou po nacteni.
  useEffect(() => {
    if (!profilData) return;
    const plan = vyberPlan(profilData.plans);
    setProfile(naProfil(profilData));

    // Vychozi stav odskrtnuti jde ze serveru, ne z prazdna — jinak by se po
    // kazdem nacteni tvarilo, ze uzivatel dnes nic nesplnil.
    const hotove = mnozinaDokonceni(profilData.daily_activity_completions);
    setMeals(pouzijDokonceni(naJidla(plan), 'meal', hotove));
    setWorkouts(pouzijDokonceniTreninku(naTreninky(plan), hotove));
    setHabits(naNavyky(profilData.user_habits, dnesniNavyky(profilData.habit_logs_progress)));
    // Seznam = polozky spocitane z jidelnicku + to, co si uzivatel dopsal sam.
    const zPlanu = naNakupniSeznam(plan);
    setShoppingItems(zPlanu);
    apiFetch<{ items: ShoppingItem[] }>('/api/shopping-extras')
      .then(({ items }) => setShoppingItems([...zPlanu, ...(items || [])]))
      .catch(() => { /* vlastni polozky jsou doplnek, vypadek nesmi shodit seznam */ });
    setBadHabits(naZlozvyky(profilData.user_habits));
    setPreferences((p) => naPreference(profilData, p));

    const vazeni = naVazeni(profilData);
    if (vazeni.length > 0) {
      setWeightRecords({ '1M': vazeni, '3M': vazeni, '6M': vazeni, '1R': vazeni });
    }
  }, [profilData, setPreferences]);

  // Latest Measurement Record (data jdou z úložiště, proto s pojistkou)
  //
  // POZOR — LATENTNI PAD, SPLATIT V ETAPE 3.3/3.4.
  // Tenhle radek nespadne jen proto, ze initialWeightRecords['1M'] ma 7
  // seedovanych zaznamu. Jakmile Etapa 3.3 odstrani vymyslena data (sparkline
  // "101,9 -> 104,6 kg"), bude seed prazdny, monthRecords taky a
  // monthRecords[-1] vrati undefined -> latestRecord.weight shodi stranku.
  // Spravne reseni patri do Etapy 3.4: latestRecord ma byt WeightRecord | null
  // a komponenty maji chybejici hodnoty kreslit jako "—", ne jako 0.
  const monthRecords = weightRecords['1M']?.length ? weightRecords['1M'] : initialWeightRecords['1M'];
  const latestRecord = monthRecords[monthRecords.length - 1];

  // Zobrazený profil přebírá jméno a avatar z přihlášeného účtu.
  const displayedProfile = useMemo<UserProfile>(
    () =>
      account
        ? {
            ...profile,
            name: account.name,
            avatarUrl: account.avatarUrl,
            membershipPlan: account.membershipPlan
          }
        : profile,
    [account, profile]
  );

  // Modals & Popups State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [isWeeklyWorkoutModalOpen, setIsWeeklyWorkoutModalOpen] = useState(false);
  const [isWorkoutLoggerOpen, setIsWorkoutLoggerOpen] = useState(false);
  const [isWithingsModalOpen, setIsWithingsModalOpen] = useState(false);
  const [isAddRecordModalOpen, setIsAddRecordModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isCoachChatOpen, setIsCoachChatOpen] = useState(false);
  const [isShoppingModalOpen, setIsShoppingModalOpen] = useState(false);
  const [isExportPdfOpen, setIsExportPdfOpen] = useState(false);
  const [selectedRecipeMeal, setSelectedRecipeMeal] = useState<MealItem | null>(null);

  // Sync Timestamp State
  const [lastSyncedText, setLastSyncedText] = useLocalStorage(`${scope}:last-synced`, 'dnes v 08:45');
  const [isSyncing, setIsSyncing] = useState(false);

  // Aktuální hodnoty pro asynchronní synchronizaci (bez zastaralých closure).
  const biometricsRef = useRef(biometrics);
  biometricsRef.current = biometrics;
  const latestRecordRef = useRef(latestRecord);
  latestRecordRef.current = latestRecord;
  const isSyncingRef = useRef(false);

  // Aktualni jidla a treninky pro asynchronni zapisy — bez toho by handler
  // po awaitu pracoval se stavem z render, ve kterem vznikl.
  const mealsRef = useRef(meals);
  mealsRef.current = meals;
  const workoutsRef = useRef(workouts);
  workoutsRef.current = workouts;
  const habitsRef = useRef(habits);
  habitsRef.current = habits;

  /**
   * Zápis odškrtnutí na server. Vzor pro všechny zápisy v Etapě 2:
   * optimistický update proběhl u volajícího, tady se jen potvrdí, a když
   * server odmítne, volající vrátí stav zpátky a ukáže se toast.
   */
  const zapisDokonceni = useCallback(
    async (
      polozka: { planId?: string | null; planDay?: number; activityKey?: string },
      typ: 'meal' | 'workout',
      hotovo: boolean
    ): Promise<boolean> => {
      // Seed data a polozky mimo plan nemaji kam zapsat — UI je nechá být.
      if (!polozka?.activityKey || polozka.planDay === undefined) return true;

      try {
        await apiFetch('/api/daily-activation', {
          method: 'POST',
          body: JSON.stringify({
            action: hotovo ? 'complete' : 'uncomplete',
            activity_type: typ,
            activity_key: polozka.activityKey,
            plan_id: polozka.planId ?? null,
            plan_day: polozka.planDay,
            source_component: 'bento_profil'
          })
        });
        return true;
      } catch (chyba) {
        showToast({
          title: jeNeaktivniClenstvi(chyba) ? 'Změnu jsme neuložili' : 'Nepodařilo se uložit',
          description:
            chyba instanceof Error ? chyba.message : 'Zkus to prosím za chvíli znovu.',
          variant: 'error'
        });
        return false;
      }
    },
    [showToast]
  );

  // Handlers: Nutrition & Meals
  const handleToggleMeal = useCallback(
    async (id: string) => {
      const jidlo = mealsRef.current.find(m => m.id === id);
      if (!jidlo) return;

      const hotovo = !jidlo.completed;
      setMeals(prev => prev.map(m => (m.id === id ? { ...m, completed: hotovo } : m)));

      const ok = await zapisDokonceni(jidlo, 'meal', hotovo);
      if (!ok) {
        setMeals(prev => prev.map(m => (m.id === id ? { ...m, completed: !hotovo } : m)));
      }
    },
    [zapisDokonceni]
  );

  // Handlers: Workouts & Exercises
  const handleToggleExercise = useCallback(
    async (dayName: string, exerciseId: string) => {
      const den = workoutsRef.current.find(d => d.dayName === dayName);
      const cvik = den?.exercises.find(e => e.id === exerciseId);
      if (!den || !cvik) return;

      const hotovo = !cvik.completed;
      const nastav = (stav: boolean) =>
        setWorkouts(prev =>
          prev.map(d =>
            d.dayName === dayName
              ? {
                  ...d,
                  exercises: d.exercises.map(e =>
                    e.id === exerciseId ? { ...e, completed: stav } : e
                  )
                }
              : d
          )
        );

      nastav(hotovo);

      const ok = await zapisDokonceni(cvik, 'workout', hotovo);
      if (!ok) {
        nastav(!hotovo);
        return;
      }

      // Odškrtnutí posledního cviku zapíše i celý trénink — jako skutečný
      // záznam, ne dopočet, jinak by ho uživatel nemohl ručně vrátit zpět.
      // Opačným směrem se nic neruší (viz lib/profile/cvikDokonceni.js).
      if (!hotovo) return;
      const vsechnyHotove = den.exercises.every(e =>
        e.id === exerciseId ? true : e.completed
      );
      if (!vsechnyHotove || den.isCompleted) return;

      setWorkouts(prev =>
        prev.map(d => (d.dayName === dayName ? { ...d, isCompleted: true } : d))
      );
      const okDen = await zapisDokonceni(den, 'workout', true);
      if (!okDen) {
        setWorkouts(prev =>
          prev.map(d => (d.dayName === dayName ? { ...d, isCompleted: false } : d))
        );
      }
    },
    [zapisDokonceni]
  );

  // Vlastni jidlo a vlastni cvik nemaji endpoint — tabulky pridaval zruseny
  // PR #97 a z produkce se odstranily. Drzet tlacitko, ktere po refreshi
  // zahodi, co uzivatel napsal, je horsi nez ho nemit. Prislusna pole jsou
  // proto pryc i z MealPlanModal a WorkoutLoggerModal.

  /**
   * Handlers: Habits
   *
   * Datum je vzdy dnesek v Europe/Prague — stejnou hranici dne hlida
   * api/habits.js a cokoli jineho odmita se 400. Minule dny se v UI menit
   * nedaji: klikaci je pouze dnesni seznam navyku.
   *
   * Serie (streaky) tu nejsou. habit_logs zadnou nenese a driv se
   * dopocitavaly v prohlizeci z niceho.
   */
  const zapisNavyk = useCallback(
    async (telo: object): Promise<boolean> => {
      try {
        await apiFetch('/api/habits', { method: 'POST', body: JSON.stringify(telo) });
        return true;
      } catch (chyba) {
        showToast({
          title: jeNeaktivniClenstvi(chyba) ? 'Změnu jsme neuložili' : 'Nepodařilo se uložit návyk',
          description:
            chyba instanceof Error ? chyba.message : 'Zkus to prosím za chvíli znovu.',
          variant: 'error'
        });
        return false;
      }
    },
    [showToast]
  );

  const handleToggleHabit = useCallback(
    async (id: string) => {
      const navyk = habitsRef.current.find(h => h.id === id);
      if (!navyk) return;

      const hotovo = !navyk.completed;
      setHabits(prev => prev.map(h => (h.id === id ? { ...h, completed: hotovo } : h)));

      const ok = await zapisNavyk({
        log_date: dnesekPraha(),
        habit_id: id,
        completed: hotovo
      });
      if (!ok) {
        setHabits(prev => prev.map(h => (h.id === id ? { ...h, completed: !hotovo } : h)));
      }
    },
    [zapisNavyk]
  );

  const handleCompleteAllHabitsToday = useCallback(async () => {
    const zbyva = habitsRef.current.filter(h => !h.completed);
    if (zbyva.length === 0) return;

    setHabits(prev => prev.map(h => ({ ...h, completed: true })));

    // Bez stropu. Server bere v davce nejvyse 24 polozek, ale POSITIVE_HABITS
    // ma 10 a uzivatel si vybira z nich — pres limit se dostat neda. Kdyby
    // seznam narostl nad 24, server prebytek tise zahodi; radsi at se to
    // projevi jako rozpor proti /api/profile nez jako tiche ukrojeni tady.
    const davka = zbyva.map(h => ({
      log_date: dnesekPraha(),
      habit_id: h.id,
      completed: true
    }));

    const ok = await zapisNavyk({ batch: davka });
    if (!ok) {
      // ZADNY LOKALNI ROLLBACK. Server davku zpracovava v cyklu a pri chybe
      // uprostred uz muze byt cast zapsana — navrat do stavu pred akci by
      // ukazoval neco jineho, nez co je v databazi. Jediny spolehlivy stav
      // je ten, ktery vrati server.
      znovuNacistProfil();
    }
  }, [zapisNavyk, znovuNacistProfil]);

  // Handlers: Shopping List
  const handleToggleShoppingItem = (id: string) => {
    let dalsiStav = false;
    setShoppingItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        dalsiStav = !item.checked;
        return { ...item, checked: dalsiStav };
      })
    );
    // Odskrtnuti vlastni polozky se uklada; polozky odvozene z jidelnicku
    // maji id "nakup-N" a zadny radek v DB nemaji.
    if (!id.startsWith('nakup-')) {
      apiFetch('/api/shopping-extras', {
        method: 'PATCH',
        body: JSON.stringify({ id, checked: dalsiStav })
      }).catch(() => {});
    }
  };

  const handleAddShoppingItem = async (item: ShoppingItem) => {
    try {
      const { item: ulozena } = await apiFetch<{ item: ShoppingItem }>('/api/shopping-extras', {
        method: 'POST',
        body: JSON.stringify({ name: item.name, amount: item.amount, category: item.category })
      });
      setShoppingItems(prev => [...prev, { ...ulozena, checked: false }]);
    } catch (err) {
      showToast({
        title: 'Položku se nepodařilo uložit',
        description: (err as Error)?.message || 'Zkus to prosím znovu.',
        variant: 'error'
      });
    }
  };

  // Handlers: Weight Measurement
  const handleSaveNewMeasurement = (record: WeightRecord) => {
    const now = new Date();
    setWeightRecords(prev => applyWeightRecord(prev, record, now));
    setLastSyncedText(formatLastSynced(now));
    showToast({
      title: 'Měření zapsáno',
      description: `${record.weight.toString().replace('.', ',')} kg • ${record.fatPercent
        .toString()
        .replace('.', ',')} % tuku`,
      variant: 'success'
    });
  };

  /**
   * Handlers: Withings & Sync
   * Skutečně přepíše biometrii i váhový záznam novými hodnotami "z hodinek a váhy",
   * posune čas poslední synchronizace a vrátí souhrn stažených dat.
   */
  const handleManualWithingsSync = useCallback(async (): Promise<SyncResult | null> => {
    if (isSyncingRef.current) return null;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      // Skutečné stažení z Withings Cloud. Dřív se tu čekalo 900 ms a hodnoty
      // se dopočítaly v prohlížeči — uživatel viděl vymyšlené HRV a tep.
      await apiFetch('/api/withings/sync', { method: 'POST' });

      const now = new Date();
      const [regenerace, vazeni] = await Promise.all([
        apiFetch<{ rows: any[] }>('/api/health/recovery?days=30').catch(() => ({ rows: [] })),
        apiFetch<any>('/api/withings/latest').catch(() => null)
      ]);

      const nextBiometrics = naBiometrii(
        regenerace.rows || [], zdravi.treninky, true, now.toISOString(), biometricsRef.current
      );
      setBiometrics(nextBiometrics);
      setLastSyncedText(formatLastSynced(now));

      const vaha = Number(vazeni?.latest_weight_kg);
      if (Number.isFinite(vaha) && vaha > 0) {
        const newRecord = { ...latestRecordRef.current, date: now.toISOString().slice(0, 10), weight: vaha };
        setWeightRecords(prev => applyWeightRecord(prev, newRecord, now));
      }

      const result: SyncResult = {
        syncedAt: now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
        weight: Number.isFinite(vaha) ? vaha : latestRecordRef.current.weight,
        restingHrBpm: nextBiometrics.restingHrBpm,
        hrvMs: nextBiometrics.hrvMs,
        steps: nextBiometrics.stepsToday,
        activeEnergyKcal: nextBiometrics.activeEnergyKcal
      };

      showToast({
        title: `Synchronizováno v ${result.syncedAt}`,
        description: `Váha ${result.weight.toString().replace('.', ',')} kg • tep ${Math.round(
          result.restingHrBpm
        )} bpm • HRV ${result.hrvMs.toString().replace('.', ',')} ms • ${result.steps.toLocaleString(
          'cs-CZ'
        )} kroků`,
        variant: 'success'
      });

      return result;
    } catch {
      showToast({
        title: 'Synchronizace selhala',
        description: 'Data se nepodařilo stáhnout. Zkus to prosím znovu.',
        variant: 'error'
      });
      return null;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [setBiometrics, setWeightRecords, setLastSyncedText, showToast]);

  // Active workout
  // Pri prazdnem planu vracelo workouts[3] undefined a komponenty pak cetly
  // todayWorkout.title -> bila obrazovka. Prazdny plan je bezny stav (novy
  // uzivatel, plan se prave generuje), takze musi projit bez padu.
  const maPlan = meals.length > 0 || workouts.length > 0;
  const todayWorkout: WorkoutDay = dnesniTrenink(workouts);

  // Calculated macros
  const totalCalories = meals.reduce((acc, m) => acc + (m.completed ? m.calories : 0), 0);

  // Pending habits
  const pendingHabitsCount = habits.filter(h => !h.completed).length;

  // Odhlášený uživatel vidí výběr profilu místo aplikace.
  // Registrace je verejna - bezi i bez prihlaseni.
  if (cesta === '/start' || cesta === '/register' || cesta === '/signup') {
    return (
      <StartRegistrace
        onHotovo={(kam) => naviguj(kam)}
        onZpetNaPrihlaseni={() => naviguj('/login')}
      />
    );
  }

  // Dokud nevime, jestli je session platna, neposilame nikoho na prihlaseni.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#08090d] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-[#39ff14] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        redirectTo={parametry.get('redirect') || '/profil'}
        predvyplnenyEmail={parametry.get('email') || ''}
        poRegistraci={parametry.get('registered') === '1'}
        onPrejitNaRegistraci={() => naviguj('/start')}
        onPrihlasen={(kam) => naviguj(kam)}
      />
    );
  }

  // Nez dorazi /api/profile, neukazujeme prazdny plan - vypadalo by to,
  // ze uzivatel zadny nema.
  if (nacitamProfil) {
    return (
      <div className="min-h-screen bg-[#08090d] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-[#39ff14] animate-spin" />
        <p className="text-xs text-slate-500">Načítám tvůj plán…</p>
      </div>
    );
  }

  if (chybaProfilu) {
    return (
      <div className="min-h-screen bg-[#08090d] flex items-center justify-center p-4">
        <div className="max-w-sm w-full rounded-3xl bg-[#0c1017] border border-rose-500/30 p-6 text-center">
          <p className="text-sm text-rose-300 mb-1">Profil se nepodařilo načíst.</p>
          <p className="text-xs text-slate-500 mb-4">{chybaProfilu}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-2xl bg-[#39ff14] text-[#08090d] font-bold text-sm"
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  // Plán se po registraci generuje ~30 s a po aktivaci členství chvíli trvá,
  // než doběhne. Do té doby nemá smysl ukazovat prázdný jídelníček.
  if (!maPlan) {
    return (
      <div className="min-h-screen bg-[#08090d] flex items-center justify-center p-4">
        <div className="max-w-sm w-full rounded-3xl bg-[#0c1017] border border-cyan-500/25 p-6 text-center">
          <h1 className="text-xl font-bold text-white flex items-center justify-center gap-1.5 mb-3">
            <span>Body &amp; Mind</span>
            <span className="text-[#39ff14] font-extrabold">ON</span>
          </h1>
          <p className="text-sm text-slate-300 mb-1">Tvůj plán se připravuje.</p>
          <p className="text-xs text-slate-500 mb-4">
            Generování trvá zhruba půl minuty. Až bude hotový, přijde ti i e-mailem.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-2xl bg-[#39ff14] text-[#08090d] font-bold text-sm"
          >
            Zkusit načíst znovu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090d] text-slate-100 relative overflow-x-hidden font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Ambient Cyber Neon Background Glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-b from-cyan-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[550px] h-[450px] bg-lime-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Main Container */}
      <div className="w-full max-w-2xl lg:max-w-5xl mx-auto px-3.5 sm:px-6 py-3.5 sm:py-6 space-y-4 sm:space-y-5">
        {/* 1. Header with Brand Logo, AI Status & Slide-out Menu */}
        <Header
          isMenuOpen={isMenuOpen}
          onOpenMenu={() => setIsMenuOpen(true)}
          onCloseMenu={() => setIsMenuOpen(false)}
          onOpenCoach={() => setIsCoachChatOpen(true)}
          onSelectTab={setActiveTab}
        />

        {/* 2. Navigace a rychlé akce — hned pod hlavičkou, ať jsou po ruce
               bez scrollování. */}
        <NavigationTabs
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        <QuickActionToolbar
          onLogWorkout={() => setIsWorkoutLoggerOpen(true)}
          onEditPreferences={() => setIsPreferencesModalOpen(true)}
          onSyncAll={handleManualWithingsSync}
          onAddWeight={() => setIsAddRecordModalOpen(true)}
          isSyncing={isSyncing}
        />

        {/* 3. Karta uživatele */}
        <UserProfileCard
          profile={displayedProfile}
          latestWeightRecord={latestRecord}
          biometrics={biometrics}
          onEditProfile={() => setIsPreferencesModalOpen(true)}
          onViewFullProfile={() => setActiveTab('profil')}
        />

        {/* 4. AI Trenér TED Recommendation Banner */}
        <AICoachBanner
          tips={coachTips}
          onOpenChat={() => setIsCoachChatOpen(true)}
        />

        {/* 6. Dynamic Content Based on Selected Tab */}
        {/* TAB A: PŘEHLED (BENTO GRID DASHBOARD) */}
        {activeTab === 'dnes' && (
          <OverviewBentoGrid
            latestWeightRecord={latestRecord}
            biometrics={biometrics}
            meals={meals}
            todayWorkout={todayWorkout}
            habits={habits}
            badHabits={badHabits}
            coachTips={coachTips}
            preferences={preferences}
            onSelectTab={setActiveTab}
            onOpenWorkoutLogger={() => setIsWorkoutLoggerOpen(true)}
            onOpenAddWeightModal={() => setIsAddRecordModalOpen(true)}
            onOpenCoachChat={() => setIsCoachChatOpen(true)}
            onToggleMeal={handleToggleMeal}
            onToggleHabit={handleToggleHabit}
            onCompleteAllHabits={handleCompleteAllHabitsToday}
            onSelectRecipe={(meal) => setSelectedRecipeMeal(meal)}
          />
        )}

        {/* TAB B: MŮJ PROFIL & CÍLE */}
        {activeTab === 'profil' && (
          <ProfileSection
            profile={displayedProfile}
            preferences={preferences}
            latestWeightRecord={latestRecord}
            biometrics={biometrics}
            onEditPreferences={() => setIsPreferencesModalOpen(true)}
            onOpenCoachChat={() => setIsCoachChatOpen(true)}
            onSyncAll={handleManualWithingsSync}
            onAddWeight={() => setIsAddRecordModalOpen(true)}
            isSyncing={isSyncing}
          />
        )}

        {/* TAB C: TĚLO & VÁHA (WITHINGS BODY SCAN) */}
        {activeTab === 'vaha' && (
          <BodyCompositionSection
            currentRecord={latestRecord}
            recordsByFilter={weightRecords}
            lastSyncedText={lastSyncedText}
            onAddMeasurement={() => setIsAddRecordModalOpen(true)}
            onSync={handleManualWithingsSync}
            onOpenWithingsSettings={() => setIsWithingsModalOpen(true)}
          />
        )}

        {/* TAB D: JÍDELNÍČEK & MAKRA */}
        {activeTab === 'jidelnicek' && (
          <NutritionSection
            meals={meals}
            currentCalories={totalCalories}
            targetCalories={preferences.dailyCalorieTarget}
            proteinPct={preferences.proteinRatioPercent}
            carbsPct={preferences.carbsRatioPercent}
            fatPct={preferences.fatRatioPercent}
            onToggleMeal={handleToggleMeal}
            onSelectRecipe={(m) => setSelectedRecipeMeal(m)}
            onOpenWeeklyPlan={() => setIsMealModalOpen(true)}
            onOpenShoppingList={() => setIsShoppingModalOpen(true)}
            onExportPdf={() => setIsExportPdfOpen(true)}
          />
        )}

        {/* TAB E: TRÉNINKOVÝ PLÁN & ZÁZNAMNÍK */}
        {activeTab === 'trenink' && (
          <WorkoutSection
            workouts={workouts}
            onToggleExercise={handleToggleExercise}
            onOpenWorkoutLogger={() => setIsWorkoutLoggerOpen(true)}
            onOpenWeeklyModal={() => setIsWeeklyWorkoutModalOpen(true)}
          />
        )}

        {/* TAB F: APPLE WATCH & REGENERACE */}
        {/* Bez jediného měření z hodinek sekci neukazujeme — prázdné grafy
            a nuly by vypadaly jako naměřené hodnoty. */}
        {activeTab === 'regenerace' && (maBiometrii ? (
          <BiometricsSection
            biometrics={biometrics}
            onSync={handleManualWithingsSync}
          />
        ) : (
          <div className="p-6 rounded-3xl bg-[#0c1017] border border-slate-800 text-center">
            <p className="text-sm text-slate-300 mb-1">Zatím nemáme data z hodinek.</p>
            <p className="text-xs text-slate-500">
              {zdravi.pripojeno
                ? 'Apple Watch jsou připojené, ale ještě nedorazilo první měření.'
                : 'Připoj Apple Health a uvidíš tu regeneraci, tep a spánek.'}
            </p>
          </div>
        ))}

        {/* Sekce „Návyky & série" odstraněna. Série (streaky), efektivita
            spánku ani komentáře typu „včera překonána chuť na čokoládu“
            nemají v datech žádnou oporu — nesledujeme je. */}

        {/* TAB H: NÁKUPNÍ SEZNAM */}
        {activeTab === 'nakup' && (
          <div className="space-y-4">
            <div className="rounded-3xl p-5 sm:p-6 bg-[#0e131d]/90 border border-cyan-500/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">Nákupní seznam na týden</h3>
                <p className="text-xs text-slate-400">
                  Přehledný seznam surovin generovaný podle vašeho jídelníčku
                </p>
              </div>
              <button
                onClick={() => setIsShoppingModalOpen(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#00f2fe] text-slate-950 hover:bg-[#00f2fe]/90 shadow-[0_0_12px_rgba(0,242,254,0.3)] transition-all"
              >
                Otevřít celoobrazovkový seznam
              </button>
            </div>

            {/* In-tab shopping checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {shoppingItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleToggleShoppingItem(item.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    item.checked
                      ? 'bg-slate-900/40 border-slate-800 opacity-60'
                      : 'bg-[#0e131d]/90 border-slate-800 hover:border-cyan-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center ${
                        item.checked
                          ? 'bg-[#39ff14] border-[#39ff14] text-slate-950 font-bold'
                          : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {item.checked && '✓'}
                    </div>
                    <div>
                      <span className={`text-xs font-bold block ${item.checked ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                        {item.name}
                      </span>
                      <span className="text-[10px] text-cyan-400/80">{item.category}</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                    {item.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="pt-6 pb-8 text-center text-xs text-slate-600 space-y-1 select-none">
          <p className="font-medium text-slate-500">
            Body &amp; Mind <span className="text-[#39ff14]">ON</span> • Biohacking, Performance &amp; AI trenér
          </p>
          <p className="text-[11px] text-slate-600">
            Všechna data jsou synchronizována v reálném čase se zařízeními Withings a Apple Health.
          </p>
        </footer>
      </div>

      {/* Modals & Dialogs */}
      <MealPlanModal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        meals={meals}
        onToggleMeal={handleToggleMeal}
      />

      <RecipeModal
        meal={selectedRecipeMeal}
        isOpen={!!selectedRecipeMeal}
        onClose={() => setSelectedRecipeMeal(null)}
        onToggleComplete={handleToggleMeal}
      />

      <ShoppingListModal
        isOpen={isShoppingModalOpen}
        onClose={() => setIsShoppingModalOpen(false)}
        items={shoppingItems}
        onToggleItem={handleToggleShoppingItem}
        onAddItem={handleAddShoppingItem}
      />

      <ExportMealPlanModal
        isOpen={isExportPdfOpen}
        onClose={() => setIsExportPdfOpen(false)}
        meals={meals}
        profile={displayedProfile}
        totalCalories={totalCalories}
      />

      <WeeklyWorkoutModal
        isOpen={isWeeklyWorkoutModalOpen}
        onClose={() => setIsWeeklyWorkoutModalOpen(false)}
        workouts={workouts}
        onToggleExercise={handleToggleExercise}
      />

      <WorkoutLoggerModal
        isOpen={isWorkoutLoggerOpen}
        onClose={() => setIsWorkoutLoggerOpen(false)}
        todayWorkout={todayWorkout}
        onToggleExercise={handleToggleExercise}
      />

      <WithingsSyncModal
        isOpen={isWithingsModalOpen}
        onClose={() => setIsWithingsModalOpen(false)}
        connection={withingsConnection}
        onConnectionChange={setWithingsConnection}
        onManualSync={handleManualWithingsSync}
        isSyncing={isSyncing}
      />

      <AddMeasurementModal
        isOpen={isAddRecordModalOpen}
        onClose={() => setIsAddRecordModalOpen(false)}
        onSave={handleSaveNewMeasurement}
      />

      <PreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
        preferences={preferences}
        onSavePreferences={(newPref) => setPreferences(newPref)}
      />

      <CoachChatModal
        isOpen={isCoachChatOpen}
        onClose={() => setIsCoachChatOpen(false)}
        profile={displayedProfile}
        currentWeightRecord={latestRecord}
        latestWeight={latestRecord}
        todayWorkout={todayWorkout}
        meals={meals}
        biometrics={biometrics}
      />
    </div>
  );
}
