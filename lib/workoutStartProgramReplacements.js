/**
 * NÁHRADY PRO START PROGRAM — tenký konzument nad datovým seedem
 * `lib/seeds/nahradyCviku.js` (žebříček 1–3 náhrad ke každému slotu ze
 * zmrazených šablon `lib/workoutStartProgram.js`). Data i zdůvodnění výběru
 * jsou v seedu; tady jen `name_cs` pro UI a jedna vyhledávací funkce.
 *
 * MÉDIUM A ZOBRAZENÍ V UI SE TADY NEŘEŠÍ. Když kandidát nemá `gif_url`,
 * UI obrázek prostě nezobrazí a schová tlačítko „Jak na to" — nedosazuje
 * se vizuálně podobný cvik místo něj, to by uživatele pletlo nejvíc.
 */
import { NAHRADY_CVIKU } from './seeds/nahradyCviku.js';

/**
 * @typedef {'gym'|'home_equipment'|'home_bodyweight'} StartProgramEnv
 */

/**
 * Metadata jen pro cviky, které se v žebříčku náhrad skutečně používají
 * (jako nahrazovaný cvik nebo jako náhrada) — ne celý katalog. `pattern` a
 * `muscle` tady jsou VLASTNÍ tagy pro ověření „náhrada se liší od
 * originálu" (viz test), nezaměňovat s jedenáctivzorovou klasifikací v
 * `lib/seeds/pohyboveVzoryCviku.js`, která slouží vyloučení cviků
 * (`lib/trainingExclusions.js`) a má jiný účel i jinou zrnitost.
 *
 * `envs` říká, ve kterém prostředí START programu se cvik smí nabídnout
 * jako náhrada (podle skutečně použitého vybavení v šablonách, ne podle
 * teoretické `equipment_class` — `overhead_press` má v registru
 * `dumbbell`, ale používá se v gymu i doma stejně).
 *
 * @type {Readonly<Record<string, { name_cs: string, muscle: string, pattern: string, envs: StartProgramEnv[] }>>}
 */
