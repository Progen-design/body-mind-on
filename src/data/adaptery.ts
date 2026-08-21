// Prevod odpovedi /api/profile na tvary, ktere ceka Bento UI.
// Tvary vstupu jsou overene proti produkcni databazi, ne odhadnute.
// Relativni cesta zamerne misto aliasu @lib - soubor pak jde spustit
// i cistym Nodem (viz tools/overit-adaptery.ts), nejen pres Vite.
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../../lib/habits.js';
import type {
  BadHabitItem, ExerciseItem, HabitItem, MealItem,
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

export function naJidla(plan: any): MealItem[] {
  const den = dnesniDen(strukturaPlanu(plan));
  if (!den || !Array.isArray(den.meals)) return [];

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

  return dny
    .filter((d: any) => d?.workout && Array.isArray(d.workout.exercises))
    .map((d: any) => {
      const w = d.workout;
      const cviky: ExerciseItem[] = w.exercises.map((e: any, i: number) => ({
        id: String(e?.canonical_key || `${d.date}-cvik-${i}`),
        name: e?.display_name_cs || e?.name_cs || e?.name || 'Cvik',
        sets: cislo(e?.sets),
        reps: String(e?.reps ?? ''),
        restSec: 0,
        targetMuscle: '',
        completed: false
      }));

      return {
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
