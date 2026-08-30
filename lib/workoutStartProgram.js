/**
 * START PROGRAM — dva střídavé full-body tréninky A/B, které se opakují každý týden.
 *
 * PROČ. Změřeno na produkčním plánu c0c89c40 (START, 3× týdně): 15 cviků,
 * 15 různých, ani jeden se neopakoval. Den 3 byl core + hýždě + stehna +
 * hrudník + hrudník. Začátečník se za takový týden nenaučí techniku a nemá jak
 * poznat, že se zlepšuje.
 *
 * Pestrost vyráběla čtyři místa:
 *   1. `rotatedTemplatesForBodyMetrics()` — každý týden jiná čtveřice bloků
 *   2. `scaleAndDiversifyWorkoutPlan()` — `diversified_days` při shodě dnů
 *   3. `deduplicateExercisesAcrossWeek()` — `usedAcrossWeek` cvik, který se
 *      v týdnu zopakuje, AKTIVNĚ nahradí jiným (to je ta hlavní příčina)
 *   4. `enforceWorkoutsPerWeekInPlan()` — chybějící dny dopisuje z rotace
 * Pro START se obchází všechny čtyři; pro ON_CLUB/VIP zůstávají v provozu.
 *
 * LOGIKA. StrongLifts / Starting Strength: A-B-A, další týden B-A-B. Funguje
 * proto, že je nudná — stejné cviky, měřitelný posun, technika se opakováním
 * usadí. Pět cviků na trénink schválně, ne šest: zbytek času patří rozcvičení
 * a pauzám, ne dalšímu cviku.
 *
 * CVIKY JSOU JEN Z REGISTRY. Každý `canonical_key` níž má řádek
 * v `exercise_asset_registry`, takže projde `resolveWorkoutExercises`.
 * `inverted_row`, `split_squat`, `dip`, `back_extension` a `front_squat`
 * v registry NEJSOU — proto tu nejsou.
 *
 * INVARIANT VĚDOMĚ ZÚŽEN (Etapa 6.3, 31. 8. 2026). Do 30. 8. 2026 platilo
 * „řádek VČETNĚ média" — proto tu `hip_thrust` s `face_pull` chyběly, ačkoli
 * řádek v registry mají. Od téhle etapy platí užší pravidlo: MÉDIUM smí
 * chybět, IDENTITA A NÁŘADÍ LHÁT NESMÍ.
 *
 * Důvod obratu: `HOME_EQUIP_A`/`HOME_EQUIP_B` používaly `bench_press`,
 * `bent_over_row` a `romanian_deadlift` i s jednoručkami v ruce — cvik samotný
 * dostal jméno „Tlak s jednoručkami", ale `canonical_key` má equipment
 * 'barbell' (viz `exerciseCanonicalMap.js`), takže „Nářadí" v profilu
 * začátečníkovi cvičícímu doma řeklo, ať použije velkou činku, kterou si
 * nezvolil a nemá. To je věcná chyba (lež o vybavení), ne kosmetická — chybějící
 * GIF je díra v pokrytí, kterou už dnes hlídá `cvik_bez_vizualu` ve
 * `system_health_alerts` (14 z 220 klíčů v registry bez vizuálu, změřeno
 * 30. 8. 2026, žádný z nich dřív nebyl použit v plánu — od téhle etapy už
 * dva z nich jsou, `dumbbell_row` a `dumbbell_romanian_deadlift`, watchdog to
 * bez dalšího zásahu uvidí sám).
 *
 * `dumbbell_bench_press`, `dumbbell_row` a `dumbbell_romanian_deadlift` proto
 * mají vlastní `canonical_key` (ne sdílený s barbellovou verzí) — `dumbbell_row`
 * a `dumbbell_romanian_deadlift` zatím BEZ potvrzeného média (viz migrace
 * 20260830120000); médium se dohledá samo živě přes wger.de při prvním
 * výskytu v produkci, stejný bootstrap jako každý jiný canonical_key.
 * Viz lib/trainingEnvironment.js a poznámka u CANONICAL_EXERCISES
 * v lib/exerciseCanonicalMap.js.
 */

import { parseTrainingEnvironment, parseAvailableEquipment, resolveWorkoutTrainingEnvironment } from './trainingEnvironment.js';
import { nextPrescription, progressionRuleFor } from './workoutProgression.js';

