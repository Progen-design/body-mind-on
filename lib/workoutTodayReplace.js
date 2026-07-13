/**
 * Generování alternativy dnešního tréninku podle vybraných partií.
 * Template + wger resolve; konzervativní fallback bez ukládání nevalidního výstupu.
 */
import { resolveExercise } from './services/exerciseProviderRegistry.js';
import { filterWorkoutPlanForTrainingEnvironment } from './trainingEnvironment.js';
import { sessionTemplatesForBodyMetrics } from './workoutTemplates.js';
import { getMuscleGroupLabel } from './muscleGroupLabels.js';
import { validateMuscleSelection, getSelectionCategory } from './workoutMuscleGroupRules.js';
import { trainingSetupToBodyMetrics, equipmentLevelLabel } from './workoutTrainingSetup.js';
import { WORKOUT_REPLACE_PROMPT_VERSION } from './workoutReplacementSchema.js';
import {
  normalizeExerciseDisplayFromCanonical,
  validateWorkoutExerciseIntegrity,
} from './exerciseIntegrity.js';
import { getCanonicalExercise } from './exerciseCanonicalMap.js';

const MUSCLE_KEY_AFFINITY = {
  chest: ['chest', 'pushup', 'bench', 'press'],
  back: ['row', 'pulldown', 'pull', 'lat', 'deadlift'],
  shoulders: ['shoulder', 'overhead', 'lateral', 'raise', 'press'],
  biceps: ['bicep', 'curl'],
  triceps: ['tricep', 'pushdown', 'extension'],
  core: ['plank', 'dead_bug', 'twist', 'crunch', 'bug'],
  glutes: ['glute', 'hip_thrust', 'bridge'],
  quads: ['squat', 'leg_press', 'lunge', 'goblet'],
  hamstrings: ['hamstring', 'romanian', 'curl', 'deadlift'],
  calves: ['calf'],
};

const LOCATION_MAP = {
  home: 'home',
  gym: 'gym',
  outdoor: 'outdoor',
  no_equipment: 'home',
};

const INTENSITY_SETS = {
  light: { setsMul: 0.85, repsAdj: '12-15' },
  medium: { setsMul: 1, repsAdj: null },
  hard: { setsMul: 1.1, repsAdj: '6-10' },
};

const MAX_EXERCISES = 8;
const MAX_REGENERATIONS_PER_DAY = 2;
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

function exerciseMatchesMuscle(canonicalKey, muscleId) {
  const key = String(canonicalKey || '').toLowerCase();
  const patterns = MUSCLE_KEY_AFFINITY[muscleId] || [];
  return patterns.some((p) => key.includes(p));
}

function pickBalancedFullBody(pool, durationMinutes, intensity, attemptSeed) {
  const slots = [
    { muscles: ['quads', 'hamstrings', 'glutes'], label: 'lower' },
    { muscles: ['chest', 'shoulders'], label: 'push' },
    { muscles: ['back', 'biceps'], label: 'pull' },
  ];
  if (durationMinutes >= 30) slots.push({ muscles: ['core'], label: 'core' });

  const seen = new Set();
  const picked = [];
  let seed = attemptSeed;

  for (const slot of slots) {
    const candidates = pool.filter((ex) => {
      const ck = ex.canonical_key;
      if (!ck || seen.has(ck)) return false;
      return slot.muscles.some((m) => exerciseMatchesMuscle(ck, m));
    });
    if (!candidates.length) continue;
    const ex = candidates[seed % candidates.length];
    seed += 1;
    seen.add(ex.canonical_key);
    picked.push(ex);
  }

  const intCfg = INTENSITY_SETS[intensity] || INTENSITY_SETS.medium;
  const extraTarget = durationMinutes <= 20 ? 0 : durationMinutes <= 35 ? 1 : 2;
  for (let i = 0; i < pool.length && picked.length < slots.length + extraTarget; i += 1) {
    const ex = pool[(seed + i) % pool.length];
    const ck = ex.canonical_key;
    if (!ck || seen.has(ck)) continue;
    const balanced = ['quads', 'chest', 'back', 'core', 'shoulders', 'hamstrings'].some((m) => exerciseMatchesMuscle(ck, m));
    if (!balanced) continue;
    seen.add(ck);
    picked.push(ex);
  }

  return picked.map((ex) => {
    let sets = Math.round((ex.sets || 3) * intCfg.setsMul);
    sets = Math.max(2, Math.min(5, sets));
    return {
      ...ex,
      sets,
      reps: intCfg.repsAdj || ex.reps || '8–12',
    };
  });
}

