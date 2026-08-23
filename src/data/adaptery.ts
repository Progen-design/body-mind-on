// Prevod odpovedi /api/profile na tvary, ktere ceka Bento UI.
// Tvary vstupu jsou overene proti produkcni databazi, ne odhadnute.
// Relativni cesta zamerne misto aliasu @lib - soubor pak jde spustit
// i cistym Nodem (viz tools/overit-adaptery.ts), nejen pres Vite.
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../../lib/habits.js';
// Klice odskrtnutych aktivit maji jediny zdroj pravdy v lib/ — sdileny se
// serverem. Format se nesmi menit, rozparoval by uz ulozene radky.
import { mealActivityKey } from '../../lib/dailyActivationClient.js';
import { klicCviku, KLIC_CELEHO_TRENINKU } from '../../lib/profile/cvikDokonceni.js';
// Stejny vypocet "dneska" jako na serveru (api/habits.js i daily-activation).
// Vlastni new Date().toISOString() by po pulnoci UTC poslalo jine datum, nez
// jake server prijme — a ten cokoliv jineho nez dnesek v Praze odmita.
import { calendarDateIsoInPrague } from '../../lib/czechCalendar.js';
// Stejny filtr pouzitelnych kroku, jaky pouziva server pri doplnovani postupu.
import { pouzitelneKroky } from '../../lib/profile/postupReceptu.js';
// Prostredi treninku je zakodovane v body_metrics.notes; cist ho musi tentyz
// parser, ktery ho tam zapisuje.
import {
  parseAvailableEquipment,
  parseTrainingEnvironment,
  parseTrainingEnvironmentDetail
} from '../../lib/trainingEnvironment.js';
import type {
  BadHabitItem, CoachTip, ExerciseItem, HabitItem, MealItem, RecipeDetail, ShoppingItem,
  TelesneSlozeni, UserPreferences, UserProfile, WeightRecord, WorkoutDay
} from '../types';

export interface ProfilOdpoved {
  program?: string;
  membershipStatus?: string;
  user?: {
    id: string; email: string; name: string | null; avatar_url: string | null;
    height_cm: number | null; goal_weight_kg: number | null; birth_date: string | null;
  };
  body_metrics?: any[];
  user_habits?: { habit_id: string; is_positive: boolean; sort_order: number }[];
  plans?: any[];
  workouts?: any[];
  daily_activity_completions?: DokonceniAktivity[];
  habit_logs_progress?: ZaznamNavyku[];
  body_composition?: TelesneSlozeni | null;
  coach_messages?: ZpravaTrenera[];
}

/** Radek `ai_messages` (agent_slug = 'coach'), jak ho vraci /api/profile. */
export interface ZpravaTrenera {
  id: string | number;
  title?: string | null;
  content?: string | null;
  created_at?: string | null;
  task_type?: string | null;
}

/** Řádek `habit_logs`, jak ho vrací /api/profile v `habit_logs_progress`. */
export interface ZaznamNavyku {
  log_date: string;
  habit_id: string;
  completed?: boolean;
}

/** Řádek `daily_activity_completions`, jak ho vrací /api/profile. */
export interface DokonceniAktivity {
  activity_type: string;
  activity_key: string;
  completed_at?: string;
  plan_id?: string | null;
  plan_day?: number | null;
}

const NAZVY_PROGRAMU: Record<string, string> = {
  START: 'START',
  ON_CLUB: 'ON Club',
  VIP: 'VIP'
};

/** Aktivni plan = ten, ktery pokryva dnesek; jinak nejnovejsi. */
export function vyberPlan(plans: any[] = []): any | null {
  if (!Array.isArray(plans) || plans.length === 0) return null;
  const dnes = new Date().toISOString().slice(0, 10);
  const aktivni = plans.find(
    (p) => p?.is_active && (!p.valid_until || String(p.valid_until) >= dnes)
  );
  return aktivni || plans[0] || null;
}

