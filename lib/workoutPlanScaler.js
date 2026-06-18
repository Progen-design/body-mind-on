/**
 * Doplnění a škálování tréninků v workout_plan před wger resolve.
 * Cíl: ~60 min session, min. 5 hlavních cviků, střídání bloků (bez kopie stejného dne).
 */

import { bodyMetricsToPlanInput } from './bodyMetricsToPlanInput';
import { deriveWorkoutDays } from './validation/onboardingSchema';

const SKIP_KEYS = new Set(['warmup', 'cooldown', 'rest', 'stretch']);

/** @typedef {{ canonical_key: string, search_term?: string, name_cs: string, sets?: number, reps?: string|null, duration_sec?: number|null }} TemplateExercise */

/** Rotující bloky – full body / dolní+core / horní / síla+core */
const SESSION_TEMPLATES = [
  [
    { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy', sets: 4, reps: '10-12' },
    { canonical_key: 'pushup', search_term: 'push up', name_cs: 'Kliky', sets: 3, reps: '10-12' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', name_cs: 'Přítahy v předklonu', sets: 3, reps: '10' },
    { canonical_key: 'lunges', search_term: 'lunge', name_cs: 'Výpady', sets: 3, reps: '10 na nohu' },
    { canonical_key: 'glute_bridge', search_term: 'hip bridge', name_cs: 'Zvedání pánve', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 45 },
  ],
  [
    { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy', sets: 4, reps: '8-10' },
    { canonical_key: 'lunges', search_term: 'lunge', name_cs: 'Výpady v chůzi', sets: 3, reps: '10 na nohu' },
    { canonical_key: 'glute_bridge', search_term: 'hip bridge', name_cs: 'Zvedání pánve', sets: 3, reps: '15' },
    { canonical_key: 'mountain_climber', search_term: 'mountain climber', name_cs: 'Mountain climber', sets: 3, duration_sec: 40 },
    { canonical_key: 'plank_side', search_term: 'side plank', name_cs: 'Boční prkno', sets: 3, duration_sec: 30 },
    { canonical_key: 'russian_twist', search_term: 'russian twist', name_cs: 'Ruský twist', sets: 3, reps: '16' },
  ],
  [
    { canonical_key: 'pushup', search_term: 'push up', name_cs: 'Kliky', sets: 4, reps: '8-12' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', name_cs: 'Přítahy', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', name_cs: 'Tlaky na ramena', sets: 3, reps: '10' },
    { canonical_key: 'bicep_curl', search_term: 'bicep curl', name_cs: 'Bicepsový zdvih', sets: 3, reps: '12' },
    { canonical_key: 'tricep_extension', search_term: 'tricep extension', name_cs: 'Triceps', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 40 },
  ],
  [
    { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy', sets: 4, reps: '10' },
    { canonical_key: 'romanian_deadlift', search_term: 'romanian deadlift', name_cs: 'Rumunský mrtvý tah', sets: 3, reps: '10' },
    { canonical_key: 'lunges', search_term: 'lunge', name_cs: 'Výpady', sets: 3, reps: '10 na nohu' },
    { canonical_key: 'pull_up', search_term: 'pull up', name_cs: 'Přítahy na hrazdě', sets: 3, reps: '6-10' },
    { canonical_key: 'superman', search_term: 'superman', name_cs: 'Superman', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 45 },
  ],
];

const MIN_MAIN_EXERCISES = 5;
const REST_MIN_PER_SET = 0.75;
const WARMUP_COOLDOWN_MIN = 10;

function normKey(ex) {
  const k = String(ex?.canonical_key || '').toLowerCase().trim();
  if (k) return k;
  const name = String(ex?.name_cs || ex?.display_name_cs || ex?.name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (name.includes('prkno') || name.includes('plank')) return 'plank';
  if (name.includes('vypad') || name.includes('lunge')) return 'lunges';
  if (name.includes('drep') || name.includes('squat')) return 'squat';
  if (name.includes('klik') || name.includes('push')) return 'pushup';
  return name.slice(0, 40) || 'unknown';
}

function isMainExercise(ex) {
  const k = normKey(ex);
  return k && !SKIP_KEYS.has(k);
}

function parseRepsMax(reps) {
  if (reps == null) return 10;
  const s = String(reps).trim();
  const m = s.match(/(\d+)/);
  if (!m) return 10;
  const nums = s.match(/\d+/g)?.map(Number) || [10];
  return Math.max(...nums);
}

/** Odhad délky tréninku v minutách (vč. rozcvičky/závěru). */
export function estimateWorkoutMinutes(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0;
  let total = WARMUP_COOLDOWN_MIN;
  for (const ex of exercises) {
    if (!isMainExercise(ex)) continue;
    const sets = Math.max(1, Number(ex.sets) || 3);
    const dur = Number(ex.duration_sec ?? ex.duration_seconds);
    if (Number.isFinite(dur) && dur > 0) {
      total += sets * (dur / 60 + REST_MIN_PER_SET);
    } else {
      const reps = parseRepsMax(ex.reps);
      total += sets * (Math.max(0.5, (reps * 3) / 60) + REST_MIN_PER_SET + 0.5);
    }
  }
  return Math.round(total);
}

function fingerprintMainKeys(exercises) {
  return exercises
    .filter(isMainExercise)
    .map(normKey)
    .sort()
    .join('|');
}

function cloneTemplateExercise(tpl) {
  return {
    canonical_key: tpl.canonical_key,
    search_term: tpl.search_term ?? tpl.canonical_key,
    name_cs: tpl.name_cs,
    sets: tpl.sets ?? 3,
    reps: tpl.reps ?? null,
    duration_sec: tpl.duration_sec ?? null,
  };
}

function mergeTemplateIntoDay(exercises, template, existingKeys) {
  const out = exercises.map((e) => ({ ...e }));
  const keys = new Set(existingKeys);
  for (const tpl of template) {
    if (out.filter(isMainExercise).length >= MIN_MAIN_EXERCISES) break;
    const k = tpl.canonical_key;
    if (keys.has(k)) continue;
    out.push(cloneTemplateExercise(tpl));
    keys.add(k);
  }
  return out;
}

function replaceDuplicateDay(exercises, altTemplate, duplicateKeys) {
  const dupSet = new Set(duplicateKeys.split('|').filter(Boolean));
  const out = [];
  const added = new Set();
  for (const ex of exercises) {
    const k = normKey(ex);
    if (dupSet.has(k) && isMainExercise(ex)) {
      continue;
    }
    out.push({ ...ex });
    if (isMainExercise(ex)) added.add(k);
  }
  for (const tpl of altTemplate) {
    if (out.filter(isMainExercise).length >= MIN_MAIN_EXERCISES) break;
    if (added.has(tpl.canonical_key)) continue;
    out.push(cloneTemplateExercise(tpl));
    added.add(tpl.canonical_key);
  }
  return out;
}

function scaleSetsToTarget(exercises, targetMin) {
  const out = exercises.map((e) => ({ ...e }));
  let est = estimateWorkoutMinutes(out);
  let guard = 0;
  while (est < targetMin * 0.92 && guard < 32) {
    guard += 1;
    let bumped = false;
    for (const ex of out) {
      if (!isMainExercise(ex)) continue;
      const sets = Number(ex.sets) || 3;
      if (sets >= 5) continue;
      ex.sets = sets + 1;
      bumped = true;
      est = estimateWorkoutMinutes(out);
      if (est >= targetMin * 0.92) break;
    }
    if (!bumped) break;
  }
  return out;
}

function dayHasRealTraining(day) {
  return (day?.exercises ?? []).some((ex) => {
    const k = String(ex?.canonical_key ?? '').trim().toLowerCase();
    return k && k !== 'rest';
  });
}

/**
 * Sjednotí workout_plan s workouts_per_week z profilu (AI často vrátí 7 tréninkových dnů).
 * Přiřadí nejlepší bloky na preferred_workout_days a zbytek zahodí.
 * @param {object|null|undefined} workoutPlan
 * @param {object} [bodyMetrics]
 * @returns {{ reassigned: number, trimmed: number, kept: number }}
 */
export function enforceWorkoutsPerWeekInPlan(workoutPlan, bodyMetrics = {}) {
  const stats = { reassigned: 0, trimmed: 0, kept: 0 };
  const days = workoutPlan?.days;
  if (!Array.isArray(days) || days.length === 0) return stats;

  const planInput = bodyMetricsToPlanInput(bodyMetrics);
  const targetCount = planInput.workouts_per_week;
  const slotIndices = deriveWorkoutDays(targetCount, planInput.preferred_workout_days);
  const allowedSet = new Set(slotIndices);

  if (targetCount === 0) {
    workoutPlan.days = [];
    workoutPlan.workout_days = [];
    return stats;
  }

  const trainingBlocks = days
    .filter(dayHasRealTraining)
    .sort((a, b) => {
      const ai = Number(a.day_index);
      const bi = Number(b.day_index);
      const aScore = allowedSet.has(ai) ? 0 : 1;
      const bScore = allowedSet.has(bi) ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return ai - bi;
    })
    .slice(0, targetCount);

  stats.trimmed = Math.max(0, days.filter(dayHasRealTraining).length - trainingBlocks.length);

  const newDays = [];
  for (let i = 0; i < slotIndices.length; i++) {
    const di = slotIndices[i];
    const source = trainingBlocks[i];
    if (source) {
      if (Number(source.day_index) !== di) stats.reassigned += 1;
      newDays.push({
        ...source,
        day_index: di,
        exercises: (source.exercises || []).map((e) => ({ ...e })),
      });
    } else {
      const template = SESSION_TEMPLATES[i % SESSION_TEMPLATES.length];
      newDays.push({
        day_index: di,
        exercises: template.map((e) => ({ ...e })),
      });
    }
  }

  stats.kept = newDays.filter((d) => (d.exercises || []).length > 0).length;
  workoutPlan.days = newDays.sort((a, b) => Number(a.day_index) - Number(b.day_index));
  workoutPlan.workout_days = slotIndices.slice(0, stats.kept > 0 ? stats.kept : slotIndices.length);

  if (stats.trimmed > 0 || stats.reassigned > 0) {
    console.info('[workoutPlanScaler] enforceWorkoutsPerWeek', stats, { slotIndices });
  }
  return stats;
}

/**
 * @param {object|null|undefined} workoutPlan
 * @param {object} [bodyMetrics]
 * @returns {{ scaled_days: number, diversified_days: number, target_min: number }}
 */
export function scaleAndDiversifyWorkoutPlan(workoutPlan, bodyMetrics = {}) {
  const stats = { scaled_days: 0, diversified_days: 0, target_min: 60 };
  const days = workoutPlan?.days;
  if (!Array.isArray(days) || days.length === 0) return stats;

  const targetMin = Math.min(
    90,
    Math.max(45, Number(bodyMetrics?.workout_duration_min) || 60)
  );
  stats.target_min = targetMin;

  const trainingDays = days.filter((d) => Array.isArray(d?.exercises) && d.exercises.length > 0);
  const fingerprints = [];

  trainingDays.forEach((day, sessionIndex) => {
    let exercises = (day.exercises || []).map((e) => ({ ...e }));
    const template = SESSION_TEMPLATES[sessionIndex % SESSION_TEMPLATES.length];
    const existingKeys = new Set(exercises.map(normKey));

    const mainCount = exercises.filter(isMainExercise).length;
    const est = estimateWorkoutMinutes(exercises);
    if (mainCount < MIN_MAIN_EXERCISES || est < targetMin * 0.65) {
      exercises = mergeTemplateIntoDay(exercises, template, existingKeys);
      stats.scaled_days += 1;
    }

    const fp = fingerprintMainKeys(exercises);
    const dupIdx = fingerprints.findIndex((f) => f && f === fp && fp.length > 3);
    if (dupIdx >= 0) {
      const altTemplate = SESSION_TEMPLATES[(sessionIndex + 1) % SESSION_TEMPLATES.length];
      exercises = replaceDuplicateDay(exercises, altTemplate, fp);
      stats.diversified_days += 1;
    }

    exercises = scaleSetsToTarget(exercises, targetMin);
    day.exercises = exercises;
    fingerprints.push(fingerprintMainKeys(exercises));
  });

  if (stats.scaled_days > 0 || stats.diversified_days > 0) {
    console.info('[workoutPlanScaler] applied', stats);
  }
  return stats;
}

/**
 * Nastaví duration_minutes u workout objektů ve finálním planJson.
 * @param {object} planJson
 * @param {number} targetMin
 */
export function applyWorkoutDurationMinutesToPlan(planJson, targetMin = 60) {
  const days = planJson?.days;
  if (!Array.isArray(days)) return;
  for (const day of days) {
    if (!day?.workout?.exercises?.length) continue;
    const est = estimateWorkoutMinutes(day.workout.exercises);
    day.workout.duration_minutes = Math.max(targetMin, est);
  }
}