/**
 * @typedef {object} StartExercise
 * @property {string} canonical_key
 * @property {string} search_term
 * @property {string} name_cs
 * @property {number} sets
 * @property {number|null} [reps_min]
 * @property {number|null} [reps_max]
 * @property {number|null} [duration_sec]
 * @property {string|null} [reps_note] „na nohu“ / „na stranu“ — jen do textu
 */

const ex = (canonical_key, search_term, name_cs, sets, opts = {}) => Object.freeze({
  canonical_key,
  search_term,
  name_cs,
  sets,
  reps_min: opts.reps_min ?? null,
  reps_max: opts.reps_max ?? null,
  duration_sec: opts.duration_sec ?? null,
  reps_note: opts.reps_note ?? null,
  // Typ progrese smí šablona přebít — `squat` je doma s jednoručkami zatížený
  // dřep (kilogramy), zatímco bez náčiní je to vlastní váha (opakování).
  progression_kind: opts.progression_kind ?? null,
  increment_kg: opts.increment_kg ?? null,
});

/**
 * POSILOVNA. A pokrývá dřep + vodorovný tlak + vodorovný tah + core,
 * B hinge + tlak nad hlavu + svislý tah + core. Napříč A+B tak uživatel odtrénuje
 * všech sedm základních vzorů.
 */
const GYM_A = Object.freeze([
  ex('goblet_squat', 'goblet squat', 'Goblet dřep', 3, { reps_min: 8, reps_max: 10 }),
  ex('bench_press', 'bench press', 'Bench press', 3, { reps_min: 8, reps_max: 10 }),
  ex('bent_over_row', 'bent over row', 'Přítahy v předklonu', 3, { reps_min: 8, reps_max: 10 }),
  ex('leg_press', 'leg press', 'Tlaky nohama', 3, { reps_min: 10, reps_max: 12 }),
  ex('plank', 'plank', 'Prkno', 3, { duration_sec: 40 }),
]);

const GYM_B = Object.freeze([
  ex('romanian_deadlift', 'romanian deadlift', 'Rumunský mrtvý tah', 3, { reps_min: 8, reps_max: 10 }),
  ex('overhead_press', 'shoulder press', 'Tlaky nad hlavu', 3, { reps_min: 8, reps_max: 10 }),
  ex('lat_pulldown', 'lat pulldown', 'Stahování horní kladky', 3, { reps_min: 10, reps_max: 12 }),
  // `lunges` tu ZÁMĚRNĚ NEJSOU. Jsou v `GYM_FORBIDDEN_CANONICAL`
  // (lib/trainingEnvironment.js) — v posilovně se necvičí s vlastní váhou —
  // takže by je `filterWorkoutPlanForTrainingEnvironment` vyměnila za
  // `leg_press`, který už je v A. Změřeno na plánu ee814006: B pak měl
  // leg_press dvakrát v týdnu a A/B se přestalo lišit.
  // Dělba je proto A = kvadricepsy (goblet dřep + leg press),
  // B = zadní strana (RDT + zakopávání) a svislý tah.
  ex('hamstring_curl', 'leg curl', 'Zakopávání vleže', 3, { reps_min: 10, reps_max: 12 }),
  ex('dead_bug', 'dead bug', 'Dead bug', 3, { reps_min: 10, reps_max: 12, reps_note: 'na stranu' }),
]);

/**
 * DOMOV S VYBAVENÍM (jednoručky / lavice / kettlebell).
 *
 * Dřep je tu `squat` se `search_term: 'dumbbell squat'`, ne `goblet_squat`.
 * Změřeno na plánu ee814006: `resolveHomeEquipmentReplacement` mění
 * `goblet_squat` na `squat` vždycky, když uživatel nemá kettlebell — takže
 * předpis by se vedl na klíči, který v plánu není. Progrese by se příští týden
 * nenapojila. `progression_kind: 'dumbbell'` drží kilogramovou progresi,
 * kterou by samotný klíč `squat` (vlastní váha) neměl.
 */
const HOME_EQUIP_A = Object.freeze([
  ex('squat', 'dumbbell squat', 'Dřep s jednoručkami', 3, {
    reps_min: 10, reps_max: 12, progression_kind: 'dumbbell', increment_kg: 2,
  }),
  ex('dumbbell_bench_press', 'dumbbell bench press', 'Tlak s jednoručkami', 3, { reps_min: 10, reps_max: 12 }),
  ex('dumbbell_row', 'dumbbell row', 'Přítahy jednoručkou', 3, { reps_min: 10, reps_max: 12 }),
  ex('lunges', 'dumbbell lunge', 'Výpady', 3, { reps_min: 10, reps_max: 12, reps_note: 'na nohu' }),
  ex('plank', 'plank', 'Prkno', 3, { duration_sec: 40 }),
]);

