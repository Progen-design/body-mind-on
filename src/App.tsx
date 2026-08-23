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
import { PreferencesModal, VysledekUlozeni } from './components/PreferencesModal';
import { CoachChatModal } from './components/CoachChatModal';
import type { KotvaChatu } from './components/CoachChatModal';
import { LoginScreen } from './components/LoginScreen';

// Kontexty, perzistence a synchronizace
import { AuthProvider, useAuth } from './context/AuthContext';
import { StartRegistrace } from './components/registrace/StartRegistrace';
import { naviguj, useCesta } from './routing';
import { useProfilData } from './hooks/useProfilData';
import { useZdravotniData } from './hooks/useZdravotniData';
import { naBiometrii, maZdravotniData, naSkupinyMetrik, naSpanek } from './data/adapteryZdravi';
import type { NastaveniProfilu } from './data/adaptery';
import {
  dnesekPraha, dnesniNavyky, mnozinaDokonceni, naJidla, naNakupniSeznam, naNavyky,
  hodnotaNeboPomlcka, naNastaveniProfilu, naPreference, naProfil, naTelesneSlozeni, naTreninky, naVazeni,
  naZlozvyky, naZpravyTrenera, pouzijDokonceni,
  pouzijDokonceniTreninku, vyberPlan
} from './data/adaptery';
import { ToastProvider, useToast } from './context/ToastContext';
// Otaznik u kterekoli metriky umi otevrit TEDa s kontextem te polozky.
// Kontext, ne prop — otazniky sedi hluboko v kartach a modalech.
import { TedProvider } from './context/TedContext';
import { useLocalStorage } from './hooks/useLocalStorage';
// buildSyncedBiometrics a buildSyncedWeightRecord se uz nepouzivaji — hodnoty
// si dopocitavaly v prohlizeci (mean-revert HRV k baseline), takze uzivatel
// videl vymyslene zdravotni udaje. Data ted chodi z /api/health/recovery.
import { applyWeightRecord, formatLastSynced } from './lib/syncEngine';
import { apiFetch, jeNeaktivniClenstvi } from './lib/api';
import { dnesniTrenink } from './lib/trenink';
import { sestavZapisTreninku } from './lib/zapisTreninku';
import { rozdelZmenyNastaveni, PRAZDNE_NASTAVENI } from './lib/nastaveniProfilu';

