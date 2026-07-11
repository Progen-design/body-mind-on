/**
 * lib/workoutTemplates.js
 * Jediný zdroj pravdy pro šablony tréninků (HOME / GYM / domácí vybavení).
 * Používá: workoutPlanScaler, deterministicFallback, replace-workout.
 */

import { parseTrainingEnvironment, parseAvailableEquipment } from './trainingEnvironment.js';

/** @typedef {{ canonical_key: string, search_term?: string, name_cs?: string, sets?: number, reps?: string|null, duration_sec?: number|null }} WorkoutTemplateExercise */

/** @typedef {WorkoutTemplateExercise[]} WorkoutTemplateBlock */

/** Domácí / vlastní váha — scaler (4 rotující bloky, ~60 min). */
export const HOME_BODYWEIGHT_TEMPLATES = Object.freeze([
  Object.freeze([
    { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy', sets: 4, reps: '10-12' },
    { canonical_key: 'pushup', search_term: 'push up', name_cs: 'Kliky', sets: 3, reps: '10-12' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', name_cs: 'Přítahy v předklonu', sets: 3, reps: '10' },
    { canonical_key: 'lunges', search_term: 'lunge', name_cs: 'Výpady', sets: 3, reps: '10 na nohu' },
    { canonical_key: 'glute_bridge', search_term: 'hip bridge', name_cs: 'Zvedání pánve', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 45 },
  ]),
  Object.freeze([
    { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy', sets: 4, reps: '8-10' },
    { canonical_key: 'lunges', search_term: 'lunge', name_cs: 'Výpady v chůzi', sets: 3, reps: '10 na nohu' },
    { canonical_key: 'glute_bridge', search_term: 'hip bridge', name_cs: 'Zvedání pánve', sets: 3, reps: '15' },
    { canonical_key: 'mountain_climber', search_term: 'mountain climber', name_cs: 'Mountain climber', sets: 3, duration_sec: 40 },
    { canonical_key: 'plank_side', search_term: 'side plank', name_cs: 'Boční prkno', sets: 3, duration_sec: 30 },
    { canonical_key: 'russian_twist', search_term: 'russian twist', name_cs: 'Ruský twist', sets: 3, reps: '16' },
  ]),
  Object.freeze([
    { canonical_key: 'pushup', search_term: 'push up', name_cs: 'Kliky', sets: 4, reps: '8-12' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', name_cs: 'Přítahy', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', name_cs: 'Tlaky na ramena', sets: 3, reps: '10' },
    { canonical_key: 'bicep_curl', search_term: 'bicep curl', name_cs: 'Bicepsový zdvih', sets: 3, reps: '12' },
    { canonical_key: 'tricep_extension', search_term: 'tricep extension', name_cs: 'Triceps', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 40 },
  ]),
  Object.freeze([
    { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy', sets: 4, reps: '10' },
    { canonical_key: 'romanian_deadlift', search_term: 'romanian deadlift', name_cs: 'Rumunský mrtvý tah', sets: 3, reps: '10' },
    { canonical_key: 'lunges', search_term: 'lunge', name_cs: 'Výpady', sets: 3, reps: '10 na nohu' },
    { canonical_key: 'pull_up', search_term: 'pull up', name_cs: 'Přítahy na hrazdě', sets: 3, reps: '6-10' },
    { canonical_key: 'superman', search_term: 'superman', name_cs: 'Superman', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 45 },
  ]),
]);

/** Posilovna — scaler (4 rotující bloky). */
export const GYM_TEMPLATES = Object.freeze([
  Object.freeze([
    { canonical_key: 'leg_press', search_term: 'leg press', name_cs: 'Leg press', sets: 4, reps: '12' },
    { canonical_key: 'goblet_squat', search_term: 'goblet squat', name_cs: 'Goblet dřep', sets: 3, reps: '12' },
    { canonical_key: 'chest_press', search_term: 'machine chest press', name_cs: 'Chest press', sets: 3, reps: '10' },
    { canonical_key: 'lat_pulldown', search_term: 'lat pulldown', name_cs: 'Stahování horní kladky', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'seated row', name_cs: 'Přítahy v sedě', sets: 3, reps: '10' },
    { canonical_key: 'romanian_deadlift', search_term: 'dumbbell romanian deadlift', name_cs: 'Rumunský mrtvý tah', sets: 3, reps: '10' },
    { canonical_key: 'dead_bug', search_term: 'dead bug', name_cs: 'Dead bug', sets: 3, reps: '12' },
  ]),
  Object.freeze([
    { canonical_key: 'leg_press', search_term: 'leg press', name_cs: 'Leg press', sets: 4, reps: '10' },
    { canonical_key: 'hip_thrust', search_term: 'hip thrust', name_cs: 'Hip thrust', sets: 3, reps: '12' },
    { canonical_key: 'lat_pulldown', search_term: 'lat pulldown', name_cs: 'Stahování horní kladky', sets: 3, reps: '10' },
    { canonical_key: 'chest_press', search_term: 'incline chest press', name_cs: 'Tlak na šikmé lavici', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'cable row', name_cs: 'Přítahy na kladce', sets: 3, reps: '12' },
    { canonical_key: 'hamstring_curl', search_term: 'leg curl', name_cs: 'Zakopávání vleže', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 40 },
  ]),
  Object.freeze([
    { canonical_key: 'chest_press', search_term: 'chest press', name_cs: 'Chest press', sets: 4, reps: '8-10' },
    { canonical_key: 'lat_pulldown', search_term: 'lat pulldown', name_cs: 'Stahování horní kladky', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', name_cs: 'Tlaky na ramena', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', name_cs: 'Přítahy v předklonu', sets: 3, reps: '10' },
    { canonical_key: 'bicep_curl', search_term: 'bicep curl', name_cs: 'Bicepsový zdvih', sets: 3, reps: '12' },
    { canonical_key: 'tricep_extension', search_term: 'tricep pushdown', name_cs: 'Triceps na kladce', sets: 3, reps: '12' },
    { canonical_key: 'farmer_carry', search_term: 'farmer walk', name_cs: 'Farmer carry', sets: 3, duration_sec: 40 },
  ]),
  Object.freeze([
    { canonical_key: 'goblet_squat', search_term: 'goblet squat', name_cs: 'Goblet dřep', sets: 3, reps: '12' },
    { canonical_key: 'leg_press', search_term: 'leg press', name_cs: 'Leg press', sets: 4, reps: '12' },
    { canonical_key: 'romanian_deadlift', search_term: 'romanian deadlift', name_cs: 'Rumunský mrtvý tah', sets: 3, reps: '10' },
    { canonical_key: 'chest_press', search_term: 'bench press machine', name_cs: 'Chest press', sets: 3, reps: '10' },
    { canonical_key: 'lat_pulldown', search_term: 'lat pulldown', name_cs: 'Stahování horní kladky', sets: 3, reps: '10' },
    { canonical_key: 'lateral_raise', search_term: 'lateral raise', name_cs: 'Upažování', sets: 3, reps: '12' },
    { canonical_key: 'dead_bug', search_term: 'dead bug', name_cs: 'Dead bug', sets: 3, reps: '12' },
  ]),
]);

/** Domácí bez vybavení — deterministický fallback (3 bloky). */
export const HOME_BODYWEIGHT_FALLBACK_BLOCKS = Object.freeze([
  Object.freeze([
    { canonical_key: 'squat', search_term: 'squat', sets: 3, reps: '10-12' },
    { canonical_key: 'pushup', search_term: 'push up', sets: 3, reps: '8-10' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', sets: 3, reps: '10' },
    { canonical_key: 'plank', search_term: 'plank', sets: 3, duration_sec: 45 },
    { canonical_key: 'lunges', search_term: 'lunge', sets: 3, reps: '10 per leg' },
  ]),
  Object.freeze([
    { canonical_key: 'squat', search_term: 'squat', sets: 4, reps: '10' },
    { canonical_key: 'lunges', search_term: 'lunge', sets: 3, reps: '10 per leg' },
    { canonical_key: 'glute_bridge', search_term: 'hip bridge', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', sets: 3, duration_sec: 30 },
    { canonical_key: 'pushup', search_term: 'push up', sets: 3, reps: '12' },
  ]),
  Object.freeze([
    { canonical_key: 'pushup', search_term: 'push up', sets: 4, reps: '8-10' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', sets: 3, reps: '10' },
    { canonical_key: 'plank', search_term: 'plank', sets: 3, duration_sec: 30 },
    { canonical_key: 'lunges', search_term: 'lunge', sets: 3, reps: '10 per leg' },
  ]),
]);

/** Domácí s jednoručkami / lavicí — deterministický fallback (3 bloky). */
export const HOME_EQUIPMENT_DUMBBELL_BENCH_TEMPLATES = Object.freeze([
  Object.freeze([
    { canonical_key: 'squat', search_term: 'dumbbell squat', sets: 4, reps: '10-12' },
    { canonical_key: 'bench_press', search_term: 'dumbbell bench press', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'dumbbell row', sets: 3, reps: '10' },
    { canonical_key: 'romanian_deadlift', search_term: 'dumbbell romanian deadlift', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'dumbbell shoulder press', sets: 3, reps: '10' },
  ]),
  Object.freeze([
    { canonical_key: 'squat', search_term: 'dumbbell squat', sets: 4, reps: '10' },
    { canonical_key: 'lunges', search_term: 'dumbbell lunge', sets: 3, reps: '10 per leg' },
    { canonical_key: 'bench_press', search_term: 'dumbbell bench press', sets: 3, reps: '10' },
    { canonical_key: 'bicep_curl', search_term: 'dumbbell curl', sets: 3, reps: '12' },
    { canonical_key: 'tricep_extension', search_term: 'dumbbell tricep extension', sets: 3, reps: '12' },
  ]),
  Object.freeze([
    { canonical_key: 'romanian_deadlift', search_term: 'dumbbell romanian deadlift', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'dumbbell row', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'dumbbell shoulder press', sets: 3, reps: '10' },
    { canonical_key: 'lateral_raise', search_term: 'dumbbell lateral raise', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', sets: 3, duration_sec: 40 },
  ]),
]);

/** Posilovna — deterministický fallback (3 bloky). */
export const GYM_FALLBACK_BLOCKS = Object.freeze([
  Object.freeze([
    { canonical_key: 'leg_press', search_term: 'leg press', sets: 4, reps: '12' },
    { canonical_key: 'bench_press', search_term: 'bench press', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'seated row', sets: 3, reps: '10' },
    { canonical_key: 'romanian_deadlift', search_term: 'romanian deadlift', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', sets: 3, reps: '10' },
  ]),
  Object.freeze([
    { canonical_key: 'leg_press', search_term: 'leg press', sets: 4, reps: '10' },
    { canonical_key: 'bench_press', search_term: 'incline bench press', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'cable row', sets: 3, reps: '12' },
    { canonical_key: 'tricep_extension', search_term: 'tricep pushdown', sets: 3, reps: '12' },
    { canonical_key: 'bicep_curl', search_term: 'bicep curl', sets: 3, reps: '12' },
  ]),
  Object.freeze([
    { canonical_key: 'bench_press', search_term: 'bench press', sets: 4, reps: '8-10' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', sets: 3, reps: '10' },
    { canonical_key: 'lateral_raise', search_term: 'lateral raise', sets: 3, reps: '12' },
    { canonical_key: 'tricep_extension', search_term: 'tricep extension', sets: 3, reps: '12' },
  ]),
]);

/** @deprecated alias — použij HOME_BODYWEIGHT_FALLBACK_BLOCKS */
export const HOME_WORKOUT_BLOCKS = HOME_BODYWEIGHT_FALLBACK_BLOCKS;

/** @deprecated alias — použij GYM_FALLBACK_BLOCKS */
export const GYM_WORKOUT_BLOCKS = GYM_FALLBACK_BLOCKS;

/**
 * Šablony pro scaler / replace-workout (gym vs domácí vlastní váha).
 * @param {object} [bodyMetrics]
 * @returns {WorkoutTemplateBlock[]}
 */
export function sessionTemplatesForBodyMetrics(bodyMetrics = {}) {
  const env = parseTrainingEnvironment(bodyMetrics);
  return env === 'gym' ? GYM_TEMPLATES : HOME_BODYWEIGHT_TEMPLATES;
}

/**
 * Bloky pro deterministický fallback (včetně domácího vybavení).
 * @param {object} [bodyMetrics]
 * @returns {WorkoutTemplateBlock[]}
 */
export function workoutBlocksForBodyMetrics(bodyMetrics = {}) {
  const env = parseTrainingEnvironment(bodyMetrics);
  if (env === 'gym') return GYM_FALLBACK_BLOCKS;
  if (env === 'home_equipment') {
    const equip = parseAvailableEquipment(bodyMetrics);
    if (equip.includes('dumbbells') || equip.includes('bench')) {
      return HOME_EQUIPMENT_DUMBBELL_BENCH_TEMPLATES;
    }
  }
  return HOME_BODYWEIGHT_FALLBACK_BLOCKS;
}

function rotationOffset(bodyMetrics = {}) {
  const seed = [
    bodyMetrics?.user_id,
    bodyMetrics?.valid_from,
    bodyMetrics?.email,
    String(bodyMetrics?.workout_days || ''),
    String(bodyMetrics?.frequency || bodyMetrics?.freq_choice || ''),
  ].filter(Boolean).join('|');
  if (!seed) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function rotateTemplateBlocks(blocks, bodyMetrics = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (list.length === 0) return [];
  const off = rotationOffset(bodyMetrics) % list.length;
  return [...list.slice(off), ...list.slice(0, off)];
}

/** Rotace session šablon podle uživatele/týdne. */
export function rotatedTemplatesForBodyMetrics(bodyMetrics = {}) {
  return rotateTemplateBlocks(sessionTemplatesForBodyMetrics(bodyMetrics), bodyMetrics);
}

/** Rotace fallback bloků (stejná logika jako session). */
export function rotatedFallbackBlocksForBodyMetrics(bodyMetrics = {}) {
  return rotateTemplateBlocks(workoutBlocksForBodyMetrics(bodyMetrics), bodyMetrics);
}

/**
 * @param {WorkoutTemplateExercise} tpl
 * @returns {WorkoutTemplateExercise}
 */
export function cloneTemplateExercise(tpl) {
  return {
    canonical_key: tpl.canonical_key,
    search_term: tpl.search_term ?? tpl.canonical_key,
    name_cs: tpl.name_cs,
    sets: tpl.sets ?? 3,
    reps: tpl.reps ?? null,
    duration_sec: tpl.duration_sec ?? null,
  };
}

/**
 * Unikátní cviky ze všech bloků (pro deduplikaci / náhrady).
 * @param {WorkoutTemplateBlock[]} templates
 * @returns {Map<string, WorkoutTemplateExercise>}
 */
export function buildExercisePoolFromTemplates(templates) {
  const pool = new Map();
  for (const template of templates || []) {
    for (const ex of template) {
      if (!pool.has(ex.canonical_key)) pool.set(ex.canonical_key, ex);
    }
  }
  return pool;
}
