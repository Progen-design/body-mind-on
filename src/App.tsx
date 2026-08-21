import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { HabitsSection } from './components/HabitsSection';

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
import { ToastProvider, useToast } from './context/ToastContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import {
  applyWeightRecord,
  buildSyncedBiometrics,
  buildSyncedWeightRecord,
  formatLastSynced
} from './lib/syncEngine';

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
  habitHistoryWeek,
  initialPreferences
} from './data/initialData';
import {
  WeightRecord,
  MealItem,
  WorkoutDay,
  HabitItem,
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

  // Central State Management (trvale uložený v localStorage)
  const [activeTab, setActiveTab] = useState<ActiveTab>('dnes');
  const [profile] = useLocalStorage<UserProfile>(`${scope}:profile`, initialProfile, mergeObject);
  const [weightRecords, setWeightRecords] = useLocalStorage<Record<string, WeightRecord[]>>(
    `${scope}:weight-records`,
    initialWeightRecords
  );
  const [meals, setMeals] = useLocalStorage<MealItem[]>(`${scope}:meals`, initialMeals);
  const [workouts, setWorkouts] = useLocalStorage<WorkoutDay[]>(`${scope}:workouts`, weeklyWorkouts);
  const [habits, setHabits] = useLocalStorage<HabitItem[]>(`${scope}:habits`, initialHabits);
  const [badHabits] = useLocalStorage(`${scope}:bad-habits`, initialBadHabits);
  const [habitHistory] = useLocalStorage(`${scope}:habit-history`, habitHistoryWeek);
  const [shoppingItems, setShoppingItems] = useLocalStorage<ShoppingItem[]>(
    `${scope}:shopping`,
    initialShoppingList
  );
  const [biometrics, setBiometrics] = useLocalStorage<AppleWatchBiometrics>(
    `${scope}:biometrics`,
    appleWatchBiometricsData,
    mergeObject
  );
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

  // Latest Measurement Record (data jdou z úložiště, proto s pojistkou)
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

  // Handlers: Nutrition & Meals
  const handleToggleMeal = (id: string) => {
    setMeals(prev =>
      prev.map(m => (m.id === id ? { ...m, completed: !m.completed } : m))
    );
  };

  const handleAddMeal = (newMeal: MealItem) => {
    setMeals(prev => [...prev, newMeal]);
  };

  // Handlers: Workouts & Exercises
  const handleToggleExercise = (dayName: string, exerciseId: string) => {
    setWorkouts(prev =>
      prev.map(day => {
        if (day.dayName !== dayName) return day;
        const updatedEx = day.exercises.map(ex =>
          ex.id === exerciseId ? { ...ex, completed: !ex.completed } : ex
        );
        const allDone = updatedEx.every(e => e.completed);
        return {
          ...day,
          exercises: updatedEx,
          isCompleted: allDone
        };
      })
    );
  };

  const handleAddExercise = (dayName: string, newEx: ExerciseItem) => {
    setWorkouts(prev =>
      prev.map(day => {
        if (day.dayName !== dayName) return day;
        return {
          ...day,
          exercises: [...day.exercises, newEx]
        };
      })
    );
  };

  // Handlers: Habits
  const handleToggleHabit = (id: string) => {
    setHabits(prev =>
      prev.map(h => {
        if (h.id !== id) return h;
        const nextCompleted = !h.completed;
        return {
          ...h,
          completed: nextCompleted,
          streakDays: nextCompleted ? h.streakDays + 1 : Math.max(0, h.streakDays - 1)
        };
      })
    );
  };

  const handleCompleteAllHabitsToday = () => {
    setHabits(prev =>
      prev.map(h => ({
        ...h,
        completed: true,
        streakDays: h.completed ? h.streakDays : h.streakDays + 1
      }))
    );
  };

  // Handlers: Shopping List
  const handleToggleShoppingItem = (id: string) => {
    setShoppingItems(prev =>
      prev.map(item => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  const handleAddShoppingItem = (item: ShoppingItem) => {
    setShoppingItems(prev => [...prev, item]);
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
      // Stažení dat z Withings Cloud / Apple HealthKit
      await new Promise(resolve => setTimeout(resolve, 900));

      const now = new Date();
      const nextBiometrics = buildSyncedBiometrics(biometricsRef.current, now);
      const newRecord = buildSyncedWeightRecord(latestRecordRef.current, now);

      setBiometrics(nextBiometrics);
      setWeightRecords(prev => applyWeightRecord(prev, newRecord, now));
      setLastSyncedText(formatLastSynced(now));

      const result: SyncResult = {
        syncedAt: now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
        weight: newRecord.weight,
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
  const todayWorkout = workouts.find(w => w.isToday) || workouts[3];

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

        {/* 2. User Profile Summary Bar (Jan Novák / Příkopa, AKTIVNÍ) */}
        <UserProfileCard
          profile={displayedProfile}
          latestWeightRecord={latestRecord}
          biometrics={biometrics}
          onEditProfile={() => setIsPreferencesModalOpen(true)}
          onViewFullProfile={() => setActiveTab('profil')}
        />

        {/* 3. AI Trenér TED Recommendation Banner */}
        <AICoachBanner
          tips={coachTips}
          onOpenChat={() => setIsCoachChatOpen(true)}
        />

        {/* 4. Quick Nav Tabs ('Přehled', 'Můj Profil', 'Tělo & Váha', 'Jídelníček', 'Trénink', 'Apple Watch', 'Návyky', 'Nákup') */}
        <NavigationTabs
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          pendingHabitsCount={pendingHabitsCount}
        />

        {/* 5. Quick Action Toolbar ('Zapsat trénink', 'Upravit preference', 'Synchronizovat teď', 'Zapsat váhu') */}
        <QuickActionToolbar
          onLogWorkout={() => setIsWorkoutLoggerOpen(true)}
          onEditPreferences={() => setIsPreferencesModalOpen(true)}
          onSyncAll={handleManualWithingsSync}
          onAddWeight={() => setIsAddRecordModalOpen(true)}
          isSyncing={isSyncing}
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
        {activeTab === 'regenerace' && (
          <BiometricsSection
            biometrics={biometrics}
            onSync={handleManualWithingsSync}
          />
        )}

        {/* TAB G: NÁVYKY & STREAKY */}
        {activeTab === 'naviky' && (
          <HabitsSection
            habits={habits}
            badHabits={badHabits}
            habitHistory={habitHistory}
            onToggleHabit={handleToggleHabit}
            onCompleteAllToday={handleCompleteAllHabitsToday}
          />
        )}

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
        onAddMeal={handleAddMeal}
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
        onAddExercise={handleAddExercise}
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
