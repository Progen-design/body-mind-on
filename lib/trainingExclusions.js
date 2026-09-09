/**
 * VYLOUČENÍ CVIKŮ A POHYBOVÝCH VZORŮ Z TRÉNINKOVÉHO PLÁNU.
 *
 * Uživatel řekne „nechci dřepy" nebo „vynechat ramena" a plán to musí
 * respektovat — stejný princip jako dietní vyloučení u jídel
 * (`foods_to_avoid`/`dietary_restrictions` na `body_metrics`).
 *
 * ARCHITEKTURA. Generátor (`lib/workoutStartProgram.js`) se nepřepisuje —
 * zmrazená pole `GYM_A-D`/`HOME_EQUIP_A-D`/`HOME_BW_A-D` zůstávají zdrojem
 * pravdy o tom, JAKÉ cviky START program vůbec zná. Tenhle modul je čistě
 * substituční vrstva NAD nimi: dostane hotové dny s cviky, vyloučí co má,
 * a kde může, dosadí náhradu ze žebříčku v `lib/seeds/nahradyCviku.js`.
 * Nikdy negeneruje nový cvik odjinud a nikdy nevolá OpenAI ani DB —
 * `applyExclusions`/`planExclusionCoverage`/`isExerciseExcluded` jsou čisté
 * funkce nad daty, aby šly bezpečně importovat i do SPA (`src/`, viz krok 7
 * registrace) a volat opakovaně bez vedlejších efektů.
 *
 * DVĚ ROVINY DAT:
 *   - `lib/seeds/pohyboveVzoryCviku.js` — CO cvik je (vzor, partie,
 *     kontraindikace, poloha na zemi). Tady se ptáme „je tenhle cvik
 *     vyloučený?".
 *   - `lib/seeds/nahradyCviku.js` — ČÍM ho nahradit, v jakém pořadí, pokud
 *     vyloučený je.
 *
 * SLOT-JSON, KTERÝ applyExclusions ČTE A PÍŠE ZPÁTKY VE STEJNÉM TVARU:
 *   `day.exercises[]` (rovnou na dni — tvar hned po `buildStartWorkoutDays()`,
 *   PŘED `resolveWorkouts()`) NEBO `day.workout.exercises[]` (finální uložený
 *   `structured_plan_json`, tvar který čte `lib/planExerciseVariant.js`).
 *   Podle toho, co v konkrétním dni najde, do TOHO SAMÉHO místa i zapíše —
 *   nepřidává ani neubírá vrstvu, kterou volající nepoužívá.
 *
 * PROČ SE PŘI NÁHRADĚ NEDOTAHUJE MÉDIUM. Náhrada nese jen `canonical_key`,
 * `search_term` a `name_cs` (a beze změny přebírá `sets`/`reps`/
 * `duration_sec`/`start_program` z původního cviku, aby progrese A/B
 * neztratila předpis). Když se `applyExclusions` zavolá PŘED
 * `resolveWorkouts()` (generátor, viz krok a), obrázek/GIF/postup dotáhne
 * ten normální resolve krok stejně jako u kteréhokoli jiného cviku ze
 * šablony. Když se zavolá NA JIŽ VYŘEŠENÉM plánu (krok b, exercise-variant),
 * náhrada dočasně zůstane bez média do další týdenní obnovy — přesně to,
 * co si UI beztak umí ošetřit („cvik bez obrázku smí do plánu, když má
 * český postup", migrace 20260909001500). GIF NIKDY není podmínka náhrady.
 *
 * VENTIL (Slot bez použitelné náhrady):
 *   1. žebříček z `nahradyCviku.js`, kandidát ještě dnes nepoužitý,
 *   2. týž žebříček i s kandidátem už dnes použitým (raději opakování
 *      cviku než prázdný slot),
 *   3. jiný cvik ze STEJNÉ POLOVINY TĚLA (`bodyHalf`) napříč celým
 *      katalogem, s jinou partií/vzorem než originál,
 *   4. slot se vypustí + `plan_warnings` + „Kvůli tvým omezením je dnešek
 *      kratší."
 *   Vyloučený cvik se nedosadí NIKDY, ani jako poslední záchrana kroku 5.
 *   Když by krok 4 vyprázdnil den úplně, hledá se ještě jednou přes CELÝ
 *   katalog bez ohledu na polovinu těla/partii — jen aby den nezůstal
 *   prázdný. I tahle poslední záchrana vyloučený cvik vynechává.
 */