export const REPLACEMENT_EXERCISE_META = Object.freeze({
  goblet_squat: { name_cs: 'Goblet dřep', muscle: 'quads', pattern: 'squat', envs: ['gym'] },
  bench_press: { name_cs: 'Bench press', muscle: 'chest', pattern: 'h_push', envs: ['gym'] },
  bent_over_row: { name_cs: 'Přítahy v předklonu', muscle: 'back', pattern: 'h_pull', envs: ['gym'] },
  leg_press: { name_cs: 'Tlaky nohama', muscle: 'quads', pattern: 'squat', envs: ['gym'] },
  romanian_deadlift: { name_cs: 'Rumunský mrtvý tah', muscle: 'hamstrings', pattern: 'hinge', envs: ['gym'] },
  lat_pulldown: { name_cs: 'Stahování na kladce', muscle: 'back', pattern: 'v_pull', envs: ['gym'] },
  hamstring_curl: { name_cs: 'Zakopávání vleže', muscle: 'hamstrings', pattern: 'iso_leg', envs: ['gym'] },
  chest_press: { name_cs: 'Chest press', muscle: 'chest', pattern: 'h_push', envs: ['gym'] },
  farmer_carry: { name_cs: 'Farmer carry', muscle: 'full_body', pattern: 'carry', envs: ['gym', 'home_equipment'] },

  overhead_press: { name_cs: 'Tlaky nad hlavu', muscle: 'shoulders', pattern: 'v_push', envs: ['gym', 'home_equipment'] },
  tricep_extension: { name_cs: 'Tricepsové tlaky', muscle: 'triceps', pattern: 'iso_arm', envs: ['gym', 'home_equipment'] },
  pull_up: { name_cs: 'Shyby / Přítahy', muscle: 'back', pattern: 'v_pull', envs: ['gym', 'home_equipment'] },
  bicep_curl: { name_cs: 'Bicepsový zdvih', muscle: 'biceps', pattern: 'iso_arm', envs: ['gym', 'home_equipment'] },

  plank: { name_cs: 'Prkno', muscle: 'abs', pattern: 'core_static', envs: ['gym', 'home_equipment', 'home_bodyweight'] },
  dead_bug: { name_cs: 'Dead bug', muscle: 'abs', pattern: 'core_dynamic', envs: ['gym', 'home_equipment', 'home_bodyweight'] },

  dumbbell_bench_press: { name_cs: 'Tlak na lavici s jednoručkami', muscle: 'chest', pattern: 'h_push', envs: ['home_equipment'] },
  dumbbell_row: { name_cs: 'Přítahy s jednoručkou', muscle: 'back', pattern: 'h_pull', envs: ['home_equipment'] },
  dumbbell_romanian_deadlift: { name_cs: 'Rumunský mrtvý tah s jednoručkami', muscle: 'hamstrings', pattern: 'hinge', envs: ['home_equipment'] },

  squat: { name_cs: 'Dřepy', muscle: 'quads', pattern: 'squat', envs: ['home_equipment', 'home_bodyweight'] },
  lunges: { name_cs: 'Výpady', muscle: 'quads', pattern: 'squat', envs: ['home_equipment', 'home_bodyweight'] },
  glute_bridge: { name_cs: 'Gluteální most', muscle: 'glutes', pattern: 'hinge', envs: ['home_equipment', 'home_bodyweight'] },
  superman: { name_cs: 'Superman', muscle: 'lower_back', pattern: 'lowback_ext', envs: ['home_equipment', 'home_bodyweight'] },
  pushup: { name_cs: 'Kliky', muscle: 'chest', pattern: 'h_push', envs: ['home_equipment', 'home_bodyweight'] },
  russian_twist: { name_cs: 'Russian twist', muscle: 'abs', pattern: 'core_rotation', envs: ['home_equipment', 'home_bodyweight'] },
  plank_side: { name_cs: 'Boční prkno', muscle: 'abs', pattern: 'core_lateral', envs: ['home_equipment', 'home_bodyweight'] },
  single_leg_butt_kick: { name_cs: 'Kopy jednonož', muscle: 'quads', pattern: 'cardio_plyo', envs: ['home_equipment', 'home_bodyweight'] },
  mountain_climber: { name_cs: 'Mountain climber', muscle: 'cardio', pattern: 'cardio_plyo', envs: ['home_equipment', 'home_bodyweight'] },
  glute_kickback: { name_cs: 'Zapažování', muscle: 'glutes', pattern: 'hinge', envs: ['home_equipment', 'home_bodyweight'] },
  bent_knee_hip_raise: { name_cs: 'Zvedání pánve s pokrčenými koleny', muscle: 'abs', pattern: 'core_raise', envs: ['home_equipment', 'home_bodyweight'] },
  calf_raise: { name_cs: 'Zvedání na špičky', muscle: 'calves', pattern: 'calf', envs: ['home_equipment', 'home_bodyweight'] },
  crunch_hands_overhead: { name_cs: 'Zkracovačky nad hlavou', muscle: 'abs', pattern: 'core_flex', envs: ['home_equipment', 'home_bodyweight'] },
  burpee: { name_cs: 'Burpee', muscle: 'full_body', pattern: 'cardio_plyo', envs: ['home_equipment', 'home_bodyweight'] },
  jumping_jack: { name_cs: 'Poskoky', muscle: 'cardio', pattern: 'cardio_low_impact', envs: ['home_equipment', 'home_bodyweight'] },
});

/**
 * Žebříček 1–3 náhrad podle prostředí a `canonical_key` nahrazovaného cviku.
 * Data žijí v `lib/seeds/nahradyCviku.js` — tady jen re-export pod
 * historickým jménem, ať se nemusí přepisovat volající kód a testy.
 *
 * @type {Readonly<Record<StartProgramEnv, Readonly<Record<string, readonly string[]>>>>}
 */
export const START_PROGRAM_REPLACEMENTS = NAHRADY_CVIKU;

/**
 * Žebříček náhrad pro jeden slot, ve tvaru pro UI.
 *
 * @param {StartProgramEnv} envKey
 * @param {string} canonicalKey
 * @returns {Array<{ canonical_key: string, name_cs: string }>}
 */
export function replacementsForStartSlot(envKey, canonicalKey) {
  const list = START_PROGRAM_REPLACEMENTS[envKey]?.[canonicalKey];
  if (!list) return [];
  return list.map((key) => ({
    canonical_key: key,
    name_cs: REPLACEMENT_EXERCISE_META[key]?.name_cs ?? key,
  }));
}

export default START_PROGRAM_REPLACEMENTS;
