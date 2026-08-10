/**
 * Čtení a zápis progrese START programu. Jediné místo, které o tabulce ví.
 *
 * Logika (co z čeho vyplývá) je v lib/workoutProgression.js a nesahá na DB,
 * aby se dala testovat bez sítě.
 */
import { supabaseServer } from './supabaseServer.js';

const TABLE = 'start_workout_progression';

/** Pondělí týdne, do kterého datum patří (ISO string). */
function weekKey(isoDate) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  const dow = d.getUTCDay(); // 0 = Ne
  const posun = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - posun);
  return d.toISOString().slice(0, 10);
}

/**
 * Poslední TÝDEN pro každý cvik uživatele — ne poslední řádek.
 *
 * PROČ TÝDEN A NE ŘÁDEK. Program A/B se při 3× týdně opakuje: trénink A je
 * v pondělí i v pátek. Když uživatel zapíše pondělí a pátek už ne, je pátek
 * novější řádek se statusem `prescribed` — a kdyby se bral „poslední řádek“,
 * překryl by pondělní výsledek a progrese by hlásila „nezadal nic“, i když
 * uživatel svědomitě odcvičil a zapsal. Změřeno při zkoušce na produkčních
 * datech: všech 10 cviků skončilo na `repeat_no_data`, přitom pondělní
 * trénink byl kompletně vyplněný.
 *
 * Skládá se proto:
 *   • PŘEDPIS a počítadla z nejnovějšího řádku toho týdne (to jsme naposledy
 *     uživateli řekli),
 *   • VÝSLEDEK z nejnovějšího řádku toho týdne, který výsledek MÁ.
 * Když v tom týdnu nemá výsledek žádný, je to poctivé „nezadal nic“.
 *
 * @param {string} userId
 * @param {{ before?: string|null }} [opts] `before` = ISO datum, vyloučí aktuální týden
 * @returns {Promise<Map<string, object>>} canonical_key → řádek
 */
export async function loadLatestProgression(userId, opts = {}) {
  if (!userId) return new Map();

  let query = supabaseServer
    .from(TABLE)
    .select('canonical_key, performed_on, variant, target_sets, target_reps_min, target_reps_max, target_duration_sec, prescribed_weight_kg, reps_done, weight_done_kg, duration_done_sec, status, decision, consecutive_misses, consecutive_no_data')
    .eq('user_id', userId)
    .order('performed_on', { ascending: false })
    .limit(400);

  if (opts.before) query = query.lt('performed_on', opts.before);

  const { data, error } = await query;
  if (error) {
    // Progrese je vylepšení, ne podmínka doručení plánu. Když se nedá přečíst,
    // uživatel dostane výchozí předpis — ne žádný trénink. Chyba se ale nesmí
    // spolknout, jinak by se týdny tiše neposouvaly.
    console.error('[start-progression] nacteni selhalo — jede se od vychoziho predpisu', {
      user_id: userId,
      error: error.message,
    });
    return new Map();
  }

  return pickPreviousPerExercise(data || []);
}

/** Má řádek zapsaný výsledek? */
function rowHasResult(row) {
  return row?.status === 'done'
    && (Array.isArray(row.reps_done) || Array.isArray(row.duration_done_sec));
}

/**
 * Z řádků (řazených DESC podle performed_on) vybere pro každý cvik jeho
 * poslední týden a v něm složí předpis + výsledek. Viz komentář
 * u `loadLatestProgression` — oddělené kvůli testovatelnosti bez DB.
 *
 * @param {Array<object>} rowsDesc
 * @returns {Map<string, object>}
 */
