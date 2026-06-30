/**
 * Parsování prostředí tréninku z body_metrics (bez DB migrace — ukládá se do notes).
 */

export const TRAINING_ENVIRONMENT_LABELS = Object.freeze({
  gym: 'Posilovna',
  home_bodyweight: 'Doma bez vybavení',
  home_equipment: 'Doma s vybavením',
});

const EQUIPMENT_LABELS = Object.freeze({
  dumbbells: 'Jednoručky',
  bands: 'Odporové gumy',
  pullup_bar: 'Hrazda',
  kettlebell: 'Kettlebell',
  bench: 'Lavice',
  trx: 'TRX / závěsný systém',
  other: 'Jiné',
});

const GYM_ONLY_CANONICAL = new Set([
  'bench_press',
  'leg_press',
  'bent_over_row',
  'romanian_deadlift',
  'overhead_press',
  'lateral_raise',
  'bicep_curl',
  'tricep_extension',
]);

/** Cviky, které u gym = posilovna nesmí zůstat (domácí / vlastní váha). */
const GYM_FORBIDDEN_CANONICAL = new Set([
  'pushup',
  'squat',
  'lunges',
  'glute_bridge',
  'mountain_climber',
  'plank_side',
  'russian_twist',
  'superman',
  'plank',
  'crunch',
  'burpee',
  'jumping_jack',
]);

const GYM_STRICT_REPLACEMENTS = Object.freeze({
  pushup: { canonical_key: 'bench_press', search_term: 'bench press', name_cs: 'Bench press', sets: 3, reps: '10' },
  squat: { canonical_key: 'leg_press', search_term: 'leg press', name_cs: 'Leg press', sets: 4, reps: '12' },
  lunges: { canonical_key: 'leg_press', search_term: 'leg press', name_cs: 'Leg press', sets: 3, reps: '12' },
  glute_bridge: { canonical_key: 'romanian_deadlift', search_term: 'romanian deadlift', name_cs: 'Rumunský mrtvý tah', sets: 3, reps: '10' },
  mountain_climber: { canonical_key: 'bent_over_row', search_term: 'cable row', name_cs: 'Přítahy na kladce', sets: 3, reps: '12' },
  plank_side: { canonical_key: 'lateral_raise', search_term: 'lateral raise', name_cs: 'Upažování s činkou', sets: 3, reps: '12' },
  russian_twist: { canonical_key: 'bent_over_row', search_term: 'cable woodchop', name_cs: 'Rotace na kladce', sets: 3, reps: '12' },
  superman: { canonical_key: 'bent_over_row', search_term: 'seated row', name_cs: 'Přítahy v sedě', sets: 3, reps: '10' },
  plank: { canonical_key: 'tricep_extension', search_term: 'tricep pushdown', name_cs: 'Triceps na kladce', sets: 3, reps: '12' },
  crunch: { canonical_key: 'bicep_curl', search_term: 'bicep curl', name_cs: 'Bicepsový zdvih', sets: 3, reps: '12' },
  burpee: { canonical_key: 'leg_press', search_term: 'leg press', name_cs: 'Leg press', sets: 3, reps: '12' },
  jumping_jack: { canonical_key: 'lateral_raise', search_term: 'lateral raise', name_cs: 'Upažování', sets: 3, reps: '12' },
});