// Initial Data
import { PRAZDNA_BIOMETRIE, PRAZDNY_PROFIL, initialPreferences } from './data/initialData';
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
  CoachTip,
  TelesneSlozeni,
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
  const [profile, setProfile] = useState<UserProfile>(PRAZDNY_PROFIL);
  // Prazdno, dokud nedorazi server. Driv tu byl seed se sedmi vymyslenymi
  // vazenimi a graf tak ukazoval cizi hodnoty, nez se profil nacetl.
  const [weightRecords, setWeightRecords] =
    useState<Record<string, WeightRecord[]>>({});
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutDay[]>([]);
  const [habits, setHabits] = useState<HabitItem[]>([]);
  const [badHabits, setBadHabits] = useState<BadHabitItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const zdravi = useZdravotniData(isAuthenticated);
  const maBiometrii = maZdravotniData(zdravi.regenerace);
  // Vsech 31 metrik z hodinek, seskupenych podle oblasti, a posledni namerena
  // noc. Driv profil ukazoval sedm metrik a u spanku faze, ktere zdroj vubec
  // neposila.
  const skupinyMetrik = useMemo(() => naSkupinyMetrik(zdravi.metriky), [zdravi.metriky]);
  const spanekNoc = useMemo(() => naSpanek(zdravi.spanek), [zdravi.spanek]);
  const [biometrics, setBiometrics] = useState<AppleWatchBiometrics>(PRAZDNA_BIOMETRIE);

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
  // Zpravy trenera ze serveru. Prazdno = banner se nezobrazi; to je platny
  // stav, ne chyba napojeni (ai_trigger_rules coach zpravy zatim negeneruje).
  const [coachTips, setCoachTips] = useState<CoachTip[]>([]);
  // Telesne slozeni z chytre vahy. null = zadne mereni, karty se skryji.
  const [slozeni, setSlozeni] = useState<TelesneSlozeni | null>(null);
  // Soucasne nastaveni pro predvyplneni modalu. Jde ze serveru, ne z localStorage.
  const [nastaveni, setNastaveni] = useState<NastaveniProfilu>(PRAZDNE_NASTAVENI);

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
    setSlozeni(naTelesneSlozeni(profilData));
    setNastaveni(naNastaveniProfilu(profilData));
    setCoachTips(naZpravyTrenera(profilData));
    setPreferences((p) => naPreference(profilData, p));

    const vazeni = naVazeni(profilData);
    if (vazeni.length > 0) {
      setWeightRecords({ '1M': vazeni, '3M': vazeni, '6M': vazeni, '1R': vazeni });
    }
  }, [profilData, setPreferences]);

  /**
   * Posledni vazeni, nebo null.
   *
   * SPLACENO V ETAPE 3.4. Driv tenhle radek drzel jen diky sedmi seedovanym
   * zaznamum v initialWeightRecords — jakmile se vymyslena data odstranila,
   * vratil by monthRecords[-1] undefined a latestRecord.weight by shodil
   * stranku. Ted je typ WeightRecord | null a komponenty kresli "—".
   *
   * Uzivatel bez jedineho vazeni je bezny stav: novy ucet, cizi vaha,
   * odpojeny Withings.
   */
  const monthRecords = weightRecords['1M'] ?? [];
  const latestRecord: WeightRecord | null = monthRecords.length > 0
    ? monthRecords[monthRecords.length - 1]
    : null;

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
  // CHAT S TEDEM (Etapa 5). Do 23. 8. 2026 to byla atrapa — setTimeout
  // a if/else nad klicovymi slovy s natvrdo psanymi hodnotami — a byl proto
  // schovany. Ted jde otazka na /api/coach-chat a odtud do OpenAI
  // s kontextem z profilu uzivatele.
  const [isCoachChatOpen, setIsCoachChatOpen] = useState(false);
  // U ktere polozky se uzivatel zeptal. Chat se otevre rovnou u toho cisla.
  const [kotvaChatu, setKotvaChatu] = useState<KotvaChatu | null>(null);
  const zeptejSeTeda = useCallback((kotva: KotvaChatu | null = null) => {
    setKotvaChatu(kotva);
    setIsCoachChatOpen(true);
  }, []);
  const [isShoppingModalOpen, setIsShoppingModalOpen] = useState(false);
  const [isExportPdfOpen, setIsExportPdfOpen] = useState(false);
  const [selectedRecipeMeal, setSelectedRecipeMeal] = useState<MealItem | null>(null);

  // Sync Timestamp State
  const [lastSyncedText, setLastSyncedText] = useLocalStorage(`${scope}:last-synced`, 'dnes v 08:45');
  const [isSyncing, setIsSyncing] = useState(false);

  // Aktuální hodnoty pro asynchronní synchronizaci (bez zastaralých closure).
  const biometricsRef = useRef(biometrics);
  biometricsRef.current = biometrics;
  const latestRecordRef = useRef<WeightRecord | null>(latestRecord);
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

  /**
   * Handlers: zapsany trenink
   *
   * Posila jen to, co uzivatel v modalu opravdu zadal — viz
   * src/lib/zapisTreninku.ts. Modal dnes nema pole pro obtiznost ani pro typ
   * treninku, takze se obe vynechavaji; nazev z planu ("Zada", "Hrudnik &
   * Biceps") na vycet 13 hodnot nesedi a volny text by server ulozil jak
   * prisel.
   *
   * Odskrtnute cviky se sem NEDUPLIKUJI — ty jdou pres /api/daily-activation
   * cestou z 2.1.
   */
  const handleSaveWorkout = useCallback(
    async (vstup: {
      sekundyStopek: number;
      obtiznost: string | null;
      typ: string | null;
    }): Promise<boolean> => {
      // Typ ani obtiznost se neodvozuji z planu — nazev ("Zada") ani focus
      // ("Varianta A") na vycet nesedi a odhadovat "silovy" by znamenalo
      // vyplnit hodnotu, kterou uzivatel nezadal. Bud si vybere, nebo se pole
      // neposle a server ulozi "Ostatni".
      const telo = sestavZapisTreninku({
        datum: dnesekPraha(),
        sekundyStopek: vstup.sekundyStopek,
        obtiznost: vstup.obtiznost,
        typKandidat: vstup.typ
      });

      try {
        await apiFetch('/api/workouts', { method: 'POST', body: JSON.stringify(telo) });
        showToast({
          title: 'Trénink zapsán',
          description:
            telo.duration_min !== undefined
              ? `Zaznamenali jsme ${telo.duration_min} min.`
              : 'Bez délky — stopky neběžely.',
          variant: 'success'
        });
        // Historie treninku se pocita na serveru, takze si ji vyzvedneme znovu
        // misto dopisovani do lokalniho stavu.
        znovuNacistProfil();
        return true;
      } catch (chyba) {
        showToast({
          title: jeNeaktivniClenstvi(chyba) ? 'Trénink jsme neuložili' : 'Nepodařilo se uložit trénink',
          description:
            chyba instanceof Error ? chyba.message : 'Zkus to prosím za chvíli znovu.',
          variant: 'error'
        });
        return false;
      }
    },
    [showToast, znovuNacistProfil]
  );

  /**
   * Handlers: nastaveni profilu
   *
   * Dve volani, protoze pole patri dvema endpointum. Zadny optimisticky
   * update — /api/profile-preferences pregeneruje plan a posle e-mail, takze
   * dokud nedobehne, nevime, co je pravda.
   *
   * USPECH SE CTE Z TELA, ne ze statusu: pri selhani regenerace endpoint vraci
   * 200 s planRegenerated: false.
   */
  const handleSavePreferences = useCallback(
    async (zmeny: Partial<NastaveniProfilu>): Promise<VysledekUlozeni> => {
      const { preference, nastaveni: kNastaveni } = rozdelZmenyNastaveni(zmeny);

      const ulozeno: string[] = [];
      const neulozeno: string[] = [];
      let chyba: string | null = null;
      let planRegenerated: boolean | undefined;

      if (kNastaveni) {
        try {
          await apiFetch('/api/profile-settings', {
            method: 'PATCH',
            body: JSON.stringify(kNastaveni)
          });
          ulozeno.push('cílová váha a výška');
        } catch (e) {
          neulozeno.push('cílová váha a výška');
          chyba = e instanceof Error ? e.message : null;
        }
      }

      if (preference) {
        try {
          const odpoved = await apiFetch<{ ok?: boolean; planRegenerated?: boolean; message?: string }>(
            '/api/profile-preferences',
            { method: 'PATCH', body: JSON.stringify(preference) }
          );
          planRegenerated = odpoved?.planRegenerated === true;
          ulozeno.push('nastavení plánu');
          if (!planRegenerated) {
            // Preference se ulozily, ale plan se nepregeneroval — 200 to nepozna.
            chyba = odpoved?.message || 'Plán se nepodařilo přegenerovat, zkus to prosím znovu.';
          }
        } catch (e) {
          neulozeno.push('nastavení plánu');
          chyba = e instanceof Error ? e.message : null;
        }
      }

      // At uz to dopadlo jakkoli, pravdu ma server.
      znovuNacistProfil();

      const vseProslo = neulozeno.length === 0;
      if (vseProslo) {
        showToast({
          title: 'Nastavení uloženo',
          description: planRegenerated
            ? 'Plán se přegeneroval a poslali jsme ti ho e-mailem.'
            : planRegenerated === false
              ? 'Změny jsme uložili, ale plán se nepřegeneroval.'
              : undefined,
          variant: planRegenerated === false ? 'error' : 'success'
        });
      }

      return { ok: vseProslo, ulozeno, neulozeno, chyba, planRegenerated };
    },
    [showToast, znovuNacistProfil]
  );

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
  /**
   * Zápis váhy. Bez optimistického updatu — /api/quick-weight bezi synchronne
   * pres rozhodovaci vrstvu, takze odpoved muze trvat sekundy a modal drzi
   * spinner. Historii vah pocita server (weight_history), proto se po ulozeni
   * znovu nacte profil misto dopisovani do lokalniho stavu.
   *
   * Zadne varovani o pregenerovani planu: zmereno v produkci, ze
   * ai_trigger_rules ma zapnute jen user_registered -> initial_plan, takze
   * vazeni nespusti ani plan, ani e-mail.
   */
  const handleSaveNewMeasurement = useCallback(
    async (vahaKg: number): Promise<boolean> => {
      try {
        await apiFetch('/api/quick-weight', {
          method: 'POST',
          body: JSON.stringify({ weight_kg: vahaKg })
        });
        setLastSyncedText(formatLastSynced(new Date()));
        showToast({
          title: 'Váha zapsána',
          description: hodnotaNeboPomlcka(vahaKg, 'kg'),
          variant: 'success'
        });
        znovuNacistProfil();
        return true;
      } catch (chyba) {
        showToast({
          title: jeNeaktivniClenstvi(chyba) ? 'Váhu jsme neuložili' : 'Nepodařilo se uložit váhu',
          description:
            chyba instanceof Error ? chyba.message : 'Zkus to prosím za chvíli znovu.',
          variant: 'error'
        });
        return false;
      }
    },
    [setLastSyncedText, showToast, znovuNacistProfil]
  );

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
        // Bez predchoziho zaznamu neni z ceho slozit zbytek poli — dopocitat
        // tuk, svaly a BMI by znamenalo vymyslet si je. Prvni vazeni tedy
        // nese jen vahu a zbytek zustava nulovy, dokud nedorazi ze serveru.
        const predchozi = latestRecordRef.current;
        const newRecord: WeightRecord = {
          date: now.toISOString().slice(0, 10),
          weight: vaha,
          fatPercent: predchozi?.fatPercent ?? 0,
          muscleKg: predchozi?.muscleKg ?? 0,
          bmi: predchozi?.bmi ?? 0
        };
        setWeightRecords(prev => applyWeightRecord(prev, newRecord, now));
      }

      const result: SyncResult = {
        syncedAt: now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
        weight: Number.isFinite(vaha) ? vaha : (latestRecordRef.current?.weight ?? 0),
        restingHrBpm: nextBiometrics.restingHrBpm,
        hrvMs: nextBiometrics.hrvMs,
        steps: nextBiometrics.stepsToday,
        activeEnergyKcal: nextBiometrics.activeEnergyKcal
      };

      showToast({
        title: `Synchronizováno v ${result.syncedAt}`,
        description: `Váha ${hodnotaNeboPomlcka(result.weight, 'kg')} • tep ${hodnotaNeboPomlcka(
          result.restingHrBpm, 'bpm', 0
        )} • HRV ${hodnotaNeboPomlcka(result.hrvMs, 'ms')} • ${result.steps.toLocaleString(
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
    <TedProvider zeptejSe={zeptejSeTeda}>
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
          onAskTed={() => zeptejSeTeda()}
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
            pocetNakupu={shoppingItems.length}
            slozeni={slozeni}
            onSelectTab={setActiveTab}
            onOpenWorkoutLogger={() => setIsWorkoutLoggerOpen(true)}
            onAskTed={() => zeptejSeTeda()}
            onOpenAddWeightModal={() => setIsAddRecordModalOpen(true)}
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
            slozeni={slozeni}
            birthDate={profilData?.user?.birth_date ?? null}
            onEditPreferences={() => setIsPreferencesModalOpen(true)}
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
            slozeni={slozeni}
            onAddMeasurement={() => setIsAddRecordModalOpen(true)}
            onSync={handleManualWithingsSync}
            onOpenWithingsSettings={() => setIsWithingsModalOpen(true)}
          />
        )}

        {/* TAB D: JÍDELNÍČEK & MAKRA */}
        {activeTab === 'jidelnicek' && (
          <NutritionSection
            meals={meals}
            shoppingItems={shoppingItems}
            onToggleShoppingItem={handleToggleShoppingItem}
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
            skupiny={skupinyMetrik}
            spanek={spanekNoc}
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

        {/* Zalozka „Nakupni seznam" zrusena — seznam je ted podsekce
            jidelnicku, pod jidly, ze kterych vznikl. */}

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
        onSaveWorkout={handleSaveWorkout}
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
        latestWeight={latestRecord?.weight ?? null}
      />

      <PreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
        soucasne={nastaveni}
        onSave={handleSavePreferences}
      />

      {/* TED. Data si bere sám ze serveru — komponenta žádná nedostává,
          protože kontext pro odpověď skládá /api/coach-chat z profilu
          uživatele, ne z toho, co má zrovna otevřená obrazovka. */}
      <CoachChatModal
        isOpen={isCoachChatOpen}
        onClose={() => { setIsCoachChatOpen(false); setKotvaChatu(null); }}
        kotva={kotvaChatu}
      />
    </div>
    </TedProvider>
  );
}
