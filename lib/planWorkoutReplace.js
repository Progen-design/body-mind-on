/**
 * Nahrazení jednoho cviku ve structured plánu (profil — stejný princip jako jídla).
 */
import { resolveExercise } from './services/exerciseProviderRegistry';
import { mergeWithTrustedRegistryMedia } from './exerciseRegistryMedia.js';
import { MAX_PUBLISHABLE_WORKOUT_SETS } from './planDataIntegrity.js';
import { renderPlanHtmlFromStructured } from './planRenderer.js';
import { stripPlanMediaAttrsFromHtml } from './emailTemplates.js';
import {
  pickWorkoutExerciseAlternative,
  isReplaceableWorkoutExercise,
} from './planWorkoutExercisePick.js';

const SKIP_KEYS = new Set(['warmup', 'cooldown', 'rest', 'stretch']);

function normKey(ex) {
  const k = String(ex?.canonical_key || '').trim().toLowerCase();
  if (k) return k;
  return String(ex?.name_cs || ex?.display_name_cs || ex?.name || '').trim().toLowerCase();
}

function exerciseDisplayName(ex) {
  return ex?.display_name_cs || ex?.name_cs || ex?.name || 'Cvik';
}

function findPlanDay(structuredPlan, daySlotIndex) {
  const slot = Number(daySlotIndex);
  if (Number.isFinite(slot) && slot >= 0 && slot < structuredPlan.days.length) {
    return structuredPlan.days[slot];
  }
  return structuredPlan.days.find((d) => Number(d.day_index) === slot) ?? null;
}

async function buildResolvedExerciseFromTemplate(tpl, previousEx) {
  const resolved = await resolveExercise(tpl.search_term || tpl.canonical_key, {
    canonicalKey: tpl.canonical_key,
    nameHintCs: tpl.name_cs,
  });

  const canonicalKey = resolved?.canonical_key ?? tpl.canonical_key ?? null;
  const registryCs = (tpl.name_cs || '').trim();
  const resolvedDisplayName =
    (resolved?.display_name_cs || '').trim() ||
    registryCs ||
    (resolved?.name || '').trim();
  const exerciseVerified =
    Boolean(canonicalKey && resolvedDisplayName && resolved?.source !== 'none');
  const display_name_cs = exerciseVerified
    ? resolvedDisplayName || 'Cvik'
    : registryCs || resolvedDisplayName || 'Cvik (neověřeno)';
  const name_cs = registryCs || display_name_cs;

  const media = mergeWithTrustedRegistryMedia(canonicalKey, {
    gif_url: resolved?.gif_url ?? null,
    image_url: resolved?.image_url ?? null,
    video_url: resolved?.video_url ?? null,
    source: resolved?.source ?? 'none',
  });

  let sets = Number(previousEx?.sets ?? tpl.sets ?? 3);
  if (!Number.isFinite(sets) || sets < 1) sets = 3;
  const keyLower = String(canonicalKey || '').trim().toLowerCase();
  if (!SKIP_KEYS.has(keyLower) && sets > MAX_PUBLISHABLE_WORKOUT_SETS) {
    sets = MAX_PUBLISHABLE_WORKOUT_SETS;
  }

  return {
    name: display_name_cs,
    name_cs,
    display_name_cs,
    canonical_key: canonicalKey,
    exercise_verified: exerciseVerified,
    sets,
    reps: previousEx?.reps ?? tpl.reps ?? null,
    duration_sec: previousEx?.duration_sec ?? tpl.duration_sec ?? null,
    image_url: media.image_url ?? null,
    gif_url: media.gif_url ?? null,
    video_url: media.video_url ?? resolved?.video_url ?? null,
    source: media.gif_url ? 'exercisedb' : (resolved?.source ?? 'none'),
    wger_exercise_id: resolved?.wger_exercise_id ?? null,
  };
}

export { pickWorkoutExerciseAlternative } from './planWorkoutExercisePick.js';

/**
 * @param {object} structuredPlan
 * @param {number} daySlotIndex
 * @param {number} exerciseIndex
 * @param {object} bodyMetrics
 */
export async function replaceWorkoutExerciseInStructuredPlan(
  structuredPlan,
  daySlotIndex,
  exerciseIndex,
  bodyMetrics = {}
) {
  if (!structuredPlan?.days?.length) {
    throw new Error('STRUCTURED_PLAN_MISSING');
  }

  const day = findPlanDay(structuredPlan, daySlotIndex);
  if (!day?.workout?.exercises?.length) throw new Error('WORKOUT_NOT_FOUND');

  const current = day.workout.exercises[exerciseIndex];
  if (!current) throw new Error('EXERCISE_NOT_FOUND');
  if (!isReplaceableWorkoutExercise(current)) throw new Error('NOT_REPLACEABLE');

  const previousTitle = exerciseDisplayName(current);
  const tpl = pickWorkoutExerciseAlternative(structuredPlan, daySlotIndex, exerciseIndex, bodyMetrics);
  if (!tpl || normKey(tpl) === normKey(current)) {
    throw new Error('NO_ALTERNATIVE');
  }

  const nextExercise = await buildResolvedExerciseFromTemplate(tpl, current);
  if (normKey(nextExercise) === normKey(current)) {
    throw new Error('NO_ALTERNATIVE');
  }

  day.workout.exercises[exerciseIndex] = {
    ...nextExercise,
    replaced_from: previousTitle,
  };

  const planHtml = stripPlanMediaAttrsFromHtml(renderPlanHtmlFromStructured(structuredPlan, bodyMetrics));

  return {
    structuredPlan,
    planHtml,
    exercise: day.workout.exercises[exerciseIndex],
    previous_title: previousTitle,
    new_title: exerciseDisplayName(day.workout.exercises[exerciseIndex]),
  };
}

export default replaceWorkoutExerciseInStructuredPlan;
