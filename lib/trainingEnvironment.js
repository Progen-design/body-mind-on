/**
 * Parsování prostředí tréninku z body_metrics (bez DB migrace — ukládá se do notes).
 */

export const TRAINING_ENVIRONMENT_LABELS = Object.freeze({
  gym: 'Posilovna',
  home_bodyweight: 'Doma bez vybavení',
  home_equipment: 'Doma s vybavením',
});

export const TRAINING_ENVIRONMENT_OPTIONS = Object.freeze([
  { value: 'gym', label: TRAINING_ENVIRONMENT_LABELS.gym },
  { value: 'home_bodyweight', label: TRAINING_ENVIRONMENT_LABELS.home_bodyweight },
  { value: 'home_equipment', label: TRAINING_ENVIRONMENT_LABELS.home_equipment },
]);

const EQUIPMENT_LABELS = Object.freeze({
  dumbbells: 'Jednoručky',
  bands: 'Odporové gumy',
  pullup_bar: 'Hrazda',
  kettlebell: 'Kettlebell',
  bench: 'Lavice',
  trx: 'TRX / závěsný systém',
  other: 'Jiné',
});

export const EQUIPMENT_OPTIONS = Object.freeze(
  Object.entries(EQUIPMENT_LABELS).map(([value, label]) => ({ value, label }))
);

const GYM_ONLY_CANONICAL = new Set([
  'bench_press',
  'chest_press',
  'leg_press',
  'lat_pulldown',
  'bent_over_row',
  'romanian_deadlift',
  'overhead_press',
  'lateral_raise',
  'bicep_curl',
  'tricep_extension',
  'hip_thrust',
  'hamstring_curl',
  'goblet_squat',
]);

/** Povolené core/bodyweight doplňky v posilovně (max v šabloně). */
const GYM_ACCESSORY_CANONICAL = new Set(['plank', 'dead_bug', 'farmer_carry']);