function strukturaPlanu(plan: any): any | null {
  if (!plan) return null;
  const s = plan.structured_plan_json;
  if (!s) return null;
  return typeof s === 'string' ? JSON.parse(s) : s;
}

/**
 * Generator vraci ctyri typy jidel (breakfast, lunch, dinner, snack).
 * Bento rozlisuje dopolední a odpolední svacinu - rozhoduje poradi v ramci dne.
 */
const CAS_JIDLA: Record<MealItem['type'], string> = {
  'Snídaně': '7:30',
  'Dopolední svačina': '10:00',
  'Oběd': '12:30',
  'Odpolední svačina': '15:30',
  'Večeře': '18:30'
};

function typJidla(apiTyp: string, poradiSvaciny: number): MealItem['type'] {
  switch (String(apiTyp || '').toLowerCase()) {
    case 'breakfast': return 'Snídaně';
    case 'lunch': return 'Oběd';
    case 'dinner': return 'Večeře';
    case 'snack': return poradiSvaciny === 0 ? 'Dopolední svačina' : 'Odpolední svačina';
    default: return 'Odpolední svačina';
  }
}

function cislo(v: unknown, vychozi = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : vychozi;
}

/** Den plánu pro dnešek; když plán dnešek nepokrývá, první den. */
function dnesniDen(struktura: any): any | null {
  const dny = struktura?.days;
  if (!Array.isArray(dny) || dny.length === 0) return null;
  const dnes = new Date().toISOString().slice(0, 10);
  return dny.find((d: any) => String(d?.date) === dnes) || dny[0];
}

/**
 * Index dne v plánu (0–6) — to je `plan_day`, které čeká /api/daily-activation.
 * Pozor: NENÍ to index v poli, které vrací `naTreninky` — to je předfiltrované
 * na dny s tréninkem, takže by čísla nesedela.
 */
function indexDne(struktura: any, den: any): number | undefined {
  const dny = struktura?.days;
  if (!Array.isArray(dny) || !den) return undefined;
  const i = dny.indexOf(den);
  return i >= 0 && i <= 6 ? i : undefined;
}

function idPlanu(plan: any): string | null {
  return plan?.id != null ? String(plan.id) : null;
}

/**
 * Postup přípravy, nebo `undefined`.
 *
 * `instructions_cs` doplňuje /api/profile z `recipes_catalog` — v uloženém
 * plánu postup není. Když ho recept nemá, vrací se `undefined` a modal sekci
 * vůbec nevykreslí. Žádný náhradní text: „Připravte si všechny čerstvé
 * suroviny podle gramáže" není recept.
 */
function naRecept(recept: any): RecipeDetail | undefined {
  const kroky = pouzitelneKroky(recept?.instructions_cs);
  if (kroky.length === 0) return undefined;

  const minuty = Number(recept?.prep_minutes);
  return {
    instructions: kroky,
    prepTimeMin: Number.isFinite(minuty) && minuty > 0 ? Math.round(minuty) : null
  };
}

export function naJidla(plan: any): MealItem[] {
  const struktura = strukturaPlanu(plan);
  const den = dnesniDen(struktura);
  if (!den || !Array.isArray(den.meals)) return [];

  const planDay = indexDne(struktura, den);
  const planId = idPlanu(plan);

  let svaciny = 0;
  return den.meals.map((m: any, i: number) => {
    const jeSvacina = String(m?.type).toLowerCase() === 'snack';
    const typ = typJidla(m?.type, jeSvacina ? svaciny++ : 0);
    const recept = m?.recipe || {};
    return {
      id: String(m?.catalog_id ?? m?.recipe_id ?? `${den.date}-${i}`),
      type: typ,
      time: CAS_JIDLA[typ],
      title: m?.display_name_cs || m?.name_cs || recept.title_cs || recept.title || 'Jídlo',
      calories: cislo(m?.kcal),
      protein: cislo(m?.protein_g),
      carbs: cislo(m?.carbs_g),
      fat: cislo(m?.fat_g),
      completed: false,
      planId,
      planDay,
      activityKey: mealActivityKey(m, i),
      ingredients: Array.isArray(m?.shopping_ingredient_lines)
        ? m.shopping_ingredient_lines.map(String)
        : (Array.isArray(recept.ingredients)
            ? recept.ingredients.map((s: any) => String(s?.original || s?.name || ''))
            : []),
      recipe: naRecept(recept)
    } as MealItem;
  });
}

