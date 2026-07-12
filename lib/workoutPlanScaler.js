/**
 * Doplnění a škálování tréninků v workout_plan před wger resolve.
 * Cíl: ~60 min session, min. 5 hlavních cviků, střídání bloků (bez kopie stejného dne).
 * Šablony cviků: lib/workoutTemplates.js
 */

import { bodyMetricsToPlanInput } from './bodyMetricsToPlanInput';
import { deriveWorkoutDays } from './validation/onboardingSchema';
import {
  rotatedTemplatesForBodyMetrics,
  cloneTemplateExercise,
  buildExercisePoolFromTemplates,
} from './workoutTemplates.js';

export { rotatedTemplatesForBodyMetrics } from './workoutTemplates.js';

const SKIP_KEYS = new Set(['warmup', 'cooldown', 'rest', 'stretch']);

function avoidWorkoutKeys(bodyMetrics = {}) {
  const raw = bodyMetrics?._avoid_workout_keys;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.map((k) => String(k || '').toLowerCase()).filter(Boolean));
}

function pickReplacementExercise(pool, { usedInDay, usedAcrossWeek, avoidKeys, sessionIndex }) {
  const candidates = [...pool.entries()]
    .filter(([key]) => !usedInDay.has(key) && !usedAcrossWeek.has(key) && !avoidKeys.has(key))
    .map(([, tpl]) => tpl);
  if (candidates.length === 0) {
    const relaxed = [...pool.entries()]
      .filter(([key]) => !usedInDay.has(key) && !avoidKeys.has(key))
      .map(([, tpl]) => tpl);
    if (relaxed.length === 0) return null;
    return cloneTemplateExercise(relaxed[sessionIndex % relaxed.length]);
  }
  return cloneTemplateExercise(candidates[sessionIndex % candidates.length]);
}

function deduplicateExercisesAcrossWeek(trainingDays, bodyMetrics = {}) {
  const templates = rotatedTemplatesForBodyMetrics(bodyMetrics);
  const pool = buildExercisePoolFromTemplates(templates);
  const avoidKeys = avoidWorkoutKeys(bodyMetrics);
  const usedAcrossWeek = new Set();
  let diversified = 0;

  trainingDays.forEach((day, sessionIndex) => {
    const exercises = (day.exercises || []).map((e) => ({ ...e }));
    const out = [];
    const usedInDay = new Set();

    for (const ex of exercises) {
      const k = normKey(ex);
      if (!isMainExercise(ex)) {
        out.push(ex);
        continue;
      }
      if (usedInDay.has(k) || usedAcrossWeek.has(k) || avoidKeys.has(k)) {
        const replacement = pickReplacementExercise(pool, {
          usedInDay,
          usedAcrossWeek,
          avoidKeys,
          sessionIndex,
        });
        if (replacement) {
          const rk = replacement.canonical_key;
          out.push(replacement);
          usedInDay.add(rk);
          usedAcrossWeek.add(rk);
          diversified += 1;
          continue;
        }
      }
      out.push(ex);
      usedInDay.add(k);
      usedAcrossWeek.add(k);
    }

    while (out.filter(isMainExercise).length < MIN_MAIN_EXERCISES) {
      const replacement = pickReplacementExercise(pool, {
        usedInDay,
        usedAcrossWeek,
        avoidKeys,
        sessionIndex,
      });
      if (!replacement) break;
      out.push(replacement);
      usedInDay.add(replacement.canonical_key);
      usedAcrossWeek.add(replacement.canonical_key);
      diversified += 1;
    }

    day.exercises = out;
  });

  return diversified;
}

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
      if (sets >= 4) continue;
      ex.sets = sets + 1;
      bumped = true;
      est = estimateWorkoutMinutes(out);
      if (est >= targetMin * 0.92) break;
    }
    if (!bumped) break;
  }
  return out.map((ex) => {
    const key = String(ex?.canonical_key || '').trim().toLowerCase();
    if (SKIP_KEYS.has(key)) return ex;
    const sets = Number(ex.sets);
    if (Number.isFinite(sets) && sets > 4) return { ...ex, sets: 4 };
    return ex;
  });
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
      const templates = rotatedTemplatesForBodyMetrics(bodyMetrics);
      const template = templates[i % templates.length];
      newDays.push({
        day_index: di,
        exercises: template.map((e) => cloneTemplateExercise(e)),
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
  const stats = { scaled_days: 0, diversified_days: 0, deduped_exercises: 0, target_min: 60 };
  const days = workoutPlan?.days;
  if (!Array.isArray(days) || days.length === 0) return stats;

  const targetMin = Math.min(
    75,
    Math.max(40, Number(bodyMetrics?.workout_duration_min) || 55)
  );
  stats.target_min = targetMin;

  const trainingDays = days.filter((d) => Array.isArray(d?.exercises) && d.exercises.length > 0);
  const fingerprints = [];

  const templates = rotatedTemplatesForBodyMetrics(bodyMetrics);

  trainingDays.forEach((day, sessionIndex) => {
    let exercises = (day.exercises || []).map((e) => ({ ...e }));
    const template = templates[sessionIndex % templates.length];
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
      const altTemplate = templates[(sessionIndex + 1) % templates.length];
      exercises = replaceDuplicateDay(exercises, altTemplate, fp);
      stats.diversified_days += 1;
    }

    exercises = scaleSetsToTarget(exercises, targetMin);
    day.exercises = exercises;
    fingerprints.push(fingerprintMainKeys(exercises));
  });

  stats.deduped_exercises = deduplicateExercisesAcrossWeek(trainingDays, bodyMetrics);

  if (stats.scaled_days > 0 || stats.diversified_days > 0 || stats.deduped_exercises > 0) {
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
