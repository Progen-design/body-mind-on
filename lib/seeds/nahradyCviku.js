/**
 * NÁHRADY CVIKŮ — ke každému slotu ze zmrazených polí START programu
 * (`GYM_A-D`, `HOME_EQUIP_A-D`, `HOME_BW_A-D` v `lib/workoutStartProgram.js`)
 * ručně vybraný žebříček 1–3 náhrad. Klíč je dvojice (prostředí,
 * canonical_key nahrazovaného cviku) — stejný cvik ve stejném prostředí má
 * stejný žebříček bez ohledu na to, ve které variantě A–D se objeví.
 *
 * Přesun z `lib/workoutStartProgramReplacements.js` (KROK 3) do samostatného
 * seedu, ať sedí na organizaci požadovanou pro vyloučení cviků (KROK 4) —
 * `lib/workoutStartProgramReplacements.js` teď z tohohle souboru jen čte a
 * dodává `name_cs`/pomocnou funkci pro UI. Data i zdůvodnění se neměnily.
 *
 * PRAVIDLA VÝBĚRU (žádné z nich není o médiu):
 *   1. Kandidát musí mít `instructions_cs` — u `usable_in_plan = true` to
 *      platí automaticky (`enforce_exercise_registry_rules()`, migrace
 *      20260909001500).
 *   2. Kandidát musí sedět na prostředí slotu — gym / home_equipment /
 *      home_bodyweight (`TRIDY_V_POSILOVNE`, `NACINI_NA_TRIDU` v
 *      lib/exerciseCatalogPool.js).
 *   3. Kandidát musí mít jiný pohybový vzor NEBO jinou partii než
 *      nahrazovaný cvik — jinak by „náhrada" byla jen přejmenování téhož.
 *   4. GIF (`gif_url`) je JEN TIEBREAKER mezi jinak stejně vhodnými
 *      kandidáty, nikdy vyřazovací kritérium — obrázek má dnes jen 28 z 230
 *      cviků.
 *
 * Ověřeno testem `lib/__tests__/workoutStartProgramReplacements.test.mjs`:
 * pokrytí všech slotů, žádná sebereference/duplicita, prostředí sedí,
 * partie/vzor se liší (podle vlastních tagů v
 * `lib/workoutStartProgramReplacements.js`, ne podle
 * `lib/seeds/pohyboveVzoryCviku.js` — to je jiná, novější klasifikace pro
 * vyloučení cviků, viz `lib/trainingExclusions.js`).
 *
 * @type {Readonly<Record<'gym'|'home_equipment'|'home_bodyweight', Readonly<Record<string, readonly string[]>>>>}
 */
export const NAHRADY_CVIKU = Object.freeze({
  gym: Object.freeze({
    goblet_squat: Object.freeze(['romanian_deadlift', 'hamstring_curl', 'bent_over_row']),
    bench_press: Object.freeze(['overhead_press', 'lat_pulldown', 'tricep_extension']),
    bent_over_row: Object.freeze(['bench_press', 'overhead_press', 'bicep_curl']),
    leg_press: Object.freeze(['romanian_deadlift', 'hamstring_curl', 'lat_pulldown']),
    plank: Object.freeze(['dead_bug', 'farmer_carry', 'hamstring_curl']),
    romanian_deadlift: Object.freeze(['goblet_squat', 'leg_press', 'lat_pulldown']),
    overhead_press: Object.freeze(['bench_press', 'lat_pulldown', 'bicep_curl']),
    lat_pulldown: Object.freeze(['bent_over_row', 'overhead_press', 'bicep_curl']),
    hamstring_curl: Object.freeze(['romanian_deadlift', 'goblet_squat', 'lat_pulldown']),
    dead_bug: Object.freeze(['plank', 'farmer_carry', 'hamstring_curl']),
    chest_press: Object.freeze(['overhead_press', 'lat_pulldown', 'tricep_extension']),
    tricep_extension: Object.freeze(['bicep_curl', 'chest_press', 'lat_pulldown']),
    pull_up: Object.freeze(['bent_over_row', 'overhead_press', 'bicep_curl']),
    bicep_curl: Object.freeze(['tricep_extension', 'bent_over_row', 'overhead_press']),
  }),

  home_equipment: Object.freeze({
    squat: Object.freeze(['glute_bridge', 'dumbbell_romanian_deadlift', 'dumbbell_row']),
    dumbbell_bench_press: Object.freeze(['overhead_press', 'dumbbell_row', 'tricep_extension']),
    dumbbell_row: Object.freeze(['overhead_press', 'dumbbell_bench_press', 'bicep_curl']),
    lunges: Object.freeze(['glute_bridge', 'dumbbell_romanian_deadlift', 'dumbbell_row']),
    plank: Object.freeze(['dead_bug', 'glute_bridge', 'dumbbell_row']),
    dumbbell_romanian_deadlift: Object.freeze(['squat', 'dumbbell_row', 'glute_bridge']),
    overhead_press: Object.freeze(['pushup', 'dumbbell_bench_press', 'dumbbell_row']),
    pull_up: Object.freeze(['dumbbell_row', 'overhead_press', 'bicep_curl']),
    glute_bridge: Object.freeze(['squat', 'dumbbell_bench_press', 'dumbbell_row']),
    dead_bug: Object.freeze(['plank', 'glute_bridge', 'dumbbell_row']),
    tricep_extension: Object.freeze(['bicep_curl', 'dumbbell_bench_press', 'dumbbell_row']),
    bicep_curl: Object.freeze(['tricep_extension', 'overhead_press', 'dumbbell_row']),
    superman: Object.freeze(['glute_bridge', 'plank', 'dumbbell_row']),
  }),

  home_bodyweight: Object.freeze({
    squat: Object.freeze(['glute_bridge', 'superman', 'plank']),
    pushup: Object.freeze(['superman', 'plank', 'glute_bridge']),
    superman: Object.freeze(['glute_bridge', 'plank', 'pushup']),
    glute_bridge: Object.freeze(['squat', 'superman', 'plank']),
    plank: Object.freeze(['dead_bug', 'glute_bridge', 'superman']),
    lunges: Object.freeze(['glute_bridge', 'superman', 'plank']),
    russian_twist: Object.freeze(['plank_side', 'glute_bridge', 'superman']),
    plank_side: Object.freeze(['russian_twist', 'glute_bridge', 'dead_bug']),
    single_leg_butt_kick: Object.freeze(['mountain_climber', 'glute_kickback', 'jumping_jack']),
    mountain_climber: Object.freeze(['burpee', 'plank', 'jumping_jack']),
    glute_kickback: Object.freeze(['squat', 'superman', 'plank']),
    bent_knee_hip_raise: Object.freeze(['glute_bridge', 'plank', 'dead_bug']),
    calf_raise: Object.freeze(['squat', 'glute_bridge', 'plank']),
    crunch_hands_overhead: Object.freeze(['glute_bridge', 'plank', 'dead_bug']),
    dead_bug: Object.freeze(['plank', 'glute_bridge', 'superman']),
  }),
});

export default NAHRADY_CVIKU;