function pickExercisesFromTemplates(templates, muscleGroups, durationMinutes, intensity, attemptSeed, category = null) {
  const flat = templates.flat();
  const isFullBody = muscleGroups.includes('full_body');
  if (isFullBody) {
    const balanced = pickBalancedFullBody(flat, durationMinutes, intensity, attemptSeed);
    if (balanced.length >= 3) return balanced;
  }

  const groups = isFullBody ? Object.keys(MUSCLE_KEY_AFFINITY) : muscleGroups;
  const matched = flat.filter((ex) => groups.some((g) => exerciseMatchesMuscle(ex.canonical_key, g)));
  const pool = matched.length >= 2 ? matched : flat;
  const seen = new Set();
  const picked = [];
  const start = attemptSeed % Math.max(1, pool.length);
  for (let i = 0; i < pool.length && picked.length < MAX_EXERCISES; i += 1) {
    const ex = pool[(start + i) % pool.length];
    const ck = ex.canonical_key;
    if (!ck || seen.has(ck)) continue;
    seen.add(ck);
    picked.push(ex);
  }
  const targetCount = durationMinutes <= 20 ? 4 : durationMinutes <= 35 ? 5 : durationMinutes <= 50 ? 6 : 7;
  const slice = picked.slice(0, Math.min(targetCount, MAX_EXERCISES));
  const intCfg = INTENSITY_SETS[intensity] || INTENSITY_SETS.medium;
  return slice.map((ex) => {
    let sets = Math.round((ex.sets || 3) * intCfg.setsMul);
    sets = Math.max(2, Math.min(5, sets));
    return {
      ...ex,
      sets,
      reps: intCfg.repsAdj || ex.reps || '8–12',
    };
  });
}

function trainingSetupToMetrics(setup, baseMetrics) {
  if (setup?.training_location && setup?.equipment_level) {
    return trainingSetupToBodyMetrics(setup, baseMetrics);
  }
  const location = setup?.location || 'gym';
  if (location === 'gym') return { ...baseMetrics, training_environment: 'gym' };
  if (location === 'no_equipment') return { ...baseMetrics, training_environment: 'home_bodyweight', available_equipment: '' };
  return { ...baseMetrics, training_environment: 'home_equipment', available_equipment: 'dumbbells,bands,bench' };
}

function buildTitle(focus) {
  if (focus.includes('full_body')) return 'Celotělový trénink na dnešek';
  const labels = focus.slice(0, 3).map(getMuscleGroupLabel);
  return `Trénink: ${labels.join(' + ')}`;
}

/**
 * @param {object} params
 * @returns {Promise<{ preview: object, structuredWorkout: object, promptVersion: string }>}
 */