const HOME_EQUIP_B = Object.freeze([
  ex('dumbbell_romanian_deadlift', 'dumbbell romanian deadlift', 'Rumunský mrtvý tah', 3, { reps_min: 10, reps_max: 12 }),
  ex('overhead_press', 'dumbbell shoulder press', 'Tlaky nad hlavu', 3, { reps_min: 10, reps_max: 12 }),
  // Svislý tah jen s hrazdou; bez ní se nahradí druhou variantou vodorovného
  // tahu (viz `resolveVerticalPull`) — vymyslet si domácí shyby nejde.
  ex('pull_up', 'pull up', 'Shyby', 3, { reps_min: 5, reps_max: 8 }),
  ex('glute_bridge', 'hip bridge', 'Zvedání pánve', 3, { reps_min: 12, reps_max: 15 }),
  ex('dead_bug', 'dead bug', 'Dead bug', 3, { reps_min: 10, reps_max: 12, reps_note: 'na stranu' }),
]);

/**
 * DOMOV BEZ VYBAVENÍ.
 *
 * `pushup` a `superman` jsou v A i B ZÁMĚRNĚ. Vlastní váhou doma neexistuje
 * vodorovný tah: `bent_over_row` má v `EQUIPMENT_REQUIRES` podmínku
 * jednoručky/guma/lavice/kettlebell, takže by ho `resolveEnvironmentExercise`
 * stejně vyměnil. `superman` není tah, je to náhrada za zádový vzor. Správný
 * cvik je `inverted_row` (stůl / TRX / hrazda) a v registry chybí — do té doby
 * je A/B pro vlastní váhu méně odlišné a liší se nohama a core.
 */
const HOME_BW_A = Object.freeze([
  ex('squat', 'squat', 'Dřepy', 3, { reps_min: 12, reps_max: 15 }),
  ex('pushup', 'push up', 'Kliky', 3, { reps_min: 8, reps_max: 12 }),
  ex('superman', 'superman', 'Superman', 3, { reps_min: 12, reps_max: 15 }),
  ex('glute_bridge', 'hip bridge', 'Zvedání pánve', 3, { reps_min: 12, reps_max: 15 }),
  ex('plank', 'plank', 'Prkno', 3, { duration_sec: 40 }),
]);

const HOME_BW_B = Object.freeze([
  ex('lunges', 'lunge', 'Výpady', 3, { reps_min: 10, reps_max: 12, reps_note: 'na nohu' }),
  ex('pushup', 'push up', 'Kliky', 3, { reps_min: 8, reps_max: 12 }),
  ex('superman', 'superman', 'Superman', 3, { reps_min: 12, reps_max: 15 }),
  ex('russian_twist', 'russian twist', 'Ruský twist', 3, { reps_min: 14, reps_max: 16 }),
  ex('plank_side', 'side plank', 'Boční prkno', 3, { duration_sec: 30 }),
]);

/**
 * ── VARIANTY C A D: SPLIT PRO 4+ TRÉNINKŮ TÝDNĚ ─────────────────────────────
 *
 * A/B je správně pro 1–3 tréninky týdně (rozhodnuto 10. 8. 2026) — začátečník
 * potřebuje opakování, ne pestrost. Při 5 trénincích týdně ale `absolute % 2`
 * znamenalo, že tři dny ze sedmi jsou totéž.
 *
 * Změřeno na čtyřech čerstvých registracích v produkci. Žena / nabírání svalů,
 * 5× týdně dostala A, B, B, A, B — tedy dva různé tréninky na pět dnů. Muž /
 * redukce dostal B, A, A. Katalog má přitom 205 použitelných cviků.
 *
 * Od 4 tréninků týdně se proto rotuje přes ČTYŘI varianty: k full-body A/B
 * přibývá tlakový (C) a tahový (D) den. Při 5 trénincích vyjde A-B-C-D-A, tedy
 * čtyři různé tréninky místo dvou; pátý den se opakuje záměrně, aby týden
 * nezačínal pokaždé jinde.
 *
 * VŠECHNY KLÍČE JSOU V `exercise_asset_registry` A MAJÍ MÉDIUM (ověřeno
 * 18. 8. 2026 dotazem na `usable_in_plan` + `gif_url/image_url`). Do posilovny
 * nejdou cviky z `GYM_FORBIDDEN_CANONICAL` — jinak by je filtr prostředí
 * vyměnil a varianty by zase splynuly.
 */
