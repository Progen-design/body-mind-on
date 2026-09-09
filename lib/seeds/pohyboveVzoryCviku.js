/**
 * POHYBOVÉ VZORY A KONTRAINDIKACE — ručně, pro 33 canonical_key, které se
 * skutečně objevují v `START_PROGRAM_VARIANTS` (30, viz komentář níž) nebo
 * jako náhrada v `lib/seeds/nahradyCviku.js` (+3: `farmer_carry`, `burpee`,
 * `jumping_jack`). Nic se neodvozuje z partie ani z nářadí — `pattern` je
 * nezávislý úsudek o TOM, JAK se cvik dělá, ne z čeho je udělaný ani co bolí.
 *
 * MĚŘENO 9. 9. 2026: dvanáct zmrazených polí (`GYM_A-D`, `HOME_EQUIP_A-D`,
 * `HOME_BW_A-D` v `lib/workoutStartProgram.js`) obsahuje dohromady 30
 * unikátních `canonical_key` (viz commit message KROK 4 — vyloučení cviků).
 *
 * `pattern` — jeden z jedenácti pohybových vzorů (žádný jiný se nepoužívá):
 *   squat, hinge, lunge, horizontal_push, vertical_push, horizontal_pull,
 *   vertical_pull, core, carry, plyo, cardio_impact.
 * Kde přesná anatomie neodpovídá žádnému vzoru 1:1 (izolace loktu, lýtko),
 * je zvolen nejbližší příbuzný vzor a je to okomentované u konkrétního
 * řádku — necháváme to poctivě vidět, ne schované za nálepkou "ostatní".
 *
 * `contraindications` — ze zadaného seznamu: knee, lower_back, shoulder,
 * wrist, neck, impact. Znamená „tenhle cvik typicky zatěžuje tohle místo",
 * ne diagnózu. Slouží k vyloučení podle omezení, ne k nahrazení lékaře
 * (text v UI to říká explicitně, viz krok 7 registrace).
 *
 * `floor_required` — cvik se dělá vleže/v kleku na zemi. Používá se přímo
 * UI chipem „Cviky vleže na zemi" (`applyExclusions` ho čte jako virtuální
 * vzor `'floor'` v `patterns`, viz lib/trainingExclusions.js).
 *
 * DVĚ POLE NAVÍC OPROTI PŮVODNÍMU ZADÁNÍ (`pattern, contraindications,
 * floor_required`) — ZASTAVENÍ, PROČ JSOU TADY:
 *   `muscle` — vyloučení podle partie ("vynechat ramena") potřebuje vědět
 *     partii. Registr (`exercise_asset_registry.primary_muscle`) ji má, ale
 *     hodnoty (`abs`, `lower_back`, `cardio`...) nesedí na slovník, který už
 *     UI umí česky popsat — `lib/muscleGroupLabels.js` (`MUSCLE_GROUP_IDS`).
 *     Radši jedno pole navíc tady než třetí seznam jen pro svaly a riziko,
 *     že se rozejdou dva zdroje pravdy o tomtéž cviku.
 *   `bodyHalf` — krok 6 (ventil) výslovně žádá „zkus jinou partii ze stejné
 *     poloviny těla" — bez uloženého „která polovina" by to nešlo napsat.
 *     `upper` | `lower` | `core` | `full_body`.
 * Obě pole jsou odvozená ručně, se stejnou opatrností jako `pattern` —
 * ne z partie/nářadí, ale z toho, kde se cvik v těle skutečně děje.
 *
 * `muscle` používá klíče z `MUSCLE_GROUP_IDS` (lib/muscleGroupLabels.js),
 * NE syrové `primary_muscle` z registru — `abs → core`, `lower_back → back`,
 * `cardio → full_body`. Cvik nejde surová hodnota z DB, jde přes tenhle
 * překlad, aby chipy partií v kroku 7 mohly rovnou použít
 * `getMuscleGroupLabel()`.
 *
 * @typedef {'squat'|'hinge'|'lunge'|'horizontal_push'|'vertical_push'|'horizontal_pull'|'vertical_pull'|'core'|'carry'|'plyo'|'cardio_impact'} PohybovyVzor
 * @typedef {'knee'|'lower_back'|'shoulder'|'wrist'|'neck'|'impact'} Kontraindikace
 * @typedef {'upper'|'lower'|'core'|'full_body'} PolovinaTela
 * @typedef {{ pattern: PohybovyVzor, contraindications: Kontraindikace[], floor_required: boolean, muscle: string, bodyHalf: PolovinaTela }} PohyboveVzoryZaznam
 */

