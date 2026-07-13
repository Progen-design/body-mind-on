/**
 * Generování alternativy dnešního tréninku podle vybraných partií.
 * Template + wger resolve; konzervativní fallback bez ukládání nevalidního výstupu.
 */
import { resolveExercise } from './services/exerciseProviderRegistry.js';
import { filterWorkoutPlanForTrainingEnvironment } from './trainingEnvironment.js';
import { sessionTemplatesForBodyMetrics } from './workoutTemplates.js';
import { getMuscleGroupLabel, normalizeMuscleGroupSelection } from './muscleGroupLabels.js';
import { WORKOUT_REPLACE_PROMPT_VERSION } from './workoutReplacementSchema.js';

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

function pickExercisesFromTemplates(templates, muscleGroups, durationMinutes, intensity, attemptSeed) {
  const flat = templates.flat();
  const groups = muscleGroups.includes('full_body') ? Object.keys(MUSCLE_KEY_AFFINITY) : muscleGroups;
  const matched = flat.filter((ex) => groups.some((g) => exerciseMatchesMuscle(ex.canonical_key, g)));
  const pool = matched.length >= 3 ? matched : flat;
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

function locationToBodyMetrics(location, baseMetrics) {
  const loc = LOCATION_MAP[location] || parseTrainingEnvironmentFallback(baseMetrics);
  if (location === 'gym') return { ...baseMetrics, training_environment: 'gym' };
  if (location === 'no_equipment') return { ...baseMetrics, training_environment: 'home', available_equipment: '' };
  return { ...baseMetrics, training_environment: 'home_equipment' };
}

function parseTrainingEnvironmentFallback(bm) {
  const env = String(bm?.training_environment || 'gym');
  return env === 'home' ? 'home' : env === 'home_equipment' ? 'home_equipment' : 'gym';
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
    location = 'gym',
    durationMinutes = 30,
    intensity = 'medium',
    bodyMetrics = {},
    generationAttempt = 1,
  } = params;

  const norm = normalizeMuscleGroupSelection(muscleGroups);
  if (!norm.ok) throw new Error(norm.error || 'INVALID_MUSCLE_GROUPS');

  const metrics = locationToBodyMetrics(location, bodyMetrics);
  const templates = sessionTemplatesForBodyMetrics(metrics);
  const blockList = templates.map((block) => [...block]);
  const stub = { days: [{ exercises: blockList.flat() }] };
  filterWorkoutPlanForTrainingEnvironment(stub, metrics);
  const filteredKeys = new Set((stub.days[0].exercises || []).map((e) => e.canonical_key));
  const filteredTemplates = blockList.map((block) => block.filter((ex) => filteredKeys.has(ex.canonical_key)));

  const templateExercises = pickExercisesFromTemplates(
    filteredTemplates,
    norm.normalized,
    durationMinutes,
    intensity,
    generationAttempt,
  );

  const exercises = [];
  for (const ex of templateExercises) {
    let resolved = null;
    try {
      resolved = await resolveExercise(ex.search_term || ex.canonical_key);
    } catch {
      resolved = null;
    }
    const verified = resolved?.source === 'wger' && resolved?.name;
    const display = verified
      ? (resolved.display_name_cs || resolved.name || ex.name_cs || 'Cvik')
      : (ex.name_cs || 'Cvik');
    exercises.push({
      canonical_key: ex.canonical_key || resolved?.canonical_key || null,
      name: display,
      name_cs: display,
      display_name_cs: display,
      sets: ex.sets,
      reps: ex.reps,
      duration_sec: ex.duration_sec || null,
      rest_seconds: 60,
      instructions: verified ? (resolved.description_cs || null) : null,
      equipment: location === 'gym' ? 'Posilovna' : location === 'no_equipment' ? 'Bez vybavení' : 'Doma',
      exercise_verified: !!verified,
      image_url: resolved?.image_url || null,
      gif_url: resolved?.gif_url || null,
      video_url: resolved?.video_url || null,
      wger_exercise_id: resolved?.wger_exercise_id || null,
    });
  }

  if (!exercises.length) {
    throw new Error('GENERATION_FAILED');
  }

  const focus = norm.normalized;
  const title = buildTitle(focus);
  const structuredWorkout = {
    duration_minutes: durationMinutes,
    title,
    focus,
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