const GYM_C = Object.freeze([
  ex('chest_press', 'chest press machine', 'Chest press', 3, { reps_min: 8, reps_max: 12 }),
  ex('overhead_press', 'shoulder press', 'Tlaky nad hlavu', 3, { reps_min: 8, reps_max: 12 }),
  ex('tricep_extension', 'tricep pushdown', 'Tricepsové tlaky', 3, { reps_min: 10, reps_max: 12 }),
  ex('leg_press', 'leg press', 'Tlaky nohama', 3, { reps_min: 12, reps_max: 15 }),
  ex('plank', 'plank', 'Prkno', 3, { duration_sec: 40 }),
]);

const GYM_D = Object.freeze([
  ex('lat_pulldown', 'lat pulldown', 'Stahování horní kladky', 3, { reps_min: 8, reps_max: 12 }),
  ex('bent_over_row', 'bent over row', 'Přítahy v předklonu', 3, { reps_min: 8, reps_max: 12 }),
  ex('pull_up', 'pull up', 'Shyby', 3, { reps_min: 5, reps_max: 8 }),
  ex('bicep_curl', 'bicep curl', 'Bicepsový zdvih', 3, { reps_min: 10, reps_max: 12 }),
  ex('dead_bug', 'dead bug', 'Dead bug', 3, { reps_min: 10, reps_max: 12, reps_note: 'na stranu' }),
]);

const HOME_EQUIP_C = Object.freeze([
  ex('dumbbell_bench_press', 'incline dumbbell press', 'Šikmý tlak s jednoručkami', 3, { reps_min: 10, reps_max: 12 }),
  ex('overhead_press', 'dumbbell shoulder press', 'Tlaky nad hlavu', 3, { reps_min: 10, reps_max: 12 }),
  ex('tricep_extension', 'dumbbell tricep extension', 'Tricepsové extenze', 3, { reps_min: 10, reps_max: 12 }),
  ex('glute_bridge', 'hip bridge', 'Zvedání pánve', 3, { reps_min: 12, reps_max: 15 }),
  ex('plank', 'plank', 'Prkno', 3, { duration_sec: 40 }),
]);

const HOME_EQUIP_D = Object.freeze([
  ex('dumbbell_row', 'dumbbell row', 'Přítahy jednoručkou', 3, { reps_min: 10, reps_max: 12 }),
  ex('pull_up', 'pull up', 'Shyby', 3, { reps_min: 5, reps_max: 8 }),
  ex('bicep_curl', 'dumbbell curl', 'Bicepsový zdvih', 3, { reps_min: 10, reps_max: 12 }),
  ex('superman', 'superman', 'Superman', 3, { reps_min: 12, reps_max: 15 }),
  ex('dead_bug', 'dead bug', 'Dead bug', 3, { reps_min: 10, reps_max: 12, reps_note: 'na stranu' }),
]);

const HOME_BW_C = Object.freeze([
  ex('squat', 'squat', 'Dřepy', 3, { reps_min: 15, reps_max: 20 }),
  ex('lunges', 'lunge', 'Výpady', 3, { reps_min: 12, reps_max: 15, reps_note: 'na nohu' }),
  ex('glute_bridge', 'hip bridge', 'Zvedání pánve', 3, { reps_min: 15, reps_max: 20 }),
  ex('dead_bug', 'dead bug', 'Dead bug', 3, { reps_min: 10, reps_max: 12, reps_note: 'na stranu' }),
  ex('plank', 'plank', 'Prkno', 3, { duration_sec: 40 }),
]);

const HOME_BW_D = Object.freeze([
  ex('pushup', 'push up', 'Kliky', 3, { reps_min: 10, reps_max: 15 }),
  ex('squat', 'squat', 'Dřepy', 3, { reps_min: 15, reps_max: 20 }),
  ex('superman', 'superman', 'Superman', 3, { reps_min: 12, reps_max: 15 }),
  ex('dead_bug', 'dead bug', 'Dead bug', 3, { reps_min: 10, reps_max: 12, reps_note: 'na stranu' }),
  ex('plank_side', 'side plank', 'Boční prkno', 3, { duration_sec: 30 }),
]);

