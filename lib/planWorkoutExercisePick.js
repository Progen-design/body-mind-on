/**
 * Výběr náhradního cviku ze šablon (bez wger/DB resolve).
 */
import {
  rotatedTemplatesForBodyMetrics,
  buildExercisePoolFromTemplates,
  cloneTemplateExercise,
} from './workoutTemplates.js';

const SKIP_KEYS = new Set(['warmup', 'cooldown', 'rest', 'stretch']);

function normKey(ex) {
  const k = String(ex?.canonical_key || '').trim().toLowerCase();
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

export function isReplaceableWorkoutExercise(ex) {
  const k = normKey(ex);
  return Boolean(k && !SKIP_KEYS.has(k));
}

function findPlanDay(structuredPlan, daySlotIndex) {
  const slot = Number(daySlotIndex);
  if (Number.isFinite(slot) && slot >= 0 && slot < structuredPlan.days.length) {
    return structuredPlan.days[slot];
  }
  return structuredPlan.days.find((d) => Number(d.day_index) === slot) ?? null;
}

function collectUsedExerciseKeys(structuredPlan, daySlotIndex, exerciseIndex) {
  const usedInDay = new Set();
  const usedAcrossWeek = new Set();
  structuredPlan.days.forEach((day, di) => {
    for (const [ei, ex] of (day?.workout?.exercises || []).entries()) {
      if (!isReplaceableWorkoutExercise(ex)) continue;
      const key = normKey(ex);
      if (di === daySlotIndex && ei === exerciseIndex) continue;
      usedAcrossWeek.add(key);
      if (di === daySlotIndex) usedInDay.add(key);
    }
  });
  return { usedInDay, usedAcrossWeek };
}

/**
 * @param {object} structuredPlan
 * @param {number} daySlotIndex
 * @param {number} exerciseIndex
 * @param {object} bodyMetrics
 */
export function pickWorkoutExerciseAlternative(structuredPlan, daySlotIndex, exerciseIndex, bodyMetrics = {}) {
  if (!structuredPlan?.days?.length) return null;
  const day = findPlanDay(structuredPlan, daySlotIndex);
  const exercises = day?.workout?.exercises;
  if (!Array.isArray(exercises) || !exercises[exerciseIndex]) return null;

  const current = exercises[exerciseIndex];
  if (!isReplaceableWorkoutExercise(current)) return null;

  const currentKey = normKey(current);
  const { usedInDay, usedAcrossWeek } = collectUsedExerciseKeys(
    structuredPlan,
    daySlotIndex,
    exerciseIndex
  );

  const pool = buildExercisePoolFromTemplates(rotatedTemplatesForBodyMetrics(bodyMetrics));
  const strict = [...pool.entries()]
    .filter(([key]) => key !== currentKey && !usedInDay.has(key) && !usedAcrossWeek.has(key))
    .map(([, tpl]) => tpl);

  if (strict.length) {
    return cloneTemplateExercise(strict[exerciseIndex % strict.length]);
  }

  const relaxed = [...pool.entries()]
    .filter(([key]) => key !== currentKey && !usedInDay.has(key))
    .map(([, tpl]) => tpl);

  if (!relaxed.length) return null;
  return cloneTemplateExercise(relaxed[exerciseIndex % relaxed.length]);
}