const ZKRATKY: Record<string, string> = {
  'Pondělí': 'Po', 'Úterý': 'Út', 'Středa': 'St', 'Čtvrtek': 'Čt',
  'Pátek': 'Pá', 'Sobota': 'So', 'Neděle': 'Ne'
};

/**
 * caloriesBurned, restSec a targetMuscle generator NEVRACI. Zamerne se
 * nedopocitavaji odhadem - UI je pri nulove hodnote skryje. Radsi nic nez
 * vymyslene cislo u zdravotnich dat.
 */
export function naTreninky(plan: any): WorkoutDay[] {
  const struktura = strukturaPlanu(plan);
  const dny = struktura?.days;
  if (!Array.isArray(dny)) return [];

  const dnes = new Date().toISOString().slice(0, 10);
  const planId = idPlanu(plan);

  return dny
    .filter((d: any) => d?.workout && Array.isArray(d.workout.exercises))
    .map((d: any) => {
      const w = d.workout;
      // Index se bere z puvodniho pole dnu, ne z tohohle predfiltrovaneho.
      const planDay = indexDne(struktura, d);

      const cviky: ExerciseItem[] = w.exercises.map((e: any, i: number) => ({
        id: String(e?.canonical_key || `${d.date}-cvik-${i}`),
        name: e?.display_name_cs || e?.name_cs || e?.name || 'Cvik',
        sets: cislo(e?.sets),
        reps: String(e?.reps ?? ''),
        restSec: 0,
        targetMuscle: '',
        completed: false,
        planId,
        planDay,
        activityKey: klicCviku(i)
      }));

      return {
        planId,
        planDay,
        // Cely trenink ma vlastni klic vedle jednotlivych cviku (cvik#0, cvik#1…).
        activityKey: KLIC_CELEHO_TRENINKU,
        dayName: String(d?.day_name || ''),
        dayShort: ZKRATKY[String(d?.day_name)] || String(d?.day_name || '').slice(0, 2),
        title: w?.workout_name || 'Trénink',
        durationMin: cislo(w?.duration_minutes),
        caloriesBurned: 0,
        isToday: String(d?.date) === dnes,
        isCompleted: false,
        focus: w?.start_program_variant ? `Varianta ${w.start_program_variant}` : '',
        exercises: cviky
      } as WorkoutDay;
    });
}

/**
 * Klíč pro porovnání odškrtnutí. Musí obsahovat i den a plán — jinak by se
 * včerejší odškrtnutí namapovalo na dnešek, protože `activity_key` je
 * u každého dne stejný (`snack#2`, `cvik#0`…).
 */
function klicDokonceni(
  planId: string | null | undefined,
  planDay: number | null | undefined,
  typ: string,
  klic: string
): string {
  return `${planId ?? ''}|${planDay ?? ''}|${typ}|${klic}`;
}

/** Množina odškrtnutých aktivit z odpovědi serveru. */
export function mnozinaDokonceni(radky: DokonceniAktivity[] = []): Set<string> {
  const s = new Set<string>();
  for (const r of radky || []) {
    if (!r?.activity_type || !r?.activity_key) continue;
    s.add(klicDokonceni(r.plan_id, r.plan_day, r.activity_type, r.activity_key));
  }
  return s;
}

/** Je tahle položka odškrtnutá podle serveru? */
export function jeHotovo(
  polozka: { planId?: string | null; planDay?: number; activityKey?: string },
  typ: 'meal' | 'workout',
  hotove: Set<string>
): boolean {
  if (!polozka?.activityKey || polozka.planDay === undefined) return false;
  return hotove.has(klicDokonceni(polozka.planId, polozka.planDay, typ, polozka.activityKey));
}