/** @type {Readonly<Record<string, Record<string, readonly StartExercise[]>>>} */
export const START_PROGRAM_VARIANTS = Object.freeze({
  gym: Object.freeze({ A: GYM_A, B: GYM_B, C: GYM_C, D: GYM_D }),
  home_equipment: Object.freeze({ A: HOME_EQUIP_A, B: HOME_EQUIP_B, C: HOME_EQUIP_C, D: HOME_EQUIP_D }),
  home_bodyweight: Object.freeze({ A: HOME_BW_A, B: HOME_BW_B, C: HOME_BW_C, D: HOME_BW_D }),
});

/**
 * Bez hrazdy nemá `pull_up` čím být. Nahradí se druhou variantou vodorovného
 * tahu — pořád je to tah, jen ne svislý.
 *
 * V POSILOVNĚ SE NENAHRAZUJE. `available_equipment` popisuje domácí vybavení
 * a u gymu bývá prázdné, takže bez téhle podmínky se shyby vyměnily i tam, kde
 * hrazda i kladka samozřejmě jsou. Ve variantě D to bylo vidět hned: `pull_up`
 * se změnil na `bent_over_row`, který je v D už na druhém místě, a jeden trénink
 * měl tentýž cvik dvakrát.
 *
 * @param {StartExercise} exercise
 * @param {string[]} equipment
 * @param {string} envKey prostředí z `startProgramEnvironment`
 * @returns {StartExercise}
 */
function resolveVerticalPull(exercise, equipment, envKey) {
  if (exercise.canonical_key !== 'pull_up') return exercise;
  if (envKey === 'gym') return exercise;
  if (equipment.includes('pullup_bar') || equipment.includes('trx')) return exercise;
  return ex('dumbbell_row', 'dumbbell row', 'Přítahy jednoručkou', 3, { reps_min: 12, reps_max: 15 });
}

/**
 * Které prostředí uživatel má.
 * @param {object} bodyMetrics
 * @returns {'gym'|'home_equipment'|'home_bodyweight'}
 */
export function startProgramEnvironment(bodyMetrics = {}) {
  const env = resolveWorkoutTrainingEnvironment(parseTrainingEnvironment(bodyMetrics));
  if (env === 'gym') return 'gym';
  if (env === 'home_equipment') {
    const equip = parseAvailableEquipment(bodyMetrics);
    const maZatez = equip.includes('dumbbells') || equip.includes('kettlebell') || equip.includes('bench');
    return maZatez ? 'home_equipment' : 'home_bodyweight';
  }
  return 'home_bodyweight';
}

/**
 * ── CÍL MUSÍ BÝT VIDĚT NA TRÉNINKU ──────────────────────────────────────────
 *
 * Do 18. 8. 2026 se `goal` do skladby tréninku nepromítal VŮBEC — v celém
 * modulu se to slovo nevyskytovalo. Redukce i nabírání svalů dostávaly tytéž
 * cviky ve stejném pořadí i se stejnými opakováními. Stejná třída chyby jako
 * dřív u `weekly_sessions`: hodnota z registrace se sebrala a zahodila.
 *
 * Cíl neurčuje, KTERÉ cviky, ale JAK se dělají. Vzor jsou cviky vybrané podle
 * prostředí a vybavení; cíl mění předpis:
 *
 *   nabirani_svaly — nižší opakování, těžší série. Hlavní cviky dne (první dva)
 *                    dostanou sérii navíc. Svalová hmota roste hlavně z napětí,
 *                    ne z počtu opakování.
 *   redukce        — vyšší opakování a delší výdrže, tedy objemovější a víc
 *                    kruhový charakter. Váha zůstává nižší, práce hustší.
 *   udrzovani      — beze změny, šablona je psaná na něj.
 *
 * Rozsahy mají tvrdé meze: pod 5 opakování se začátečník dostává do síly, kde
 * je technika riziková, nad 20 už to není posilování. Proto `clamp`, ne prosté
 * přičtení.
 *
 * Izolace se neposiluje sérií navíc — přidat čtvrtou sérii bicepsu při nabírání
 * je objem bez efektu. Proto jen první dva cviky dne, což jsou v každé variantě
 * ty základní.
 */