import { POHYBOVE_VZORY_CVIKU } from './seeds/pohyboveVzoryCviku.js';
import { NAHRADY_CVIKU } from './seeds/nahradyCviku.js';
import { REPLACEMENT_EXERCISE_META } from './workoutStartProgramReplacements.js';
import { MUSCLE_GROUP_IDS } from './muscleGroupLabels.js';

/** Jedenáct pohybových vzorů + virtuální `floor` pro chip „Cviky vleže na zemi". */
export const EXCLUDABLE_PATTERNS = Object.freeze([
  'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push',
  'horizontal_pull', 'vertical_pull', 'core', 'carry', 'plyo', 'cardio_impact',
  'floor',
]);

export const EXCLUDABLE_CONTRAINDICATIONS = Object.freeze([
  'knee', 'lower_back', 'shoulder', 'wrist', 'neck', 'impact',
]);

const ENV_VALUES = new Set(['gym', 'home_equipment', 'home_bodyweight']);
const PATTERN_SET = new Set(EXCLUDABLE_PATTERNS);
const CONTRAINDICATION_SET = new Set(EXCLUDABLE_CONTRAINDICATIONS);
const MUSCLE_SET = new Set(MUSCLE_GROUP_IDS);

function uniqStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v ?? '').trim()).filter(Boolean))];
}

/**
 * Bezpečně znormalizuje `training_exclusions` — neplatný/prázdný/chybějící
 * vstup se nikdy nezhroutí, jen se stane „žádná vyloučení".
 *
 * @param {unknown} raw
 * @returns {{ patterns: string[], muscles: string[], exercise_keys: string[], contraindications: string[], source: string, updated_at: string|null }}
 */
export function normalizeTrainingExclusions(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const patterns = uniqStrings(src.patterns).filter((p) => PATTERN_SET.has(p));
  const muscles = uniqStrings(src.muscles).filter((m) => MUSCLE_SET.has(m));
  const exercise_keys = uniqStrings(src.exercise_keys);
  const contraindications = uniqStrings(src.contraindications).filter((c) => CONTRAINDICATION_SET.has(c));
  const source = typeof src.source === 'string' && src.source.trim() ? src.source.trim().slice(0, 60) : 'unknown';
  const updatedAtRaw = typeof src.updated_at === 'string' ? src.updated_at : null;
  const updated_at = updatedAtRaw && !Number.isNaN(Date.parse(updatedAtRaw)) ? updatedAtRaw : null;
  return { patterns, muscles, exercise_keys, contraindications, source, updated_at };
}

/** @param {unknown} exclusions */
export function hasAnyExclusions(exclusions) {
  const e = normalizeTrainingExclusions(exclusions);
  return (
    e.patterns.length > 0 ||
    e.muscles.length > 0 ||
    e.exercise_keys.length > 0 ||
    e.contraindications.length > 0
  );
}

function metaFor(canonicalKey) {
  return POHYBOVE_VZORY_CVIKU[canonicalKey] || null;
}

/**
 * @param {string} canonicalKey
 * @param {unknown} exclusions syrové nebo už normalizované — normalizuje se samo
 * @returns {boolean}
 */
export function isExerciseExcluded(canonicalKey, exclusions) {
  const key = String(canonicalKey || '').trim();
  if (!key) return false;
  const e = normalizeTrainingExclusions(exclusions);
  if (e.exercise_keys.includes(key)) return true;

  const m = metaFor(key);
  // Neznámý cvik (mimo POHYBOVE_VZORY_CVIKU) nejde vyloučit podle vzoru ani
  // partie — nevíme, co to je. Vyloučit ho pořád jde explicitně přes
  // exercise_keys (zkontrolováno výš).
  if (!m) return false;

  if (e.patterns.includes(m.pattern)) return true;
  if (e.patterns.includes('floor') && m.floor_required) return true;
  if (e.muscles.includes(m.muscle)) return true;
  if (m.contraindications.some((c) => e.contraindications.includes(c))) return true;
  return false;
}

function envOf(canonicalKey) {
  return REPLACEMENT_EXERCISE_META[canonicalKey]?.envs || [];
}

/**
 * Jméno pro UI, když se dosazuje náhrada bez plného resolve (viz hlavička).
 * @param {string} canonicalKey
 */
function displayNameFor(canonicalKey) {
  return REPLACEMENT_EXERCISE_META[canonicalKey]?.name_cs || canonicalKey;
}

/**
 * Najde náhradu pro vyloučený cvik — žebříček, pak stejná polovina těla
 * napříč katalogem. Nikdy nevrátí vyloučený cvik.
 *
 * @param {string} originalKey
 * @param {string} envKey
 * @param {ReturnType<typeof normalizeTrainingExclusions>} exclusions
 * @param {Set<string>} usedTodayKeys
 * @returns {string|null}
 */