const BODYWEIGHT_REPLACEMENTS = Object.freeze({
  bench_press: { canonical_key: 'pushup', search_term: 'push up', name_cs: 'Kliky', sets: 3, reps: '10-12' },
  bent_over_row: { canonical_key: 'superman', search_term: 'superman', name_cs: 'Superman', sets: 3, reps: '12' },
  romanian_deadlift: { canonical_key: 'glute_bridge', search_term: 'hip bridge', name_cs: 'Zvedání pánve', sets: 3, reps: '12' },
  overhead_press: { canonical_key: 'pushup', search_term: 'push up', name_cs: 'Kliky', sets: 3, reps: '10' },
  lateral_raise: { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 40 },
  bicep_curl: { canonical_key: 'pushup', search_term: 'push up', name_cs: 'Kliky', sets: 3, reps: '12' },
  tricep_extension: { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 35 },
  leg_press: { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy s vlastní vahou', sets: 4, reps: '12' },
  pull_up: { canonical_key: 'superman', search_term: 'superman', name_cs: 'Superman', sets: 3, reps: '12' },
});

const EQUIPMENT_REQUIRES = Object.freeze({
  pull_up: new Set(['pullup_bar']),
  bent_over_row: new Set(['dumbbells', 'bands', 'bench', 'kettlebell']),
  bench_press: new Set(['bench', 'dumbbells']),
  romanian_deadlift: new Set(['dumbbells', 'kettlebell']),
  overhead_press: new Set(['dumbbells', 'kettlebell']),
  lateral_raise: new Set(['dumbbells', 'bands']),
  bicep_curl: new Set(['dumbbells', 'bands']),
  tricep_extension: new Set(['dumbbells', 'bands', 'trx']),
  leg_press: new Set(['bench']),
});

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,;\n]+/).map((v) => v.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

/**
 * @param {object|null|undefined} bodyMetrics
 */
export function parseTrainingEnvironment(bodyMetrics) {
  const direct = String(bodyMetrics?.training_environment || '').trim().toLowerCase();
  if (direct === 'gym' || direct === 'home_bodyweight' || direct === 'home_equipment') return direct;

  const notes = String(bodyMetrics?.notes || '');
  const match = notes.match(/Kde cvičí:\s*([^.;]+)/i);
  if (match) {
    const label = match[1].trim().toLowerCase();
    if (label.includes('posilov')) return 'gym';
    if (label.includes('doma') && label.includes('vybaven')) return 'home_equipment';
    if (label.includes('doma')) return 'home_bodyweight';
  }

  return 'gym';
}

/**
 * @param {object|null|undefined} bodyMetrics
 */
export function parseAvailableEquipment(bodyMetrics) {
  const direct = normalizeList(bodyMetrics?.available_equipment);
  if (direct.length) return direct;

  const notes = String(bodyMetrics?.notes || '');
  const match = notes.match(/Pomůcky:\s*([^.;]+)/i);
  if (!match) return [];

  const chunk = match[1].trim().toLowerCase();
  const found = [];
  for (const [key, label] of Object.entries(EQUIPMENT_LABELS)) {
    if (chunk.includes(label.toLowerCase()) || chunk.includes(key.replace('_', ' '))) {
      found.push(key);
    }
  }
  return found;
}

/**
 * @param {string} env
 * @param {string[]} equipment
 */
export function trainingEnvironmentNotesSuffix(env, equipment = []) {
  const label = TRAINING_ENVIRONMENT_LABELS[env] || TRAINING_ENVIRONMENT_LABELS.gym;
  const parts = [`Kde cvičí: ${label}`];
  if (env === 'home_equipment' && equipment.length) {
    const labels = equipment.map((key) => EQUIPMENT_LABELS[key] || key).filter(Boolean);
    if (labels.length) parts.push(`Pomůcky: ${labels.join(', ')}`);
  }
  return parts.join('. ');
}

function equipmentHas(requiredSet, available) {
  if (!requiredSet || requiredSet.size === 0) return true;
  return [...requiredSet].some((item) => available.includes(item));
}

/**
 * @param {object} exercise
 * @param {string} env
 * @param {string[]} availableEquipment
 */
export function adaptExerciseForTrainingEnvironment(exercise, env, availableEquipment = []) {
  const key = String(exercise?.canonical_key || '').trim().toLowerCase();
  if (!key) return exercise;

  if (env === 'gym') {
    if (GYM_FORBIDDEN_CANONICAL.has(key)) {
      const replacement = GYM_STRICT_REPLACEMENTS[key];
      if (replacement) return { ...exercise, ...replacement };
    }
    return exercise;
  }

  if (env === 'home_bodyweight') {
    if (GYM_ONLY_CANONICAL.has(key)) {
      const replacement = BODYWEIGHT_REPLACEMENTS[key];
      if (replacement) return { ...exercise, ...replacement };
    }
    return exercise;
  }

  if (env === 'home_equipment') {
    const required = EQUIPMENT_REQUIRES[key];
    if (required && !equipmentHas(required, availableEquipment)) {
      const replacement = BODYWEIGHT_REPLACEMENTS[key];
      if (replacement) return { ...exercise, ...replacement };
    }
  }

  return exercise;
}

/**
 * @param {object|null|undefined} workoutPlan
 * @param {object} bodyMetrics
 */
export function filterWorkoutPlanForTrainingEnvironment(workoutPlan, bodyMetrics = {}) {
  const env = parseTrainingEnvironment(bodyMetrics);
  const equipment = parseAvailableEquipment(bodyMetrics);
  if (!workoutPlan?.days?.length) return { env, equipment, adapted: 0 };

  let adapted = 0;
  for (const day of workoutPlan.days) {
    if (!Array.isArray(day.exercises)) continue;
    day.exercises = day.exercises.map((ex) => {
      const next = adaptExerciseForTrainingEnvironment(ex, env, equipment);
      if (next !== ex) adapted += 1;
      return next;
    });
  }

  if (adapted > 0) {
    console.info('[trainingEnvironment] adapted exercises', { env, equipment, adapted });
  }

  return { env, equipment, adapted };
}

export default parseTrainingEnvironment;