export async function generateTodayWorkoutAlternative(params) {
  const {
    muscleGroups,
    category: clientCategory = null,
    location = 'gym',
    training_location = null,
    equipment_level = null,
    durationMinutes = 30,
    intensity = 'medium',
    bodyMetrics = {},
    generationAttempt = 1,
  } = params;

  const validation = validateMuscleSelection({
    selectedMuscleGroups: muscleGroups,
    durationMinutes,
  });
  if (!validation.valid) throw new Error(validation.message || 'INVALID_MUSCLE_GROUPS');

  const normalized = muscleGroups.includes('full_body')
    ? ['full_body']
    : [...new Set(muscleGroups)];
  const category = validation.category || getSelectionCategory(normalized);
  if (!category) throw new Error('INVALID_MUSCLE_CATEGORY');
  if (clientCategory && clientCategory !== category) {
    /* server-side category wins — ignore spoofed client category */
  }

  const metrics = trainingSetupToMetrics(
    training_location && equipment_level
      ? { training_location, equipment_level }
      : { location },
    bodyMetrics,
  );
  const templates = sessionTemplatesForBodyMetrics(metrics);
  const blockList = templates.map((block) => [...block]);
  const stub = { days: [{ exercises: blockList.flat() }] };
  filterWorkoutPlanForTrainingEnvironment(stub, metrics);
  const filteredKeys = new Set((stub.days[0].exercises || []).map((e) => e.canonical_key));
  const filteredTemplates = blockList.map((block) => block.filter((ex) => filteredKeys.has(ex.canonical_key)));

  const templateExercises = pickExercisesFromTemplates(
    filteredTemplates,
    normalized,
    durationMinutes,
    intensity,
    generationAttempt,
    category,
  );

  const exercises = [];
  for (const ex of templateExercises) {
    const canonicalKey = ex.canonical_key || null;
    const canonicalDef = canonicalKey ? getCanonicalExercise(canonicalKey) : null;
    let resolved = null;
    try {
      resolved = await resolveExercise(ex.search_term || canonicalKey, {
        canonicalKey,
        nameHintCs: ex.name_cs || canonicalDef?.display_name_cs || undefined,
      });
    } catch {
      resolved = null;
    }
    const verified = Boolean(
      resolved?.source && resolved.source !== 'none' && (resolved?.wger_exercise_id || resolved?.gif_url || resolved?.image_url)
    );
    const display = canonicalDef?.display_name_cs || ex.name_cs || resolved?.display_name_cs || resolved?.name || 'Cvik';
    const wgerId = resolved?.wger_exercise_id != null ? Number(resolved.wger_exercise_id) : null;
    exercises.push(normalizeExerciseDisplayFromCanonical({
      canonical_key: canonicalKey || resolved?.canonical_key || null,
      name: display,
      name_cs: display,
      display_name_cs: display,
      sets: ex.sets,
      reps: ex.reps,
      duration_sec: ex.duration_sec || null,
      rest_seconds: 60,
      instructions: verified ? (resolved.description_cs || null) : null,
      equipment: equipment_level
        ? equipmentLevelLabel(equipment_level)
        : (location === 'gym' ? 'Posilovna' : location === 'no_equipment' ? 'Bez vybavení' : 'Doma'),
      exercise_verified: !!verified,
      image_url: resolved?.image_url || null,
      gif_url: resolved?.gif_url || null,
      video_url: resolved?.video_url || null,
      wger_exercise_id: Number.isFinite(wgerId) && wgerId > 0 ? wgerId : null,
    }));
  }

  if (!exercises.length) {
    throw new Error('GENERATION_FAILED');
  }

  const integrity = validateWorkoutExerciseIntegrity(exercises);
  if (!integrity.valid) {
    console.warn('[workoutTodayReplace] exercise integrity failed', integrity.issues);
    throw new Error('GENERATION_FAILED');
  }

  const focus = normalized;
  const title = buildTitle(focus);
  const structuredWorkout = {
    duration_minutes: durationMinutes,
    title,
    focus,
    category,
    exercises,
  };

  const preview = {
    title,
    duration_minutes: durationMinutes,
    focus,
    exercises: exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps || (ex.duration_sec ? `${ex.duration_sec} s` : '—'),
      rest_seconds: ex.rest_seconds,
      instructions: ex.instructions,
      equipment: ex.equipment,
    })),
    safety_notes: ['Poslouchej své tělo. Zastav při bolesti. Toto jsou obecná doporučení, ne lékařská rada.'],
    expires_at: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(),
  };

  return {
    preview,
    structuredWorkout,
    promptVersion: WORKOUT_REPLACE_PROMPT_VERSION,
  };
}

export async function countTodayRegenerations(supabase, userId, planId, planDay) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('workout_replacements')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('plan_day', String(planDay))
    .gte('created_at', since.toISOString())
    .in('status', ['generated', 'confirmed']);
  if (error) return 0;
  return count || 0;
}

export function canRegenerateToday(attemptCount) {
  return attemptCount < MAX_REGENERATIONS_PER_DAY;
}

export { MAX_REGENERATIONS_PER_DAY, PREVIEW_TTL_MS };
