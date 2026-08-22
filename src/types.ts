export interface WeightRecord {
  date: string;
  weight: number;
  fatPercent: number;
  muscleKg: number;
  bmi: number;
  note?: string;
}


/**
 * Postup přípravy z `recipes_catalog.instructions_cs`.
 *
 * `recipe` na jídle je nepovinný a je tu jen tehdy, když recept opravdu má
 * použitelné kroky — proto v tomhle typu není nic volitelného kromě odhadu
 * doby. Dřív tu byly i `difficulty`, `tips` a `replacements`; žádné z nich
 * v databázi nemá zdroj a UI je vyplňovalo natvrdo stejnou větou pro všechny.
 *
 * `cookTimeMin` taky zmizel: `recipes_catalog.ready_in_minutes` je prázdný
 * u všech 69 receptů, které se v plánech objevují.
 */
export interface RecipeDetail {
  instructions: string[];
  /** Odhad z `prep_minutes_estimated`. null = neodhadnuto, řádek se skryje. */
  prepTimeMin: number | null;
}

/**
 * Souřadnice zápisu do `daily_activity_completions`.
 *
 * Volitelné schválně: seed data v `initialData.ts` je nemají a mít je nemůžou —
 * nepocházejí z plánu. UI podle jejich přítomnosti pozná, jestli jde odškrtnutí
 * poslat na server, nebo je to jen ukázka.
 */
export interface AktivitaPlanu {
  /** id řádku v ai_generated_plans; null = plán bez id (párování přes plan_id IS NULL). */
  planId?: string | null;
  /** Index dne v plánu, 0–6. Server jiný rozsah odmítne. */
  planDay?: number;
  /** Staví lib/dailyActivationClient.js (jídla) a lib/profile/cvikDokonceni.js (cviky). */
  activityKey?: string;
}

export interface MealItem extends AktivitaPlanu {
  id: string;
  type: 'Snídaně' | 'Dopolední svačina' | 'Oběd' | 'Odpolední svačina' | 'Večeře';
  time: string;
  title: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  completed: boolean;
  ingredients: string[];
  recipe?: RecipeDetail;
}

export interface ExerciseItem extends AktivitaPlanu {
  id: string;
  name: string;
  sets: number;
  reps: string;
  weightKg?: number;
  restSec: number;
  targetMuscle: string;
  completed?: boolean;
}

export interface WorkoutDay extends AktivitaPlanu {
  dayName: string;
  dayShort: string;
  title: string;
  durationMin: number;
  caloriesBurned: number;
  isToday: boolean;
  isCompleted: boolean;
  focus: string;
  exercises: ExerciseItem[];
}

export interface HabitItem {
  id: string;
  title: string;
  subtitle?: string;
  completed: boolean;
  iconType: 'food' | 'sleep' | 'water' | 'steps' | 'mind';
  value?: string;
  target?: string;
}

/**
 * Zlozvyk, ktery uzivatel sleduje.
 *
 * `cleanDaysStreak` tu neni: serie u zlozvyku nikde nemerime, adapter tam
 * davala natvrdo 0 a UI z toho delalo "0 dni bez prohresku" — coz neni
 * namerena nula, ale "nevime".
 */
export interface BadHabitItem {
  id: string;
  title: string;
  description: string;
  status: 'clean' | 'relapsed';
  lastResistedNote?: string;
}


export interface AppleWatchWorkoutItem {
  id: string;
  type: string;
  icon: string;
  time: string;
  durationMin: number;
  caloriesBurned: number;
  avgHr: number;
  maxHr: number;
}

export interface MetricTrendPoint {
  day: string;
  value: number;
}

/**
 * Jedna dlaždice metriky z hodinek. Název i zařazení nese databáze
 * (`apple_health_metrics_daily.label_cs` / `category`), UI si je nevymýšlí.
 */
export interface DlazdiceMetriky {
  klic: string;
  nazev: string;
  /** Už naformátované číslo. Metrika bez hodnoty se nevykresluje vůbec. */
  hodnota: string;
  jednotka: string;
  datum: string;
}

export interface SkupinaMetrik {
  klic: string;
  nazev: string;
  metriky: DlazdiceMetriky[];
}

/**
 * Poslední naměřená noc.
 *
 * Fáze spánku tu schválně nejsou — Health Auto Export je posílá jako nulu,
 * takže je nikdy nikdo nenaměřil. Stejně tak čas v posteli a efektivita:
 * vznikaly dopočtem z časů, které nesedí (viz `lib/health/spanek.js`).
 */
export interface SpanekNoc {
  datum: string;
  /** „6 h 12 min". Nikdy null — bez délky spánku se noc nevrací. */
  spanek: string;
  probuzeni: string | null;
  usnutiCas: string | null;
  probuzeniCas: string | null;
}