/** @type {Readonly<Record<string, PohyboveVzoryZaznam>>} */
export const POHYBOVE_VZORY_CVIKU = Object.freeze({
  goblet_squat: { pattern: 'squat', contraindications: ['knee'], floor_required: false, muscle: 'glutes', bodyHalf: 'lower' },
  bench_press: { pattern: 'horizontal_push', contraindications: ['shoulder', 'wrist'], floor_required: false, muscle: 'chest', bodyHalf: 'upper' },
  bent_over_row: { pattern: 'horizontal_pull', contraindications: ['lower_back'], floor_required: false, muscle: 'back', bodyHalf: 'upper' },
  leg_press: { pattern: 'squat', contraindications: ['knee'], floor_required: false, muscle: 'glutes', bodyHalf: 'lower' },
  plank: { pattern: 'core', contraindications: ['wrist', 'shoulder'], floor_required: true, muscle: 'core', bodyHalf: 'core' },
  romanian_deadlift: { pattern: 'hinge', contraindications: ['lower_back'], floor_required: false, muscle: 'glutes', bodyHalf: 'lower' },
  overhead_press: { pattern: 'vertical_push', contraindications: ['shoulder'], floor_required: false, muscle: 'shoulders', bodyHalf: 'upper' },
  lat_pulldown: { pattern: 'vertical_pull', contraindications: ['shoulder'], floor_required: false, muscle: 'back', bodyHalf: 'upper' },
  // Izolovaná flexe kolena — nejbližší z jedenácti vzorů je "hinge"
  // (posteriorní řetězec), i když se v kloubu neděje kyčelní předklon.
  hamstring_curl: { pattern: 'hinge', contraindications: ['knee'], floor_required: false, muscle: 'hamstrings', bodyHalf: 'lower' },
  dead_bug: { pattern: 'core', contraindications: [], floor_required: true, muscle: 'core', bodyHalf: 'core' },
  chest_press: { pattern: 'horizontal_push', contraindications: ['shoulder'], floor_required: false, muscle: 'chest', bodyHalf: 'upper' },
  // Extenze lokte — synergista tlaku (triceps dotahuje každý tlak), proto
  // "horizontal_push", ne vlastní izolační kategorie, která v enumu není.
  tricep_extension: { pattern: 'horizontal_push', contraindications: ['shoulder', 'wrist'], floor_required: false, muscle: 'triceps', bodyHalf: 'upper' },
  pull_up: { pattern: 'vertical_pull', contraindications: ['shoulder', 'wrist'], floor_required: false, muscle: 'back', bodyHalf: 'upper' },
  // Flexe lokte — synergista tahu (biceps pomáhá každému přítahu), proto
  // "horizontal_pull".
  bicep_curl: { pattern: 'horizontal_pull', contraindications: ['wrist'], floor_required: false, muscle: 'biceps', bodyHalf: 'upper' },
  squat: { pattern: 'squat', contraindications: ['knee'], floor_required: false, muscle: 'glutes', bodyHalf: 'lower' },
  dumbbell_bench_press: { pattern: 'horizontal_push', contraindications: ['shoulder', 'wrist'], floor_required: false, muscle: 'chest', bodyHalf: 'upper' },
  dumbbell_row: { pattern: 'horizontal_pull', contraindications: ['lower_back'], floor_required: false, muscle: 'back', bodyHalf: 'upper' },
  lunges: { pattern: 'lunge', contraindications: ['knee'], floor_required: false, muscle: 'glutes', bodyHalf: 'lower' },
  dumbbell_romanian_deadlift: { pattern: 'hinge', contraindications: ['lower_back'], floor_required: false, muscle: 'hamstrings', bodyHalf: 'lower' },
  glute_bridge: { pattern: 'hinge', contraindications: [], floor_required: true, muscle: 'glutes', bodyHalf: 'lower' },
  // Extenze zad vleže na břiše — nejbližší z jedenácti vzorů je "core"
  // (trupová stabilita/extenze), samostatný vzor "back extension" v enumu
  // není.
  superman: { pattern: 'core', contraindications: ['lower_back', 'neck'], floor_required: true, muscle: 'back', bodyHalf: 'core' },
  pushup: { pattern: 'horizontal_push', contraindications: ['shoulder', 'wrist'], floor_required: true, muscle: 'chest', bodyHalf: 'upper' },
  russian_twist: { pattern: 'core', contraindications: ['lower_back'], floor_required: true, muscle: 'core', bodyHalf: 'core' },
  plank_side: { pattern: 'core', contraindications: ['shoulder', 'wrist'], floor_required: true, muscle: 'core', bodyHalf: 'core' },
  single_leg_butt_kick: { pattern: 'cardio_impact', contraindications: ['knee', 'impact'], floor_required: false, muscle: 'quads', bodyHalf: 'lower' },
  mountain_climber: { pattern: 'cardio_impact', contraindications: ['wrist', 'shoulder', 'impact'], floor_required: true, muscle: 'full_body', bodyHalf: 'full_body' },
  glute_kickback: { pattern: 'hinge', contraindications: ['lower_back'], floor_required: true, muscle: 'glutes', bodyHalf: 'lower' },
  bent_knee_hip_raise: { pattern: 'core', contraindications: ['lower_back', 'neck'], floor_required: true, muscle: 'core', bodyHalf: 'core' },
  // Výpon na špičky — triple-extenzní řetězec sdílí se dřepem, i když jde
  // jen o kotník; enum nemá samostatný vzor pro lýtka.
  calf_raise: { pattern: 'squat', contraindications: [], floor_required: false, muscle: 'calves', bodyHalf: 'lower' },
  crunch_hands_overhead: { pattern: 'core', contraindications: ['neck', 'lower_back'], floor_required: true, muscle: 'core', bodyHalf: 'core' },

  // Náhrady mimo 30 originálních klíčů (`lib/seeds/nahradyCviku.js`), ale
  // metadata potřebují i ony — bez nich by `applyExclusions` neuměla
  // ověřit, jestli je náhrada sama vyloučená.
  farmer_carry: { pattern: 'carry', contraindications: ['wrist', 'lower_back'], floor_required: false, muscle: 'full_body', bodyHalf: 'full_body' },
  burpee: { pattern: 'plyo', contraindications: ['wrist', 'shoulder', 'knee', 'impact'], floor_required: false, muscle: 'full_body', bodyHalf: 'full_body' },
  jumping_jack: { pattern: 'cardio_impact', contraindications: ['impact'], floor_required: false, muscle: 'full_body', bodyHalf: 'full_body' },
});

export default POHYBOVE_VZORY_CVIKU;