/** @type {Readonly<Record<string, {repsPosun: number, serieNaHlavni: number, vydrzPosunSec: number}>>} */
export const UPRAVA_PODLE_CILE = Object.freeze({
  nabirani_svaly: Object.freeze({ repsPosun: -2, serieNaHlavni: 1, vydrzPosunSec: 0 }),
  redukce: Object.freeze({ repsPosun: 4, serieNaHlavni: 0, vydrzPosunSec: 10 }),
  udrzovani: Object.freeze({ repsPosun: 0, serieNaHlavni: 0, vydrzPosunSec: 0 }),
});

const REPS_MIN_DOLE = 5;
const REPS_MAX_NAHORE = 20;
const POCET_HLAVNICH_CVIKU = 2;

const omez = (v, dole, nahore) => Math.max(dole, Math.min(nahore, v));

/**
 * Normalizuje `goal` z registrace na klíč úpravy.
 * @param {object} bodyMetrics
 * @returns {'nabirani_svaly'|'redukce'|'udrzovani'}
 */
export function cilTreninku(bodyMetrics = {}) {
  const g = String(bodyMetrics?.goal ?? '').toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(UPRAVA_PODLE_CILE, g) ? g : 'udrzovani';
}

/**
 * Upraví předpis cviku podle cíle. Vrací NOVÝ objekt, šablony jsou zmrazené.
 *
 * @param {StartExercise} tpl
 * @param {'nabirani_svaly'|'redukce'|'udrzovani'} cil
 * @param {number} poradi pořadí cviku ve dni (0 = první)
 * @returns {StartExercise}
 */
export function upravProCil(tpl, cil, poradi = 0) {
  const u = UPRAVA_PODLE_CILE[cil] || UPRAVA_PODLE_CILE.udrzovani;
  const jeHlavni = poradi < POCET_HLAVNICH_CVIKU;

  // Výdrž (prkno) se neposouvá opakováními, ale sekundami.
  if (tpl.duration_sec != null) {
    return Object.freeze({
      ...tpl,
      duration_sec: Math.max(20, tpl.duration_sec + u.vydrzPosunSec),
    });
  }

  if (tpl.reps_min == null) return tpl;

  const min = omez(tpl.reps_min + u.repsPosun, REPS_MIN_DOLE, REPS_MAX_NAHORE);
  const max = tpl.reps_max == null
    ? null
    : omez(tpl.reps_max + u.repsPosun, min, REPS_MAX_NAHORE);

  return Object.freeze({
    ...tpl,
    reps_min: min,
    reps_max: max,
    sets: jeHlavni ? tpl.sets + u.serieNaHlavni : tpl.sets,
  });
}

/**
 * Která varianta pro konkrétní trénink.
 *
 * DO 3 TRÉNINKŮ TÝDNĚ ZŮSTÁVÁ A/B. Začátečník potřebuje opakování, ne pestrost:
 * při 3× týdně vyjde A-B-A, další týden B-A-B, technika se usadí a je vidět
 * posun na téže čince. Tohle bylo rozhodnuto 10. 8. 2026 a nemění se.
 *
 * OD 4 TRÉNINKŮ SE ROTUJE PŘES ČTYŘI. Se dvěma variantami znamenalo 5× týdně
 * tři dny totéž — změřeno na produkčních registracích (A, B, B, A, B). Čtyři
 * varianty dají při 5 trénincích A-B-C-D-A, tedy čtyři různé tréninky.
 *
 * Počítá se z indexu týdne a indexu tréninku, takže to nepotřebuje uložený stav
 * a je to reprodukovatelné. Rotace jede i přes hranici týdne — jinak by každý
 * týden začínal stejně a čtvrtá varianta by při 5 trénincích chyběla obden.
 *
 * @param {number} weekIndex kolikátý týden programu (0 = první)
 * @param {number} sessionIndex kolikátý trénink v týdnu (0 = první)
 * @param {number} sessionsPerWeek
 * @returns {'A'|'B'|'C'|'D'}
 */
export function startVariantForSession(weekIndex, sessionIndex, sessionsPerWeek) {
  const perWeek = Math.max(1, Number(sessionsPerWeek) || 3);
  const poradi = pocetVariantProTyden(perWeek);
  const absolute = (Math.max(0, Number(weekIndex) || 0) * perWeek) + Math.max(0, Number(sessionIndex) || 0);
  return PORADI_VARIANT[absolute % poradi];
}