function findWidenedCandidate(originalKey, envKey, exclusions, usedTodayKeys) {
  const originalMeta = metaFor(originalKey);
  if (!originalMeta) return null;
  const fitsWidened = (k) => {
    if (k === originalKey) return false;
    const m = POHYBOVE_VZORY_CVIKU[k];
    if (m.bodyHalf !== originalMeta.bodyHalf) return false;
    if (m.muscle === originalMeta.muscle && m.pattern === originalMeta.pattern) return false;
    if (!envOf(k).includes(envKey)) return false;
    return !isExerciseExcluded(k, exclusions);
  };
  return (
    Object.keys(POHYBOVE_VZORY_CVIKU).find((k) => !usedTodayKeys.has(k) && fitsWidened(k)) ||
    Object.keys(POHYBOVE_VZORY_CVIKU).find(fitsWidened) ||
    null
  );
}

function findReplacementKey(originalKey, envKey, exclusions, usedTodayKeys) {
  const ranked = NAHRADY_CVIKU[envKey]?.[originalKey] || [];

  // 1) žebříček, kandidát ještě dnes nepoužitý.
  const freshRanked = ranked.find((k) => !usedTodayKeys.has(k) && !isExerciseExcluded(k, exclusions));
  if (freshRanked) return freshRanked;

  // 2) VENTIL: jiná partie ze stejné poloviny těla napříč celým katalogem
  //    (ne jen tříprvkovým žebříčkem) — pořád ještě dnes nepoužitá, pořád
  //    jen v tomhle prostředí. Přednost před opakováním z kroku 3: fresh
  //    cvik je lepší náhrada než zopakovat něco, co v tom dni už je.
  const freshWidened = findWidenedCandidate(originalKey, envKey, exclusions, usedTodayKeys);
  if (freshWidened) return freshWidened;

  // 3) Poslední záchrana PŘED úplným vypuštěním: raději opakování cviku,
  //    který dnes už je jinde ve dni, než prázdný slot. Nastává jen když
  //    žebříček i rozšířené hledání úplně vyčerpal prostor (typicky malá
  //    šablona, kde zbylé sloty přesně pokryly všechny fresh kandidáty).
  const repeatRanked = ranked.find((k) => !isExerciseExcluded(k, exclusions));
  if (repeatRanked) return repeatRanked;
  const repeatWidened = findWidenedCandidate(originalKey, envKey, exclusions, new Set());
  if (repeatWidened) return repeatWidened;

  return null;
}

/** Poslední záchrana, aby den nezůstal úplně prázdný — bez ohledu na partii/vzor. */
function findAnyNonExcluded(envKey, exclusions, usedTodayKeys) {
  return Object.keys(POHYBOVE_VZORY_CVIKU).find(
    (k) => envOf(k).includes(envKey) && !usedTodayKeys.has(k) && !isExerciseExcluded(k, exclusions)
  ) || Object.keys(POHYBOVE_VZORY_CVIKU).find(
    (k) => envOf(k).includes(envKey) && !isExerciseExcluded(k, exclusions)
  ) || null;
}

function exerciseListOf(day) {
  if (Array.isArray(day?.workout?.exercises)) return { list: day.workout.exercises, nested: true };
  if (Array.isArray(day?.exercises)) return { list: day.exercises, nested: false };
  return { list: null, nested: false };
}

function withExerciseList(day, nested, list) {
  if (nested) return { ...day, workout: { ...day.workout, exercises: list } };
  return { ...day, exercises: list };
}

/**
 * Aplikuje vyloučení na týdenní/denní tréninkový plán. Čistá funkce — žádné
 * volání DB ani OpenAI, bezpečná pro opakované volání a pro import do SPA.
 *
 * @param {Array<object>} workoutDays dny s `exercises[]` nebo `workout.exercises[]`
 * @param {unknown} exclusions syrové `training_exclusions`
 * @param {string} environment 'gym'|'home_equipment'|'home_bodyweight'
 * @returns {{ days: Array<object>, warnings: Array<object> }}
 */