/** Cviky, které u gym = posilovna nesmí být hlavní blok (domácí / vlastní váha). */
const GYM_FORBIDDEN_CANONICAL = new Set([
  'pushup',
  'squat',
  'lunges',
  'glute_bridge',
  'mountain_climber',
  'plank_side',
  'russian_twist',
  'superman',
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
  crunch: { canonical_key: 'dead_bug', search_term: 'dead bug', name_cs: 'Dead bug', sets: 3, reps: '12' },
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
  chest_press: { canonical_key: 'pushup', search_term: 'push up', name_cs: 'Kliky', sets: 3, reps: '10-12' },
  lat_pulldown: { canonical_key: 'superman', search_term: 'superman', name_cs: 'Superman', sets: 3, reps: '12' },
  goblet_squat: { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy s vlastní vahou', sets: 3, reps: '12' },
  hip_thrust: { canonical_key: 'glute_bridge', search_term: 'hip bridge', name_cs: 'Zvedání pánve', sets: 3, reps: '12' },
  hamstring_curl: { canonical_key: 'glute_bridge', search_term: 'hip bridge', name_cs: 'Zvedání pánve', sets: 3, reps: '12' },
  farmer_carry: { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 40 },
  dead_bug: { canonical_key: 'plank', search_term: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 35 },
  pull_up: { canonical_key: 'superman', search_term: 'superman', name_cs: 'Superman', sets: 3, reps: '12' },
});

/** Posilovací stroje — doma s vybavením nikdy nepoužít (lavice ≠ leg press). */
const GYM_MACHINE_ONLY = new Set([
  'leg_press',
  'lat_pulldown',
  'chest_press',
  'hamstring_curl',
  'hip_thrust',
]);

const EQUIPMENT_REQUIRES = Object.freeze({
  pull_up: new Set(['pullup_bar']),
  bent_over_row: new Set(['dumbbells', 'bands', 'bench', 'kettlebell']),
  bench_press: new Set(['bench', 'dumbbells']),
  romanian_deadlift: new Set(['dumbbells', 'kettlebell']),
  overhead_press: new Set(['dumbbells', 'kettlebell']),
  lateral_raise: new Set(['dumbbells', 'bands']),
  bicep_curl: new Set(['dumbbells', 'bands']),
  tricep_extension: new Set(['dumbbells', 'bands', 'trx']),
  goblet_squat: new Set(['kettlebell', 'dumbbells']),
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
    if (label.includes('bez vybaven')) return 'home_bodyweight';
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

/**
 * Odstraní z notes staré záznamy o prostředí tréninku.
 * @param {string|null|undefined} notes
 * @returns {string|null}
 */
export function stripTrainingEnvironmentFromNotes(notes) {
  const cleaned = String(notes || '')
    .replace(/\s*Kde cvičí:[^.;]*\.?/gi, '')
    .replace(/\s*Pomůcky:[^.;]*\.?/gi, '')
    .trim()
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return cleaned || null;
}

/**
 * @param {string|null|undefined} notes
 * @param {'gym'|'home_bodyweight'|'home_equipment'|string|null} env
 * @param {string[]} equipment
 * @returns {string|null}
 */
export function mergeTrainingEnvironmentIntoNotes(notes, env, equipment = []) {
  const base = stripTrainingEnvironmentFromNotes(notes);
  const normalizedEnv = String(env || '').trim().toLowerCase();
  if (!TRAINING_ENVIRONMENT_LABELS[normalizedEnv]) {
    return base;
  }
  const suffix = trainingEnvironmentNotesSuffix(normalizedEnv, equipment);
  return base ? `${base}. ${suffix}` : suffix;
}

function equipmentHas(requiredSet, available) {
  if (!requiredSet || requiredSet.size === 0) return true;
  return [...requiredSet].some((item) => available.includes(item));
}

/**
 * @param {string[]} equipment
 */
export function formatAvailableEquipmentLabels(equipment = []) {
  return equipment.map((key) => EQUIPMENT_LABELS[key] || key).filter(Boolean);
}

/**
 * @param {object|null|undefined} bodyMetrics
 */
export function trainingEnvironmentDisplayFromMetrics(bodyMetrics) {
  const env = parseTrainingEnvironment(bodyMetrics);
  const label = TRAINING_ENVIRONMENT_LABELS[env] || TRAINING_ENVIRONMENT_LABELS.gym;
  const equipment = parseAvailableEquipment(bodyMetrics);
  if (env === 'home_equipment' && equipment.length) {
    return `Typ: ${label} · Pomůcky: ${formatAvailableEquipmentLabels(equipment).join(', ')}`;
  }
  return `Typ: ${label}`;
}

function resolveHomeEquipmentReplacement(key, availableEquipment = []) {
  const hasDumbbells = availableEquipment.includes('dumbbells');
  const hasBench = availableEquipment.includes('bench');
  const hasKettlebell = availableEquipment.includes('kettlebell');

  if (key === 'leg_press') {
    if (hasDumbbells) {
      return { canonical_key: 'squat', search_term: 'dumbbell squat', name_cs: 'Dřepy s jednoručkami', sets: 4, reps: '10-12' };
    }
    return BODYWEIGHT_REPLACEMENTS.leg_press;
  }
  if (key === 'lat_pulldown') {
    if (hasDumbbells) {
      return { canonical_key: 'bent_over_row', search_term: 'dumbbell row', name_cs: 'Přítahy s jednoručkou', sets: 3, reps: '10' };
    }
    return BODYWEIGHT_REPLACEMENTS.lat_pulldown;
  }
  if (key === 'chest_press') {
    if (hasBench && hasDumbbells) {
      return { canonical_key: 'bench_press', search_term: 'dumbbell bench press', name_cs: 'Tlaky s jednoručkami na lavici', sets: 3, reps: '10' };
    }
    if (hasDumbbells) {
      return { canonical_key: 'overhead_press', search_term: 'dumbbell press', name_cs: 'Tlaky s jednoručkami', sets: 3, reps: '10' };
    }
    return BODYWEIGHT_REPLACEMENTS.chest_press;
  }
  if (key === 'hamstring_curl') {
    if (hasDumbbells) {
      return { canonical_key: 'romanian_deadlift', search_term: 'dumbbell romanian deadlift', name_cs: 'Rumunský mrtvý tah s jednoručkami', sets: 3, reps: '10' };
    }
    return BODYWEIGHT_REPLACEMENTS.hamstring_curl;
  }
  if (key === 'hip_thrust') {
    if (hasBench) {
      return { canonical_key: 'glute_bridge', search_term: 'barbell hip thrust', name_cs: 'Zvedání pánve s lavicí', sets: 3, reps: '12' };
    }
    return BODYWEIGHT_REPLACEMENTS.hip_thrust;
  }
  if (key === 'goblet_squat') {
    if (hasKettlebell) {
      return { canonical_key: 'goblet_squat', search_term: 'goblet squat', name_cs: 'Goblet dřepy', sets: 3, reps: '12' };
    }
    if (hasDumbbells) {
      return { canonical_key: 'squat', search_term: 'dumbbell squat', name_cs: 'Dřepy s jednoručkami', sets: 3, reps: '12' };
    }
    return BODYWEIGHT_REPLACEMENTS.goblet_squat;
  }

  return BODYWEIGHT_REPLACEMENTS[key] || null;
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
    if (GYM_ACCESSORY_CANONICAL.has(key)) return exercise;
    return exercise;
  }

  if (env === 'home_bodyweight') {
    if (GYM_ONLY_CANONICAL.has(key)) {
      const replacement = BODYWEIGHT_REPLACEMENTS[key];
      if (replacement) return { ...exercise, ...replacement };
    }
    const requiredBw = EQUIPMENT_REQUIRES[key];
    if (requiredBw && !equipmentHas(requiredBw, availableEquipment)) {
      const replacement = BODYWEIGHT_REPLACEMENTS[key];
      if (replacement) return { ...exercise, ...replacement };
    }
    return exercise;
  }

  if (env === 'home_equipment') {
    if (GYM_MACHINE_ONLY.has(key) || key === 'goblet_squat') {
      const replacement = resolveHomeEquipmentReplacement(key, availableEquipment);
      if (replacement) return { ...exercise, ...replacement };
    }

    const required = EQUIPMENT_REQUIRES[key];
    if (required && !equipmentHas(required, availableEquipment)) {
      const replacement = resolveHomeEquipmentReplacement(key, availableEquipment)
        || BODYWEIGHT_REPLACEMENTS[key];
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
