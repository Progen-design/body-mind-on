/**
 * lib/exerciseCanonicalMap.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical exercise registry.
 *
 * Problem solved: free-text API matching produces inconsistent and sometimes
 * misleading visuals (e.g. "Dřepy s vlastní vahou" → unrelated image).
 *
 * Solution: every supported exercise maps to one canonical key.
 * Each canonical key has one trusted visual source (wger.de).
 * The same exercise always resolves to the same asset → credibility and consistency.
 *
 * Trust model:
 *   trust_level: "exact"    → resolved from exercise_asset_registry or wger.de
 *   trust_level: "none"     → no visual available
 *
 * To add new exercises: add entry to CANONICAL_EXERCISES and a row in CZECH_LABEL_MAP.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Canonical exercise definitions.
 * wger_search_name: English name used for wger.de API search.
 */
export const CANONICAL_EXERCISES = {
  squat: {
    canonical_key: 'squat',
    display_name_cs: 'Dřepy',
    wger_search_name: 'squat',
    body_part: 'upper legs',
    target: 'glutes',
    equipment: 'body weight',
  },
  pushup: {
    canonical_key: 'pushup',
    display_name_cs: 'Kliky',
    wger_search_name: 'push-up',
    body_part: 'chest',
    target: 'pectorals',
    equipment: 'body weight',
  },
  pull_up: {
    canonical_key: 'pull_up',
    display_name_cs: 'Shyby / Přítahy',
    wger_search_name: 'pull-up',
    body_part: 'back',
    target: 'lats',
    equipment: 'body weight',
  },
  bent_over_row: {
    canonical_key: 'bent_over_row',
    display_name_cs: 'Přítahy v předklonu',
    wger_search_name: 'barbell bent over row',
    body_part: 'back',
    target: 'upper back',
    equipment: 'barbell',
  },
  deadlift: {
    canonical_key: 'deadlift',
    display_name_cs: 'Mrtvý tah',
    wger_search_name: 'deadlift',
    body_part: 'back',
    target: 'glutes',
    equipment: 'barbell',
  },
  romanian_deadlift: {
    canonical_key: 'romanian_deadlift',
    display_name_cs: 'Rumunský mrtvý tah',
    wger_search_name: 'romanian deadlift',
    body_part: 'upper legs',
    target: 'hamstrings',
    equipment: 'barbell',
  },
  bench_press: {
    canonical_key: 'bench_press',
    display_name_cs: 'Tlak na lavici',
    wger_search_name: 'barbell bench press',
    body_part: 'chest',
    target: 'pectorals',
    equipment: 'barbell',
  },
  overhead_press: {
    canonical_key: 'overhead_press',
    display_name_cs: 'Tlaky nad hlavu',
    wger_search_name: 'overhead press',
    body_part: 'shoulders',
    target: 'delts',
    equipment: 'barbell',
  },
  plank: {
    canonical_key: 'plank',
    display_name_cs: 'Prkno',
    wger_search_name: 'plank',
    body_part: 'waist',
    target: 'abs',
    equipment: 'body weight',
  },
  lunges: {
    canonical_key: 'lunges',
    display_name_cs: 'Výpady',
    wger_search_name: 'lunge',
    body_part: 'upper legs',
    target: 'glutes',
    equipment: 'body weight',
  },
  lateral_raise: {
    canonical_key: 'lateral_raise',
    display_name_cs: 'Rozpažky',
    wger_search_name: 'dumbbell lateral raise',
    body_part: 'shoulders',
    target: 'delts',
    equipment: 'dumbbell',
  },
  bicep_curl: {
    canonical_key: 'bicep_curl',
    display_name_cs: 'Bicepsový zdvih',
    wger_search_name: 'dumbbell bicep curl',
    body_part: 'upper arms',
    target: 'biceps',
    equipment: 'dumbbell',
  },
  tricep_extension: {
    canonical_key: 'tricep_extension',
    display_name_cs: 'Tricepsové tlaky',
    wger_search_name: 'tricep extension',
    body_part: 'upper arms',
    target: 'triceps',
    equipment: 'cable',
  },
  leg_press: {
    canonical_key: 'leg_press',
    display_name_cs: 'Tlaky nohama',
    wger_search_name: 'leg press',
    body_part: 'upper legs',
    target: 'quads',
    equipment: 'leverage machine',
  },
  warmup: {
    canonical_key: 'warmup',
    display_name_cs: 'Rozcvička',
    wger_search_name: 'dynamic stretch',
    body_part: 'full body',
    target: 'full body',
    equipment: 'body weight',
  },
  cooldown: {
    canonical_key: 'cooldown',
    display_name_cs: 'Závěr / Strečink',
    wger_search_name: 'stretch',
    body_part: 'full body',
    target: 'full body',
    equipment: 'body weight',
  },
  plank_side: {
    canonical_key: 'plank_side',
    display_name_cs: 'Boční prkno',
    wger_search_name: 'side plank',
    body_part: 'waist',
    target: 'abs',
    equipment: 'body weight',
  },
  mountain_climber: {
    canonical_key: 'mountain_climber',
    display_name_cs: 'Horolezec',
    wger_search_name: 'mountain climber',
    body_part: 'waist',
    target: 'abs',
    equipment: 'body weight',
  },
  superman: {
    canonical_key: 'superman',
    display_name_cs: 'Superman cvik',
    wger_search_name: 'superman',
    body_part: 'back',
    target: 'spine',
    equipment: 'body weight',
  },
  rest: {
    canonical_key: 'rest',
    display_name_cs: 'Odpočinek / Procházka',
    wger_search_name: 'walk',
    body_part: 'full body',
    target: 'full body',
    equipment: 'body weight',
  },
};

