/**
 * PROGRESE START PROGRAMU — z odcvičeného týdne se odvodí ten další.
 *
 * Čistá logika, žádná DB. Ukládání je v lib/workoutProgressionStore.js.
 *
 * TŘI TYPY CVIKŮ, TŘI PRAVIDLA. Zatížený cvik se posouvá kilogramy, cvik
 * s vlastní váhou opakováními a cvik na čas sekundami. Prkno nemá kam přidat
 * 2,5 kg a činka nemá smysl držet o pět sekund dýl — proto se to nesmí počítat
 * jednou funkcí.
 *
 * CO SE STANE, KDYŽ UŽIVATEL NEZADÁ NIC: zopakuje se identický předpis. Nikdy
 * se nehádá. Řádek předpisu vzniká už při generování plánu (status
 * `prescribed`), takže „nezadal nic“ je rozpoznatelný stav, ne chybějící data —
 * bez toho by se u uživatele, který nikdy nic nevyplní, nebylo co zopakovat.
 */

/** @typedef {'barbell'|'dumbbell'|'machine'|'bodyweight_reps'|'timed'} ProgressionKind */

/**
 * Inkrement podle náčiní. Osa jde po 2,5 kg (nejmenší pár kotoučů),
 * jednoručky po 2 kg (1 kg na ruku), stroj po 2,5 kg, leg press po 5 kg —
 * na něm je 2,5 kg pod rozlišovací schopností nohou.
 * @type {Readonly<Record<string, { kind: ProgressionKind, increment_kg?: number }>>}
 */
export const PROGRESSION_BY_EXERCISE = Object.freeze({
  // — osa
  bench_press: { kind: 'barbell', increment_kg: 2.5 },
  bent_over_row: { kind: 'barbell', increment_kg: 2.5 },
  romanian_deadlift: { kind: 'barbell', increment_kg: 2.5 },
  deadlift: { kind: 'barbell', increment_kg: 2.5 },

  // — jednoručky / kettlebell
  goblet_squat: { kind: 'dumbbell', increment_kg: 2 },
  overhead_press: { kind: 'dumbbell', increment_kg: 2 },
  bicep_curl: { kind: 'dumbbell', increment_kg: 2 },
  lateral_raise: { kind: 'dumbbell', increment_kg: 2 },
  tricep_extension: { kind: 'dumbbell', increment_kg: 2 },
  // Jednoručkové varianty barbellových cviků (Etapa 6.3) — vlastní canonical_key,
  // viz poznámka u CANONICAL_EXERCISES v exerciseCanonicalMap.js.
  dumbbell_bench_press: { kind: 'dumbbell', increment_kg: 2 },
  dumbbell_row: { kind: 'dumbbell', increment_kg: 2 },
  dumbbell_romanian_deadlift: { kind: 'dumbbell', increment_kg: 2 },

  // — stroj / kladka
  leg_press: { kind: 'machine', increment_kg: 5 },
  lat_pulldown: { kind: 'machine', increment_kg: 2.5 },
  chest_press: { kind: 'machine', increment_kg: 2.5 },
  hamstring_curl: { kind: 'machine', increment_kg: 2.5 },

  // — vlastní váha na opakování
  squat: { kind: 'bodyweight_reps' },
  pushup: { kind: 'bodyweight_reps' },
  lunges: { kind: 'bodyweight_reps' },
  glute_bridge: { kind: 'bodyweight_reps' },
  superman: { kind: 'bodyweight_reps' },
  russian_twist: { kind: 'bodyweight_reps' },
  pull_up: { kind: 'bodyweight_reps' },
  // Core na opakování „na stranu“. Váhu nedostane — dead bug se zhoršuje
  // pomalejším pohybem a delším dosahem, ne přidanými kilogramy.
  dead_bug: { kind: 'bodyweight_reps' },

  // — na čas
  plank: { kind: 'timed' },
  plank_side: { kind: 'timed' },
  mountain_climber: { kind: 'timed' },
  farmer_carry: { kind: 'timed' },
});