/**
 * Výchozí stav odškrtnutí ze serveru. Bez tohohle začínalo UI vždy na
 * nule a po refreshi zmizelo, co uživatel odklikal.
 */
export function pouzijDokonceni<T extends { planId?: string | null; planDay?: number; activityKey?: string; completed?: boolean }>(
  polozky: T[],
  typ: 'meal' | 'workout',
  hotove: Set<string>
): T[] {
  return polozky.map((p) => ({ ...p, completed: jeHotovo(p, typ, hotove) }));
}

/** Trénink: cviky i příznak celého dne. */
export function pouzijDokonceniTreninku(dny: WorkoutDay[], hotove: Set<string>): WorkoutDay[] {
  return dny.map((den) => ({
    ...den,
    isCompleted: jeHotovo(den, 'workout', hotove),
    exercises: pouzijDokonceni(den.exercises, 'workout', hotove)
  }));
}

/**
 * Tělesné složení z odpovědi serveru. Vrací null, když měření nemáme —
 * karta se pak nezobrazuje vůbec, místo aby ukazovala nuly.
 */
export function naTelesneSlozeni(odpoved: ProfilOdpoved): TelesneSlozeni | null {
  return odpoved?.body_composition ?? null;
}

/**
 * Číslo pro UI. Chybějící hodnota je „—", nikdy 0.
 *
 * ZAOKROUHLUJE SE AŽ PŘI ZOBRAZENÍ. Apple Health i Withings posílají plnou
 * přesnost (změřeno: 103.02100372314453 kg) a v databázi má zůstat — jen se
 * nemá vypisovat. Váha, tuk, svaly a BMI na jedno desetinné místo, bazální
 * metabolismus na celé.
 *
 * Koncová nula se NEUŘEZÁVÁ: „103,0 kg" vedle „14,7 %" drží stejnou šířku
 * a odpovídá tomu, na kolik míst hodnotu opravdu známe.
 */
export function hodnotaNeboPomlcka(
  hodnota: number | null | undefined,
  jednotka = '',
  desetinnych = 1
): string {
  if (hodnota === null || hodnota === undefined || !Number.isFinite(hodnota)) return '—';
  const cislo = Number(hodnota).toFixed(desetinnych).replace('.', ',');
  return jednotka ? `${cislo} ${jednotka}` : cislo;
}

/**
 * Popisek pod dlaždicí: jednotka a k ní cíl, pokud nějaký opravdu máme.
 *
 * Cíle chodí z /api/health. Když tam nejsou, dlaždice ukáže jen jednotku —
 * cíl se nevymýšlí a nula se nevydává za cíl. Před Etapou 3.7 tu byly
 * natvrdo psané „cíl 1 500" a „cíl 60,0" vedle polí, která ve stejném
 * souboru o pár řádků výš správně krmila graf.
 */
export function popisekCile(jednotka: string, cil: number | null | undefined): string {
  const maCil = cil !== null && cil !== undefined && Number.isFinite(cil) && cil > 0;
  if (!maCil) return jednotka;

  const cislo = Number(cil).toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
  return jednotka ? `${jednotka} (cíl ${cislo})` : `cíl ${cislo}`;
}

/** Změna proti minulému měření se znaménkem. Bez druhého měření prázdno. */
export function zmenaText(zmena: number | null | undefined, jednotka = '', desetinnych = 1): string | null {
  if (zmena === null || zmena === undefined || !Number.isFinite(zmena)) return null;
  const z = Number(zmena);
  const znamenko = z > 0 ? '+' : '';
  return `${znamenko}${z.toFixed(desetinnych).replace('.', ',')}${jednotka ? ' ' + jednotka : ''}`;
}