/**
 * Czech label fragments → canonical key.
 * Keys should be lowercase, normalized (no diacritics).
 * Longer/more specific patterns must be listed before shorter ones.
 */
const CZECH_LABEL_MAP = [
  ['superman', 'superman'],
  ['tlaky na hrudnik', 'bench_press'],
  ['tlaky na hrudník', 'bench_press'],
  ['tlaky na prsa', 'bench_press'],
  ['tlaky na ramena', 'overhead_press'],
  ['tlaky na rameno', 'overhead_press'],
  ['tlaky nad hlavu', 'overhead_press'],
  ['tlaky hlavu', 'overhead_press'],
  ['ramena jednorucky', 'overhead_press'],
  ['ramena jednoručky', 'overhead_press'],
  ['lehka prochazka', 'rest'],
  ['lehká procházka', 'rest'],
  ['rumunsky mrtvy tah', 'romanian_deadlift'],
  ['romanian deadlift', 'romanian_deadlift'],
  ['mrtvy tah', 'deadlift'],
  ['deadlift', 'deadlift'],
  ['pritahy v predklonu', 'bent_over_row'],
  ['prítahy v predklonu', 'bent_over_row'],
  ['barbell row', 'bent_over_row'],
  ['bent over row', 'bent_over_row'],
  ['bench press', 'bench_press'],
  ['tlaky nohama', 'leg_press'],
  ['leg press', 'leg_press'],
  ['bicepsovy zdvih', 'bicep_curl'],
  ['bicep curl', 'bicep_curl'],
  ['tricepsove tlaky', 'tricep_extension'],
  ['tricep extension', 'tricep_extension'],
  ['rozpazky', 'lateral_raise'],
  ['lateral raise', 'lateral_raise'],
  ['bocni prkno', 'plank_side'],
  ['side plank', 'plank_side'],
  ['mountain climber', 'mountain_climber'],
  ['prkno', 'plank'],
  ['plank', 'plank'],
  ['overhead press', 'overhead_press'],
  ['tlaky nad hlavu', 'overhead_press'],
  ['tlaky', 'overhead_press'],
  ['drepy', 'squat'],
  ['drep', 'squat'],
  ['squat', 'squat'],
  ['kliky', 'pushup'],
  ['klik', 'pushup'],
  ['push-up', 'pushup'],
  ['push up', 'pushup'],
  ['shyby', 'pull_up'],
  ['pritahy', 'bent_over_row'],
  ['pritah', 'bent_over_row'],
  ['pull-up', 'pull_up'],
  ['chin up', 'pull_up'],
  ['vypady', 'lunges'],
  ['vypad', 'lunges'],
  ['lunge', 'lunges'],
  ['rozcvicka', 'warmup'],
  ['rozcvička', 'warmup'],
  ['dynamicky stretink', 'warmup'],
  ['warmup', 'warmup'],
  ['zaver', 'cooldown'],
  ['závěr', 'cooldown'],
  ['strecink', 'cooldown'],
  ['stretink', 'cooldown'],
  ['stretching', 'cooldown'],
  ['yoga', 'cooldown'],
  ['joga', 'cooldown'],
  ['mobilita', 'cooldown'],
  ['odpocinek', 'rest'],
  ['odpočinek', 'rest'],
  ['prochazka', 'rest'],
  ['procházka', 'rest'],
  ['chuze', 'rest'],
  ['chůze', 'rest'],
  ['zvedani panve', 'cooldown'],
  ['zvedání pánve', 'cooldown'],
  ['most', 'cooldown'],
  ['zkracovacky', 'plank'],
  ['zkracovačky', 'plank'],
  ['bicycle crunch', 'plank'],
  ['beh na miste', 'rest'],
  ['běh na místě', 'rest'],
  ['lat pulldown', 'pull_up'],
  ['cable pulldown', 'pull_up'],
  ['pulldown', 'pull_up'],
  ['cable row', 'bent_over_row'],
  ['seated row', 'bent_over_row'],
  ['incline press', 'bench_press'],
  ['dumbbell press', 'bench_press'],
  ['leg extension', 'leg_press'],
  ['leg curl', 'leg_press'],
  ['calf raise', 'lunges'],
  ['goblet squat', 'squat'],
  ['front squat', 'squat'],
  ['bulgarian split squat', 'lunges'],
];

function normalizeLabel(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize exercise name for lookup key (lowercase, no diacritics).
 * Exported for use in injectExerciseKeys when canonical mapping returns null.
 */
export function normalizeExerciseLookupKey(exerciseName) {
  if (!exerciseName || typeof exerciseName !== 'string') return '';
  return exerciseName
    .split(':')[0]
    .trim()
    .slice(0, 80)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a Czech (or English) exercise label to a canonical key.
 * Returns null if no canonical mapping found.
 *
 * @param {string} exerciseName  Free-text exercise name from plan HTML.
 * @returns {string|null}        Canonical key (e.g. "squat") or null.
 */
export function resolveToCanonicalKey(exerciseName) {
  if (!exerciseName || typeof exerciseName !== 'string') return null;

  // Take the name before any colon (strip sets/reps info like "Dřepy: 4×12")
  const baseName = exerciseName.split(':')[0].trim();
  const normalized = normalizeLabel(baseName);

  for (const [fragment, key] of CZECH_LABEL_MAP) {
    if (normalized.includes(fragment)) return key;
  }
  return null;
}

/**
 * Get canonical exercise definition by key.
 * @param {string} key  Canonical key.
 * @returns {object|null}
 */
export function getCanonicalExercise(key) {
  return CANONICAL_EXERCISES[key] ?? null;
}

/**
 * List all canonical keys.
 * @returns {string[]}
 */
export function listCanonicalKeys() {
  return Object.keys(CANONICAL_EXERCISES);
}