/** Strop opakování, za kterým se přidává série místo dalšího opakování. */
const REPS_CEILING = 20;
/** Strop výdrže v sekundách, za kterým se přidává série. */
const DURATION_CEILING_SEC = 60;
/** Strop série. Nad ním už progrese nemá kam jít a chce to těžší variantu. */
const SETS_CEILING = 5;
/** Kolik sekund se přidá za splněný týden. */
const DURATION_STEP_SEC = 5;
/**
 * Kolik neúspěchů po sobě vede na deload. Tři je kanonické StrongLifts pravidlo —
 * začátečník má špatný den kvůli spánku nebo stresu, ne kvůli váze, takže po
 * prvním nezdaru se jen opakuje.
 */
const MISSES_BEFORE_DELOAD = 3;
/** Po kolika týdnech bez dat se progrese označí jako zastavená. */
const NO_DATA_WEEKS_BEFORE_PAUSE = 3;

/**
 * Pravidlo progrese pro cvik.
 *
 * `override` existuje proto, že typ progrese není vlastnost NÁZVU cviku, ale
 * toho, jak se cvičí. Změřeno na plánu ee814006: `goblet_squat` se doma
 * s jednoručkami mění na `squat` (dumbbell squat) — pořád je to zatížený dřep,
 * ale podle klíče by se počítal jako vlastní váha a nikdy by nedostal
 * kilogramy. Šablona proto smí typ určit sama.
 *
 * @param {string} canonicalKey
 * @param {{ kind?: ProgressionKind|null, increment_kg?: number|null }|null} [override]
 * @returns {{ kind: ProgressionKind, increment_kg?: number }}
 */
export function progressionRuleFor(canonicalKey, override = null) {
  if (override?.kind) {
    return {
      kind: override.kind,
      increment_kg: override.increment_kg ?? PROGRESSION_BY_EXERCISE[String(canonicalKey || '').toLowerCase()]?.increment_kg,
    };
  }
  const key = String(canonicalKey || '').trim().toLowerCase();
  // Neznámý cvik se chová jako vlastní váha na opakování: nepřidá se mu váha,
  // kterou nikdo nezměřil. Radši žádná progrese než vymyšlená.
  return PROGRESSION_BY_EXERCISE[key] || { kind: 'bodyweight_reps' };
}

/** @param {ProgressionKind} kind */
export function isWeightedKind(kind) {
  return kind === 'barbell' || kind === 'dumbbell' || kind === 'machine';
}

/**
 * Zaokrouhlí na násobek inkrementu, ať nevzniknou váhy, které nejde složit.
 * @param {number} value
 * @param {number} increment
 * @returns {number}
 */