export interface AppleWatchBiometrics {
  scaleConnected: boolean;
  appleWatchConnected: boolean;
  lastSyncTime: string;
  recoveryScore: number;
  recoveryStatus: 'Optimální' | 'Ubrat intenzitu' | 'Potřeba odpočinku' | 'Připraven na max';
  recoveryAdvice: string;
  hrvMs: number;
  hrvBaselineMs: number;
  restingHrBpm: number;
  sleepDuration: string;
  deepSleepDuration: string;
  sleepEfficiencyPercent: number;
  stepsToday: number;
  stepsTarget: number;
  activeEnergyKcal: number;
  activeEnergyTargetKcal: number;
  exerciseMinutes: number;
  exerciseMinutesTarget: number;
  bloodOxygenPercent: number;
  recentWorkouts: AppleWatchWorkoutItem[];
  hrvTrend: MetricTrendPoint[];
  restingHrTrend: MetricTrendPoint[];
  stepsTrend: MetricTrendPoint[];
  energyTrend: MetricTrendPoint[];
}

/**
 * Tělesné složení z chytré váhy (withings_body_snapshots).
 *
 * `null` znamená „nenaměřeno" a UI to kreslí jako „—". Nikdy ne 0 — nula by
 * tvrdila, že jsme naměřili nulu. hydration_percent tu schválně není:
 * je null ve všech řádcích, takže by šlo o prázdný sloupec navíc.
 */
export interface TelesneSlozeni {
  measured_at: string;
  fat_percent: number | null;
  fat_mass_kg: number | null;
  muscle_mass_kg: number | null;
  visceral_fat: number | null;
  bmi: number | null;
  basal_metabolic_rate: number | null;
  bone_mass_kg: number | null;
  hydration_kg: number | null;
  /** Předchozí neprázdný snapshot; null = deltu nemáme z čeho spočítat. */
  predchozi_measured_at: string | null;
  zmena: {
    fat_percent: number | null;
    fat_mass_kg: number | null;
    muscle_mass_kg: number | null;
    visceral_fat: number | null;
    bmi: number | null;
    basal_metabolic_rate: number | null;
    bone_mass_kg: number | null;
    hydration_kg: number | null;
  };
}

export interface ShoppingItem {
  id: string;
  name: string;
  amount: string;
  category: 'Maso & Ryby' | 'Mléčné výrobky & Vejce' | 'Přílohy & Pečivo' | 'Zelenina & Ovoce' | 'Ořechy, Tuky & Ostatní';
  checked: boolean;
}

export interface UserPreferences {
  dailyCalorieTarget: number;
  proteinRatioPercent: number;
  carbsRatioPercent: number;
  fatRatioPercent: number;
  targetWeightKg: number;
  currentHeightCm: number;
  weeklyWorkoutsTarget: number;
  withingsAutoSync: boolean;
  appleHealthAutoSync: boolean;
  tedAiProactiveTips: boolean;
}

export interface UserProfile {
  name: string;
  status: 'AKTIVNÍ' | 'PAUZOVÁNO' | 'VIP';
  avatarUrl: string;
  membershipPlan: string;
  nextConsultationDate: string;
  subtitle?: string;
}

/** Účet, pod kterým je uživatel přihlášen (lze mezi nimi přepínat). */
export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  membershipPlan: string;
}

/** Aktivní přihlášení uložené v localStorage. */
export interface AuthSession {
  accountId: string;
  loggedInAt: string;
}

/**
 * Stav propojení s Withings Cloud. Token zadává uživatel v modálu;
 * do úložiště jde jen maskovaná podoba (poslední 4 znaky), samotné
 * tajemství zůstává v paměti běžící relace.
 */
export interface WithingsConnection {
  maskedToken: string;
  isConnected: boolean;
  lastAuthorizedAt: string | null;
  autoSyncEnabled: boolean;
}

/** Souhrn toho, co poslední synchronizace stáhla — zobrazuje se v modálu i v toastu. */
export interface SyncResult {
  syncedAt: string;
  weight: number;
  restingHrBpm: number;
  hrvMs: number;
  steps: number;
  activeEnergyKcal: number;
}

/**
 * Zpráva trenéra z tabulky `ai_messages` (agent_slug = 'coach').
 *
 * `category` tu schválně není: server posílá `task_type`
 * (motivation_message, recovery_message…) a mapovat ho na výmyslové
 * kategorie „regenerace / výživa / výkon / kompozice" by znamenalo tvrdit
 * něco, co v datech není. Nikde se stejně nevykreslovala.
 */
export interface CoachTip {
  id: string;
  headline: string;
  content: string;
  /** Kdy zpráva vznikla. Prázdné, když to server neposlal. */
  timestamp: string;
}

