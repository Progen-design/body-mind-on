// Prevod odpovedi /api/profile na tvary, ktere ceka Bento UI.
// Tvary vstupu jsou overene proti produkcni databazi, ne odhadnute.
// Relativni cesta zamerne misto aliasu @lib - soubor pak jde spustit
// i cistym Nodem (viz tools/overit-adaptery.ts), nejen pres Vite.
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../../lib/habits.js';
// Klice odskrtnutych aktivit maji jediny zdroj pravdy v lib/ — sdileny se
// serverem. Format se nesmi menit, rozparoval by uz ulozene radky.
import { mealActivityKey } from '../../lib/dailyActivationClient.js';
import { klicCviku, KLIC_CELEHO_TRENINKU } from '../../lib/profile/cvikDokonceni.js';
import type {
  BadHabitItem, ExerciseItem, HabitItem, MealItem, ShoppingItem,
  UserPreferences, UserProfile, WeightRecord, WorkoutDay
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
            : [])
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

const IKONY: Record<string, HabitItem['iconType']> = {
  healthy_diet: 'food', quality_sleep: 'sleep', hydration: 'water',
  daily_movement: 'steps', training: 'steps', meditation: 'mind',
  breathing: 'mind', mobility_stretch: 'mind', cold_shower: 'water',
  digital_detox_evening: 'mind'
};

export function naNavyky(userHabits: ProfilOdpoved['user_habits'] = []): HabitItem[] {
  return (userHabits || [])
    .filter((h) => h.is_positive)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((h) => {
      const def: any = POSITIVE_HABITS.find((p: any) => p.id === h.habit_id);
      return {
        id: h.habit_id,
        title: def?.label || h.habit_id,
        subtitle: def?.description,
        completed: false,
        streakDays: 0,
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
        cleanDaysStreak: 0,
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

  const soucet = new Map<string, { nazev: string; mnozstvi: number; jednotka: string; volny: string[] }>();

  for (const den of dny) {
    for (const jidlo of den?.meals || []) {
      for (const radek of jidlo?.shopping_ingredient_lines || []) {
        const text = String(radek).trim();
        if (!text) continue;
        const m = text.match(/^([\d.,]+)\s*(\S+)\s+(.+)$/);
        const nazev = (m ? m[3] : text).toLowerCase();
        const zaznam = soucet.get(nazev) || { nazev: m ? m[3] : text, mnozstvi: 0, jednotka: '', volny: [] };
        if (m) {
          const cislo = Number(String(m[1]).replace(',', '.'));
          if (Number.isFinite(cislo) && (!zaznam.jednotka || zaznam.jednotka === m[2])) {
            zaznam.jednotka = m[2];
            zaznam.mnozstvi += cislo;
          } else {
            zaznam.volny.push(text);
          }
        } else {
          zaznam.volny.push(text);
        }
        soucet.set(nazev, zaznam);
      }
    }
  }

  return Array.from(soucet.values()).map((z, i) => ({
    id: `nakup-${i}`,
    name: z.nazev,
    amount: z.mnozstvi > 0
      ? `${Math.round(z.mnozstvi * 10) / 10} ${z.jednotka}`.trim()
      : z.volny.join(', '),
    category: kategorieSuroviny(z.nazev),
    checked: false
  }));
}