/** Pořadí, ve kterém se varianty střídají. */
const PORADI_VARIANT = Object.freeze(['A', 'B', 'C', 'D']);

/** Od kolika tréninků týdně se rotuje přes čtyři varianty místo dvou. */
export const PRAH_ROZSIRENE_ROTACE = 4;

/**
 * Kolik variant se pro daný počet tréninků střídá.
 * @param {number} sessionsPerWeek
 * @returns {2|4}
 */
export function pocetVariantProTyden(sessionsPerWeek) {
  return (Number(sessionsPerWeek) || 0) >= PRAH_ROZSIRENE_ROTACE ? 4 : 2;
}

/**
 * Kolikátý týden programu je `validFrom`.
 * @param {string|Date|null} validFrom
 * @param {string|Date|null} programStartedOn
 * @returns {number}
 */
export function startProgramWeekIndex(validFrom, programStartedOn) {
  const from = validFrom ? new Date(validFrom) : null;
  const start = programStartedOn ? new Date(programStartedOn) : null;
  if (!from || !start || Number.isNaN(from.getTime()) || Number.isNaN(start.getTime())) return 0;
  const dnu = Math.floor((from.getTime() - start.getTime()) / 86400000);
  return dnu <= 0 ? 0 : Math.floor(dnu / 7);
}

/**
 * Text opakování pro UI („10-12 na nohu“, „40 s“).
 * @param {object} prescription
 * @param {StartExercise} template
 * @returns {string|null}
 */
function repsLabel(prescription, template) {
  if (prescription.target_duration_sec != null) return `${prescription.target_duration_sec} s`;
  const min = prescription.target_reps_min;
  const max = prescription.target_reps_max;
  if (min == null) return null;
  const rozsah = max != null && max !== min ? `${min}-${max}` : String(min);
  return template.reps_note ? `${rozsah} ${template.reps_note}` : rozsah;
}

/**
 * POSTAVÍ TÝDENNÍ TRÉNINK START PROGRAMU — bez progrese.
 *
 * Nepoužívá se `scaleAndDiversifyWorkoutPlan` ani rotace — plán vzniká přímo
 * ve tvaru, ve kterém má být, takže není co „opravovat“ a co by tím rozbilo
 * opakovatelnost.
 *
 * Progrese se dopočítává až v `applyStartProgression()`, PO filtru prostředí.
 * Důvod je praktický: `filterWorkoutPlanForTrainingEnvironment()` umí cvik
 * vyměnit (nemá-li uživatel náčiní) a kdyby se progrese počítala dřív,
 * `canonical_key` v předpisu by neodpovídal cviku v plánu — příští týden by se
 * progrese nenapojila a tiše by se resetovala.
 *
 * @param {object} p
 * @param {object} p.bodyMetrics
 * @param {number[]} p.workoutDays indexy dnů v týdnu (0=Ne)
 * @param {number} [p.weekIndex]
 * @returns {{ workout_days: number[], days: Array<object> }}
 */
export function buildStartWorkoutDays({ bodyMetrics, workoutDays, weekIndex = 0 }) {
  const envKey = startProgramEnvironment(bodyMetrics);
  const equipment = parseAvailableEquipment(bodyMetrics);
  const variants = START_PROGRAM_VARIANTS[envKey];
  const cil = cilTreninku(bodyMetrics);
  const dayIndexes = Array.isArray(workoutDays)
    ? workoutDays.map(Number).filter((d) => Number.isFinite(d))
    : [];
  const perWeek = dayIndexes.length || 3;

  const days = dayIndexes.map((dayIndex, sessionIndex) => {
    const variant = startVariantForSession(weekIndex, sessionIndex, perWeek);
    // Cíl nemění výběr cviků (ten drží prostředí a vybavení), ale předpis:
    // nabírání jde na nižší opakování a sérii navíc u hlavních cviků, redukce
    // na vyšší objem. Do 18. 8. 2026 se `goal` nepromítal vůbec.
    const template = (variants[variant] || [])
      .map((t) => resolveVerticalPull(t, equipment, envKey))
      .map((t, poradi) => upravProCil(t, cil, poradi));

    return {
      day_index: dayIndex,
      // Trénink A / Trénink B — uživatel musí poznat, že se střídají dva, ne
      // že dostal každý týden něco jiného.
      workout_name: `Trénink ${variant}`,
      start_program_variant: variant,
      start_program_goal: cil,
      exercises: template.map((tpl) => ({
        canonical_key: tpl.canonical_key,
        search_term: tpl.search_term,
        name_cs: tpl.name_cs,
        sets: tpl.sets,
        reps: tpl.reps_min == null
          ? null
          : (tpl.reps_max && tpl.reps_max !== tpl.reps_min ? `${tpl.reps_min}-${tpl.reps_max}` : String(tpl.reps_min))
            + (tpl.reps_note ? ` ${tpl.reps_note}` : ''),
        duration_sec: tpl.duration_sec,
        start_program: {
          variant,
          // Výchozí předpis putuje s cvikem, takže se dá dopočítat progrese
          // i pro cvik, kterého se dotkl filtr prostředí.
          baseline: {
            target_sets: tpl.sets,
            target_reps_min: tpl.reps_min,
            target_reps_max: tpl.reps_max,
            target_duration_sec: tpl.duration_sec,
            reps_note: tpl.reps_note,
            progression_kind: tpl.progression_kind,
            increment_kg: tpl.increment_kg,
          },
        },
      })),
    };
  });

  return { workout_days: dayIndexes, days };
}