function roundToIncrement(value, increment) {
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

/**
 * Splnil uživatel předpis? Musí odcvičit VŠECHNY předepsané série a v každé
 * dosáhnout aspoň spodní hranice opakování (resp. předepsané výdrže).
 *
 * @param {object} row řádek progrese (předpis + výsledek)
 * @returns {boolean}
 */
export function prescriptionMet(row) {
  const kind = progressionRuleFor(row?.canonical_key, { kind: row?.progression_kind ?? null }).kind;
  const targetSets = Number(row?.target_sets) || 0;
  if (targetSets <= 0) return false;

  if (kind === 'timed') {
    const done = Array.isArray(row?.duration_done_sec)
      ? row.duration_done_sec
      : (row?.duration_done_sec != null ? [row.duration_done_sec] : []);
    const target = Number(row?.target_duration_sec) || 0;
    if (!done.length || target <= 0) return false;
    // Jedna hodnota = uživatel zadal výdrž jednou pro všechny série.
    const perSet = done.length === 1 ? Array(targetSets).fill(done[0]) : done;
    return perSet.length >= targetSets && perSet.slice(0, targetSets).every((s) => Number(s) >= target);
  }

  const reps = Array.isArray(row?.reps_done) ? row.reps_done : [];
  const targetMin = Number(row?.target_reps_min) || 0;
  if (reps.length < targetSets || targetMin <= 0) return false;
  return reps.slice(0, targetSets).every((r) => Number(r) >= targetMin);
}

/**
 * Odcvičil uživatel vůbec něco? `prescribed` = plán se vygeneroval a nikdo se
 * k němu nevrátil. `skipped` = uživatel řekl, že trénink vynechal.
 * @param {object} row
 * @returns {boolean}
 */
export function hasResult(row) {
  const status = String(row?.status || 'prescribed');
  if (status === 'prescribed' || status === 'skipped') return false;
  const kind = progressionRuleFor(row?.canonical_key, { kind: row?.progression_kind ?? null }).kind;
  if (kind === 'timed') return row?.duration_done_sec != null;
  return Array.isArray(row?.reps_done) && row.reps_done.length > 0;
}

/**
 * PŘEDPIS NA DALŠÍ TÝDEN.
 *
 * @param {object|null} previous řádek z minulého týdne, nebo null při prvním týdnu
 * @param {object} baseline výchozí předpis ze šablony (když previous chybí)
 * @returns {{ target_sets: number, target_reps_min: number|null, target_reps_max: number|null,
 *   target_duration_sec: number|null, prescribed_weight_kg: number|null,
 *   decision: string, consecutive_misses: number, consecutive_no_data: number }}
 */
export function nextPrescription(previous, baseline) {
  const rule = progressionRuleFor(
    baseline?.canonical_key ?? previous?.canonical_key,
    { kind: baseline?.progression_kind ?? null, increment_kg: baseline?.increment_kg ?? null }
  );

  const base = {
    target_sets: Number(baseline?.target_sets) || 3,
    target_reps_min: baseline?.target_reps_min ?? null,
    target_reps_max: baseline?.target_reps_max ?? null,
    target_duration_sec: baseline?.target_duration_sec ?? null,
    prescribed_weight_kg: baseline?.prescribed_weight_kg ?? null,
  };

  if (!previous) {
    return {
      ...base,
      decision: 'first_time',
      consecutive_misses: 0,
      consecutive_no_data: 0,
    };
  }

  const current = {
    target_sets: Number(previous.target_sets) || base.target_sets,
    target_reps_min: previous.target_reps_min ?? base.target_reps_min,
    target_reps_max: previous.target_reps_max ?? base.target_reps_max,
    target_duration_sec: previous.target_duration_sec ?? base.target_duration_sec,
    prescribed_weight_kg: previous.prescribed_weight_kg ?? base.prescribed_weight_kg,
  };
  const misses = Number(previous.consecutive_misses) || 0;
  const noData = Number(previous.consecutive_no_data) || 0;

  // ── NEZADAL NIC ────────────────────────────────────────────────────────────
  // Identický předpis. Nehádá se ani nahoru, ani dolů.
  if (!hasResult(previous)) {
    const nextNoData = noData + 1;
    return {
      ...current,
      decision: nextNoData >= NO_DATA_WEEKS_BEFORE_PAUSE ? 'paused_no_data' : 'repeat_no_data',
      consecutive_misses: misses,
      consecutive_no_data: nextNoData,
    };
  }

  // ── NESPLNIL ───────────────────────────────────────────────────────────────
  if (!prescriptionMet(previous)) {
    const nextMisses = misses + 1;
    // Deload je jen pro zatížené cviky. U vlastní váhy a času není co snižovat
    // (odebrat opakování začátečníkovi, který neudělal 8 kliků, mu nepomůže).
    if (isWeightedKind(rule.kind) && nextMisses >= MISSES_BEFORE_DELOAD) {
      const inc = rule.increment_kg ?? 2.5;
      // Stejně jako u progrese: základ je odcvičená váha, ne předepsaná.
      const currentWeight = Number(previous.weight_done_kg ?? current.prescribed_weight_kg) || 0;
      const deloaded = Math.max(inc, roundToIncrement(currentWeight * 0.9, inc));
      return {
        ...current,
        prescribed_weight_kg: currentWeight > 0 ? deloaded : current.prescribed_weight_kg,
        decision: 'deload',
        consecutive_misses: 0,
        consecutive_no_data: 0,
      };
    }
    return {
      ...current,
      decision: 'repeat_missed',
      consecutive_misses: nextMisses,
      consecutive_no_data: 0,
    };
  }

  // ── SPLNIL ─────────────────────────────────────────────────────────────────
  const done = { ...current, consecutive_misses: 0, consecutive_no_data: 0 };

  if (isWeightedKind(rule.kind)) {
    const inc = rule.increment_kg ?? 2.5;
    // PŘIČÍTÁ SE K TOMU, CO UŽIVATEL OPRAVDU ZVEDL, ne k tomu, co jsme
    // předepsali. Dva důvody:
    //   • první týden je předpis schválně `null` (váhu nehádáme), takže bez
    //     tohohle by se program navždy zasekl na „doplň váhu“ — i když
    //     uživatel svědomitě zapsal 40 kg a všechny série splnil
    //   • kdo předepsanou váhu překročí (dali jsme 40, zvedl 45), má příště
    //     dostat 47,5 a ne 42,5
    const currentWeight = Number(previous.weight_done_kg ?? current.prescribed_weight_kg);
    if (!Number.isFinite(currentWeight) || currentWeight <= 0) {
      // Splnil opakování, ale váhu nikdy nezadal — nemáme od čeho přidávat.
      // Není to chyba, je to chybějící vstup; předpis se zopakuje.
      return { ...done, decision: 'repeat_weight_unknown' };
    }
    return {
      ...done,
      prescribed_weight_kg: roundToIncrement(currentWeight + inc, inc),
      decision: 'progress_weight',
    };
  }

  if (rule.kind === 'timed') {
    const currentSec = Number(current.target_duration_sec) || 0;
    if (currentSec < DURATION_CEILING_SEC) {
      return {
        ...done,
        target_duration_sec: Math.min(DURATION_CEILING_SEC, currentSec + DURATION_STEP_SEC),
        decision: 'progress_duration',
      };
    }
    if (current.target_sets < SETS_CEILING) {
      return {
        ...done,
        target_sets: current.target_sets + 1,
        target_duration_sec: Number(baseline?.target_duration_sec) || currentSec,
        decision: 'add_set',
      };
    }
    return { ...done, decision: 'needs_harder_variant' };
  }

  // vlastní váha na opakování
  const max = Number(current.target_reps_max) || Number(current.target_reps_min) || 0;
  const min = Number(current.target_reps_min) || max;
  if (max > 0 && max < REPS_CEILING) {
    return { ...done, target_reps_min: min + 1, target_reps_max: max + 1, decision: 'progress_reps' };
  }
  if (current.target_sets < SETS_CEILING) {
    return {
      ...done,
      target_sets: current.target_sets + 1,
      target_reps_min: Number(baseline?.target_reps_min) || min,
      target_reps_max: Number(baseline?.target_reps_max) || max,
      decision: 'add_set',
    };
  }
  return { ...done, decision: 'needs_harder_variant' };
}

/**
 * Lidsky čitelné vysvětlení, proč se předpis změnil. Do UI i do e-mailu —
 * začátečník musí vidět, že progres není náhoda.
 * @param {string} decision
 * @returns {string}
 */
export function progressionNoteCs(decision) {
  switch (decision) {
    case 'first_time': return 'První týden — zapiš, co odcvičíš.';
    case 'progress_weight': return 'Minulý týden jsi zvládl všechny série, přidáváme váhu.';
    case 'progress_reps': return 'Minulý týden jsi zvládl všechny série, přidáváme opakování.';
    case 'progress_duration': return 'Minulý týden jsi zvládl všechny série, přidáváme čas.';
    case 'add_set': return 'Jsi na stropu opakování, přidáváme sérii.';
    case 'repeat_missed': return 'Minulý týden se nepovedly všechny série — zůstáváme na stejné zátěži.';
    case 'deload': return 'Třikrát po sobě to nevyšlo, ubíráme 10 % a rozjedeme to znovu.';
    case 'repeat_no_data': return 'Z minulého týdne nemáme zápis, takže zátěž zůstává stejná.';
    case 'paused_no_data': return 'Bez zápisu tréninku progrese stojí. Zapiš série a opakování.';
    case 'repeat_weight_unknown': return 'Doplň použitou váhu, abychom mohli přidat.';
    case 'needs_harder_variant': return 'Tenhle cvik jsi vyčerpal — řekni si o těžší variantu.';
    default: return '';
  }
}