/** "21. 8. v 18:00" — u karty musí být vidět, kdy se měřilo. */
export function kdyMereno(iso: string | null | undefined): string {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Hodnoty, ktere umi prijmout /api/profile-preferences a /api/profile-settings. */
export interface NastaveniProfilu {
  goal: string;
  activity: string;
  stress_level: string;
  occupation: string;
  frequency: string;
  workout_days: number[];
  diet_type: string;
  dietary_restrictions: string;
  foods_to_avoid: string;
  training_environment: string;
  available_equipment: string[];
  training_environment_detail: string;
  selected_habits: string[];
  goal_weight_kg: string;
  height_cm: string;
}

function text(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/** Tréninkové dny umí přijít jako pole i jako "1,3,5". */
function naDny(v: unknown): number[] {
  const zdroj = Array.isArray(v)
    ? v
    : typeof v === 'string' && v
      ? v.split(',')
      : [];
  return zdroj
    .map((d) => Number(String(d).trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}

/**
 * Současné nastavení pro předvyplnění formuláře. Bere se z posledního
 * body_metrics (to je zdroj, který /api/profile-preferences mění) a z profilu.
 */
export function naNastaveniProfilu(odpoved: ProfilOdpoved): NastaveniProfilu {
  const bm: any = odpoved?.body_metrics?.[0] || {};

  return {
    goal: text(bm.goal),
    activity: text(bm.activity),
    stress_level: text(bm.stress_level),
    occupation: text(bm.occupation),
    frequency: text(bm.freq_choice),
    workout_days: naDny(bm.workout_days),
    diet_type: text(bm.diet_type),
    dietary_restrictions: text(bm.dietary_restrictions),
    foods_to_avoid: text(bm.foods_to_avoid),
    training_environment: text(parseTrainingEnvironment(bm)),
    available_equipment: parseAvailableEquipment(bm) || [],
    training_environment_detail: text(parseTrainingEnvironmentDetail(bm)),
    selected_habits: (odpoved?.user_habits || []).map((h) => h.habit_id),
    goal_weight_kg: text(odpoved?.user?.goal_weight_kg),
    height_cm: text(odpoved?.user?.height_cm ?? bm.height_cm)
  };
}

/**
 * Zprávy trenéra ze serveru. Prázdné pole = žádná zpráva a banner se
 * nezobrazí — to je platný stav, ne chyba napojení.
 *
 * Změřeno v produkci: `ai_trigger_rules` má enabled=true jen
 * `user_registered -> initial_plan`, takže nové coach zprávy zatím
 * nevznikají a u většiny lidí bude prázdno.
 */
export function naZpravyTrenera(odpoved: ProfilOdpoved): CoachTip[] {
  return (odpoved?.coach_messages || [])
    .filter((z) => String(z?.content || '').trim())
    .map((z) => ({
      id: String(z.id),
      headline: String(z.title || '').trim() || 'Zpráva od trenéra',
      content: String(z.content).trim(),
      timestamp: kdyMereno(z.created_at)
    }));
}

const IKONY: Record<string, HabitItem['iconType']> = {
  healthy_diet: 'food', quality_sleep: 'sleep', hydration: 'water',
  daily_movement: 'steps', training: 'steps', meditation: 'mind',
  breathing: 'mind', mobility_stretch: 'mind', cold_shower: 'water',
  digital_detox_evening: 'mind'
};

/** Dnešek v Europe/Prague — stejná hranice dne, jakou hlídá api/habits.js. */
export function dnesekPraha(): string {
  return calendarDateIsoInPrague();
}

/**
 * ISO datum na český tvar „20. 8. 2026". Prázdný vstup dá „—".
 *
 * Skládá se ze složek ISO řetězce, ne přes `new Date(iso)` — ten by řetězec
 * vzal jako půlnoc UTC a v Praze z něj udělal předchozí den.
 */
export function datumCesky(iso: string | null | undefined): string {
  if (!iso) return '—';

  const [rok, mesic, den] = iso.slice(0, 10).split('-');
  if (!rok || !mesic || !den) return '—';

  return `${Number(den)}. ${Number(mesic)}. ${rok}`;
}

/**
 * Návyky splněné dnes. Server posílá `habit_logs_progress` od registrace,
 * tady z toho zbyde jen dnešek — jen ten jde v UI měnit.
 */
export function dnesniNavyky(logy: ZaznamNavyku[] = [], dnes = dnesekPraha()): Set<string> {
  const s = new Set<string>();
  for (const l of logy || []) {
    if (l?.completed !== true) continue;
    if (String(l.log_date).slice(0, 10) !== dnes) continue;
    s.add(String(l.habit_id));
  }
  return s;
}

/**
 * SÉRIE (STREAKY) TU NEJSOU SCHVÁLNĚ. `habit_logs` nese jen `log_date`,
 * `habit_id`, `completed` a `notes` — žádnou sérii. Dřív se `streakDays`
 * dopočítávalo v prohlížeči z ničeho: každé odškrtnutí přičetlo den, každé
 * zrušení odečetlo, takže číslo neodpovídalo žádnému měření.
 */
export function naNavyky(
  userHabits: ProfilOdpoved['user_habits'] = [],
  hotoveDnes: Set<string> = new Set()
): HabitItem[] {
  return (userHabits || [])
    .filter((h) => h.is_positive)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((h) => {
      const def: any = POSITIVE_HABITS.find((p: any) => p.id === h.habit_id);
      return {
        id: h.habit_id,
        title: def?.label || h.habit_id,
        subtitle: def?.description,
        completed: hotoveDnes.has(h.habit_id),
        iconType: IKONY[h.habit_id] || 'mind'
      } as HabitItem;
    });
}

export function naZlozvyky(userHabits: ProfilOdpoved['user_habits'] = []): BadHabitItem[] {
  return (userHabits || [])
    .filter((h) => !h.is_positive)
    .map((h) => {
      const def: any = NEGATIVE_HABITS.find((p: any) => p.id === h.habit_id);
      return {
        id: h.habit_id,
        title: def?.label || h.habit_id,
        description: def?.description || '',
        status: 'clean'
      } as BadHabitItem;
    });
}

export function naProfil(odpoved: ProfilOdpoved): UserProfile {
  const bm = odpoved.body_metrics?.[0] || {};
  const program = String(odpoved.program || 'START');
  const stav = String(odpoved.membershipStatus || '');
  return {
    name: odpoved.user?.name || bm.name || odpoved.user?.email?.split('@')[0] || 'Můj profil',
    status: stav === 'active' ? 'AKTIVNÍ' : stav === 'trial' ? 'AKTIVNÍ' : 'PAUZOVÁNO',
    avatarUrl: odpoved.user?.avatar_url || '',
    membershipPlan: NAZVY_PROGRAMU[program] || program,
    nextConsultationDate: '',
    subtitle: bm.goal ? String(bm.goal) : undefined
  };
}

export function naPreference(odpoved: ProfilOdpoved, puvodni: UserPreferences): UserPreferences {
  const bm = odpoved.body_metrics?.[0] || {};
  const plan = strukturaPlanu(vyberPlan(odpoved.plans));
  const t = plan?.targets || {};

  const kcal = cislo(t.calories_per_day ?? bm.calories_target, puvodni.dailyCalorieTarget);
  const bilkoviny = cislo(t.protein_g);
  const sacharidy = cislo(t.carbs_g);
  const tuky = cislo(t.fat_g);
  const zKcal = (g: number, koef: number) => (kcal > 0 ? Math.round((g * koef * 100) / kcal) : 0);

  return {
    ...puvodni,
    dailyCalorieTarget: kcal,
    proteinRatioPercent: bilkoviny ? zKcal(bilkoviny, 4) : puvodni.proteinRatioPercent,
    carbsRatioPercent: sacharidy ? zKcal(sacharidy, 4) : puvodni.carbsRatioPercent,
    fatRatioPercent: tuky ? zKcal(tuky, 9) : puvodni.fatRatioPercent,
    currentHeightCm: cislo(odpoved.user?.height_cm ?? bm.height_cm, puvodni.currentHeightCm),
    targetWeightKg: cislo(odpoved.user?.goal_weight_kg, puvodni.targetWeightKg),
    weeklyWorkoutsTarget: cislo(bm.weekly_sessions, puvodni.weeklyWorkoutsTarget)
  };
}

/** Vazeni z registrace a z merani. Bez dat prazdne pole - graf se skryje. */
export function naVazeni(odpoved: ProfilOdpoved): WeightRecord[] {
  const metriky = odpoved.body_metrics || [];
  return metriky
    .filter((m) => m?.weight_kg != null)
    .map((m) => ({
      date: String(m.created_at || '').slice(0, 10),
      weight: cislo(m.weight_kg),
      fatPercent: 0,
      muscleKg: 0,
      bmi: cislo(m.bmi)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Kategorie odhadujeme z nazvu suroviny - jen pro serazeni v seznamu. */
function kategorieSuroviny(nazev: string): ShoppingItem['category'] {
  const n = nazev.toLowerCase();
  if (/kuř|krůt|hověz|vepř|losos|ryb|krevet|tuňák|šunk|klobás/.test(n)) return 'Maso & Ryby';
  if (/mlék|jogurt|tvaroh|sýr|cottage|smetan|vejc|ricott|feta|skyr/.test(n)) return 'Mléčné výrobky & Vejce';
  if (/chléb|pečiv|rýže|těstovin|brambor|batát|ovesn|vločk|quinoa|couscous|tortil/.test(n)) return 'Přílohy & Pečivo';
  if (/zeleni|salát|rajč|okurk|paprik|cuket|brokol|špenát|ovoc|jablk|banán|bobul|boruvk|malin|kiwi|pomeranč|avokád|cibul|česnek|mrkev/.test(n)) return 'Zelenina & Ovoce';
  return 'Ořechy, Tuky & Ostatní';
}

/**
 * Nakupni seznam za cely tyden. Stejna surovina z vice jidel se slucuje
 * podle nazvu; mnozstvi se scita jen kdyz sedi jednotka.
 */
export function naNakupniSeznam(plan: any): ShoppingItem[] {
  const dny = strukturaPlanu(plan)?.days;
  if (!Array.isArray(dny)) return [];

  const soucet = new Map<
    string,
    { nazev: string; mnozstvi: number; jednotka: string; volny: Set<string> }
  >();

  for (const den of dny) {
    for (const jidlo of den?.meals || []) {
      for (const radek of jidlo?.shopping_ingredient_lines || []) {
        const rozbor = rozeberRadekSuroviny(String(radek));
        if (!rozbor) continue;

        const klic = rozbor.nazev.toLowerCase();
        const zaznam = soucet.get(klic)
          || { nazev: rozbor.nazev, mnozstvi: 0, jednotka: '', volny: new Set<string>() };

        if (rozbor.mnozstvi !== null && (!zaznam.jednotka || zaznam.jednotka === rozbor.jednotka)) {
          zaznam.jednotka = rozbor.jednotka;
          zaznam.mnozstvi += rozbor.mnozstvi;
        } else if (rozbor.mnozstvi !== null) {
          // Stejná surovina ve dvou různých jednotkách (150 g a 2 lžíce).
          // Sečíst to nejde, tak se to vypíše vedle sebe — ale jen jednou.
          zaznam.volny.add(`${formatujMnozstvi(rozbor.mnozstvi)} ${rozbor.jednotka}`.trim());
        }
        // Řádek bez množství do `volny` nepatří: dřív se tam ukládal celý text
        // a ve sloupci pro množství pak svítilo „mandle, mandle, mandle".

        soucet.set(klic, zaznam);
      }
    }
  }

  return Array.from(soucet.values()).map((z, i) => ({
    id: `nakup-${i}`,
    name: z.nazev,
    amount: mnozstviDoTextu(z),
    category: kategorieSuroviny(z.nazev),
    checked: false
  }));
}

/** Číslo do seznamu: celá čísla bez desetin, zbytek na jedno místo s čárkou. */
function formatujMnozstvi(n: number): string {
  const zaokrouhlene = Math.round(n * 10) / 10;
  return Number.isInteger(zaokrouhlene)
    ? String(zaokrouhlene)
    : zaokrouhlene.toFixed(1).replace('.', ',');
}

function mnozstviDoTextu(z: { mnozstvi: number; jednotka: string; volny: Set<string> }): string {
  const casti: string[] = [];
  if (z.mnozstvi > 0) casti.push(`${formatujMnozstvi(z.mnozstvi)} ${z.jednotka}`.trim());
  casti.push(...z.volny);
  // Prázdný řetězec, ne název suroviny. Množství, které neznáme, se nevypisuje.
  return casti.join(' + ');
}

/**
 * Rozbor jednoho řádku suroviny na název, množství a jednotku.
 *
 * Musí zvládnout několik tvarů najednou, protože uložené plány jsou zmražené
 * v té podobě, jakou uměl kód v době generování:
 *
 *   „150 g ananas"          — dnešní tvar
 *   „olivový olej 0.9 lžíce" — starší, obrácené pořadí
 *   „3× vejce"              — bez jednotky
 *   „½ lžičky cukru"        — zlomek znakem
 *   „sůl dle chuti"         — bez množství, a to je v pořádku
 *
 * Vrací `null` jen pro prázdný řádek nebo pro zbytek po rozseknutém zlomku
 * („1 /"), který nedává smysl ukazovat.
 */
export function rozeberRadekSuroviny(
  radek: string
): { nazev: string; mnozstvi: number | null; jednotka: string } | null {
  const text = radek.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  // Pozůstatek po staré čistící regulárce nad anglickým `original`: „1 /",
  // „1 /2 lžičky cukru". Rozseknutý zlomek nepoužijeme ani jako množství.
  // Náš formátovač zlomek píše znakem („½"), takže řádek, který začíná
  // číslem a lomítkem, je vždycky pozůstatek po té staré regulárce —
  // „1 /", „1 /2 lžičky cukru", „1/ chili powder".
  if (/^\d+\s*\/\s*\d*/.test(text)) {
    const zbytek = text.replace(/^\d+\s*\/\s*\d*\s*/, '').trim();
    return zbytek ? { nazev: zbytek, mnozstvi: null, jednotka: '' } : null;
  }

  const zlomky: Record<string, number> = {
    '¼': 0.25, '⅓': 1 / 3, '½': 0.5, '⅔': 2 / 3, '¾': 0.75
  };
  const cislo = (s: string): number | null => {
    if (zlomky[s] !== undefined) return zlomky[s];
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // „3× vejce"
  const bezJednotky = text.match(/^([\d.,]+|[¼⅓½⅔¾])\s*×\s*(.+)$/);
  if (bezJednotky) {
    const n = cislo(bezJednotky[1]);
    return { nazev: bezJednotky[2].trim(), mnozstvi: n, jednotka: n === null ? '' : 'ks' };
  }

  // „150 g ananas", „½ lžičky cukru"
  const napred = text.match(/^([\d.,]+|[¼⅓½⅔¾])\s+(\S+)\s+(.+)$/);
  if (napred) {
    const n = cislo(napred[1]);
    if (n !== null) return { nazev: napred[3].trim(), mnozstvi: n, jednotka: napred[2] };
  }

  // „olivový olej 0.9 lžíce" — starší plány psaly množství až za název.
  const vzadu = text.match(/^(.+?)\s+([\d.,]+|[¼⅓½⅔¾])\s+(\S+)$/);
  if (vzadu) {
    const n = cislo(vzadu[2]);
    if (n !== null) return { nazev: vzadu[1].trim(), mnozstvi: n, jednotka: vzadu[3] };
  }

  return { nazev: text, mnozstvi: null, jednotka: '' };
}