/**
 * DOPOČÍTÁ PROGRESI na už postavené (a profiltrované) dny.
 *
 * Mutuje `days` — nastaví finální `sets`, `reps`, `duration_sec` a doplní
 * `start_program.weight_kg` / `decision`. Vrací předpisy k uložení.
 *
 * @param {Array<object>} days
 * @param {Map<string, object>} [lastByKey] poslední řádek progrese podle canonical_key
 * @returns {Array<object>} prescriptions
 */
export function applyStartProgression(days, lastByKey = new Map()) {
  /** @type {Array<object>} */
  const prescriptions = [];

  (days || []).forEach((day, sessionIndex) => {
    const variant = day?.start_program_variant || startVariantForSession(0, sessionIndex, (days || []).length || 3);

    for (const exercise of day?.exercises || []) {
      const key = exercise?.canonical_key;
      if (!key) continue;

      const fromTemplate = exercise?.start_program?.baseline || {};
      const baseline = {
        canonical_key: key,
        target_sets: Number(fromTemplate.target_sets) || Number(exercise.sets) || 3,
        target_reps_min: fromTemplate.target_reps_min ?? null,
        target_reps_max: fromTemplate.target_reps_max ?? null,
        target_duration_sec: fromTemplate.target_duration_sec ?? exercise.duration_sec ?? null,
        progression_kind: fromTemplate.progression_kind ?? null,
        increment_kg: fromTemplate.increment_kg ?? null,
        // Výchozí váha se NEHÁDÁ. První týden je null a uživatel ji zapíše;
        // od druhého týdne se posouvá od toho, co opravdu zvedl. Vymyslet
        // začátečníkovi kilogramy je horší než ho nechat začít od nejlehčího.
        prescribed_weight_kg: null,
      };

      const previous = lastByKey.get(key) || null;
      const next = nextPrescription(previous, baseline);
      const rule = progressionRuleFor(key, {
        kind: fromTemplate.progression_kind ?? null,
        increment_kg: fromTemplate.increment_kg ?? null,
      });

      exercise.sets = next.target_sets;
      exercise.reps = repsLabel(next, { reps_note: fromTemplate.reps_note ?? null });
      exercise.duration_sec = next.target_duration_sec;
      // Progrese je součást předpisu, ne poznámka pod čarou — UI i e-mail
      // z toho staví „minulý týden 3×8 s 20 kg, teď 22,5 kg“.
      exercise.start_program = {
        ...(exercise.start_program || {}),
        variant,
        progression_kind: rule.kind,
        weight_kg: next.prescribed_weight_kg,
        decision: next.decision,
      };

      prescriptions.push({
        canonical_key: key,
        variant,
        day_index: Number(day.day_index),
        session_index: sessionIndex,
        target_sets: next.target_sets,
        target_reps_min: next.target_reps_min,
        target_reps_max: next.target_reps_max,
        target_duration_sec: next.target_duration_sec,
        prescribed_weight_kg: next.prescribed_weight_kg,
        decision: next.decision,
        consecutive_misses: next.consecutive_misses,
        consecutive_no_data: next.consecutive_no_data,
      });
    }
  });

  return prescriptions;
}