export function pickPreviousPerExercise(rowsDesc) {
  /** @type {Map<string, object>} */
  const out = new Map();
  /** @type {Map<string, string>} canonical_key → pondělí posledního týdne */
  const lastWeek = new Map();

  for (const row of rowsDesc || []) {
    if (!lastWeek.has(row.canonical_key)) lastWeek.set(row.canonical_key, weekKey(row.performed_on));
  }

  for (const row of rowsDesc || []) {
    const key = row.canonical_key;
    if (weekKey(row.performed_on) !== lastWeek.get(key)) continue;

    const existing = out.get(key);
    if (!existing) {
      // První (= nejnovější) řádek toho týdne drží předpis a počítadla.
      out.set(key, { ...row });
      continue;
    }
    // Starší řádek téhož týdne doplní VÝSLEDEK, pokud ho novější nemá.
    if (!rowHasResult(existing) && rowHasResult(row)) {
      out.set(key, {
        ...existing,
        status: 'done',
        reps_done: row.reps_done,
        weight_done_kg: row.weight_done_kg,
        duration_done_sec: row.duration_done_sec,
      });
    }
  }
  return out;
}

/**
 * Zapíše předpisy na tenhle týden.
 *
 * Upsert na (user_id, canonical_key, performed_on): opakované generování téhož
 * týdne předpis přepíše, ale výsledky, které už uživatel zadal, nesmí smazat —
 * proto se posílají jen sloupce předpisu.
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {string|null} p.planId
 * @param {Array<object>} p.prescriptions z buildStartWorkoutPlan
 * @param {string[]} p.datesByDayIndex mapa day_index → ISO datum
 * @returns {Promise<{ saved: number, error: string|null }>}
 */
export async function savePrescriptions({ userId, planId, prescriptions, datesByDayIndex }) {
  if (!userId || !Array.isArray(prescriptions) || !prescriptions.length) {
    return { saved: 0, error: null };
  }

  const rows = [];
  for (const p of prescriptions) {
    const performedOn = datesByDayIndex?.[p.day_index] ?? null;
    if (!performedOn) continue;
    rows.push({
      user_id: userId,
      plan_id: planId ?? null,
      canonical_key: p.canonical_key,
      performed_on: performedOn,
      variant: p.variant,
      target_sets: p.target_sets,
      target_reps_min: p.target_reps_min,
      target_reps_max: p.target_reps_max,
      target_duration_sec: p.target_duration_sec,
      prescribed_weight_kg: p.prescribed_weight_kg,
      decision: p.decision,
      consecutive_misses: p.consecutive_misses,
      consecutive_no_data: p.consecutive_no_data,
      updated_at: new Date().toISOString(),
    });
  }

  if (!rows.length) return { saved: 0, error: null };

  const { error } = await supabaseServer
    .from(TABLE)
    .upsert(rows, { onConflict: 'user_id,canonical_key,performed_on', ignoreDuplicates: false });

  if (error) {
    console.error('[start-progression] zapis predpisu selhal', {
      user_id: userId,
      rows: rows.length,
      error: error.message,
    });
    return { saved: 0, error: error.message };
  }
  return { saved: rows.length, error: null };
}

/**
 * Zapíše, co uživatel odcvičil.
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.canonicalKey
 * @param {string} p.performedOn ISO datum
 * @param {{ reps_done?: number[], weight_done_kg?: number|null, duration_done_sec?: number[], skipped?: boolean }} p.result
 * @returns {Promise<{ ok: boolean, error: string|null, row: object|null }>}
 */
export async function saveWorkoutResult({ userId, canonicalKey, performedOn, result }) {
  const patch = {
    status: result?.skipped === true ? 'skipped' : 'done',
    reps_done: Array.isArray(result?.reps_done) ? result.reps_done : null,
    weight_done_kg: result?.weight_done_kg ?? null,
    duration_done_sec: Array.isArray(result?.duration_done_sec) ? result.duration_done_sec : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseServer
    .from(TABLE)
    .update(patch)
    .eq('user_id', userId)
    .eq('canonical_key', canonicalKey)
    .eq('performed_on', performedOn)
    .select()
    .maybeSingle();

  if (error) return { ok: false, error: error.message, row: null };
  // Chybějící řádek NENÍ chyba serveru: uživatel poslal cvik nebo datum, který
  // mu nikdo nepředepsal. Zakládat ho tady by obešlo to, že předpis vytváří
  // generátor plánu.
  if (!data) return { ok: false, error: 'prescription_not_found', row: null };
  return { ok: true, error: null, row: data };
}