export function applyExclusions(workoutDays, exclusions, environment) {
  if (!Array.isArray(workoutDays)) return { days: workoutDays, warnings: [] };

  const normalized = normalizeTrainingExclusions(exclusions);
  const envKey = ENV_VALUES.has(environment) ? environment : 'gym';

  // Uživatel bez vyloučení dostane identický plán jako dnes — žádná kopie,
  // žádný rozdíl v referencích.
  if (!hasAnyExclusions(normalized)) return { days: workoutDays, warnings: [] };

  const warnings = [];

  const days = workoutDays.map((day) => {
    const { list, nested } = exerciseListOf(day);
    if (!list) return day;

    const usedTodayKeys = new Set(list.map((ex) => ex?.canonical_key).filter(Boolean));
    const nextList = [];
    let anyDropped = false;

    for (const exercise of list) {
      const key = exercise?.canonical_key;
      if (!key || !isExerciseExcluded(key, normalized)) {
        nextList.push(exercise);
        continue;
      }

      const replacementKey = findReplacementKey(key, envKey, normalized, usedTodayKeys);
      if (replacementKey) {
        usedTodayKeys.add(replacementKey);
        nextList.push({
          ...exercise,
          canonical_key: replacementKey,
          search_term: replacementKey,
          name_cs: displayNameFor(replacementKey),
          display_name_cs: displayNameFor(replacementKey),
          // Média nejsou tady k dispozici (viz hlavička) — smažou se, ať
          // nezůstane vizuál PŮVODNÍHO (jiného) cviku u nové identity.
          image_url: null,
          gif_url: null,
          video_url: null,
          instructions_cs: null,
          replaced_from: key,
          replaced_reason: 'training_exclusion',
        });
        warnings.push({
          type: 'substituted',
          day_index: day?.day_index ?? null,
          canonical_key: key,
          replacement_key: replacementKey,
          message: `Vyloučený cvik nahrazen: ${displayNameFor(key)} → ${displayNameFor(replacementKey)}.`,
        });
        continue;
      }

      anyDropped = true;
      warnings.push({
        type: 'dropped',
        day_index: day?.day_index ?? null,
        canonical_key: key,
        message: `Cvik ${displayNameFor(key)} vypuštěn — bez dostupné náhrady mimo tvá omezení.`,
      });
      // Vyloučený cvik se do nextList NIKDY nevrací.
    }

    if (!nextList.length && list.length) {
      // Den by po vyloučeních zůstal prázdný — poslední záchrana bez ohledu
      // na partii/vzor, pořád ale nikdy vyloučený cvik.
      const fallbackKey = findAnyNonExcluded(envKey, normalized, usedTodayKeys);
      if (fallbackKey) {
        nextList.push({
          canonical_key: fallbackKey,
          search_term: fallbackKey,
          name_cs: displayNameFor(fallbackKey),
          display_name_cs: displayNameFor(fallbackKey),
          sets: 3,
          reps: null,
          duration_sec: null,
          image_url: null,
          gif_url: null,
          video_url: null,
          instructions_cs: null,
          replaced_reason: 'training_exclusion_day_would_be_empty',
        });
        warnings.push({
          type: 'day_fallback',
          day_index: day?.day_index ?? null,
          replacement_key: fallbackKey,
          message: 'Den by byl kvůli vyloučením úplně prázdný, doplněn náhradní cvik.',
        });
      }
    }

    if (anyDropped && nextList.length < list.length) {
      warnings.push({
        type: 'day_shortened',
        day_index: day?.day_index ?? null,
        message: 'Kvůli tvým omezením je dnešek kratší.',
      });
    }

    return withExerciseList(day, nested, nextList);
  });

  return { days, warnings };
}

/**
 * Kolik cviků (a na jakou partii) zbývá po vyloučeních v daném prostředí.
 * Pro živý počet v UI kroku 3 registrace — NIKDY konstanta, počítá se ze
 * skutečného katalogu pro dané `environment`.
 *
 * @param {unknown} exclusions
 * @param {string} environment
 * @returns {{ environment: string, total: number, remaining: number, byMuscle: Record<string, { total: number, remaining: number }> }}
 */
export function planExclusionCoverage(exclusions, environment) {
  const e = normalizeTrainingExclusions(exclusions);
  const envKey = ENV_VALUES.has(environment) ? environment : 'gym';
  const universe = Object.keys(POHYBOVE_VZORY_CVIKU).filter((k) => envOf(k).includes(envKey));

  const byMuscle = {};
  let remaining = 0;
  for (const key of universe) {
    const m = POHYBOVE_VZORY_CVIKU[key];
    if (!byMuscle[m.muscle]) byMuscle[m.muscle] = { total: 0, remaining: 0 };
    byMuscle[m.muscle].total += 1;
    if (!isExerciseExcluded(key, e)) {
      remaining += 1;
      byMuscle[m.muscle].remaining += 1;
    }
  }

  return { environment: envKey, total: universe.length, remaining, byMuscle };
}

export default applyExclusions;
