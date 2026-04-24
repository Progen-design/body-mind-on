/**
 * Legacy plány (před doplněním name_cs ve structured JSON): doplnění z exercise_asset_registry
 * a fronta force_regenerate pro uživatele, u kterých backfill nestačí / chybí registry.
 */
import { supabaseServer } from './supabaseServer';
import { renderPlanHtmlFromStructured } from './planRenderer';

/** True, pokud existuje cvik s canonical_key a bez vyplněného name_cs (starý export). */
export function structuredPlanHasExerciseWithMissingNameCs(structured) {
  if (!structured || typeof structured !== 'object') return false;
  const days = structured.workout_plan?.days;
  if (!Array.isArray(days)) return false;
  for (const day of days) {
    for (const ex of day.exercises || []) {
      const ck = String(ex?.canonical_key || '').trim().toLowerCase();
      if (!ck) continue;
      const cs = ex?.name_cs;
      const hasCs = typeof cs === 'string' && cs.trim().length > 0;
      if (!hasCs) return true;
    }
  }
  return false;
}

export function collectCanonicalKeysFromStructured(structured) {
  const keys = [];
  const days = structured?.workout_plan?.days;
  if (!Array.isArray(days)) return keys;
  for (const day of days) {
    for (const ex of day.exercises || []) {
      const ck = String(ex?.canonical_key || '').trim().toLowerCase();
      if (ck) keys.push(ck);
    }
  }
  return keys;
}

/** @param {string[]} canonicalKeys */
export async function fetchRegistryDisplayNameCsByKeys(canonicalKeys) {
  const unique = [...new Set(canonicalKeys.filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;
  try {
    const { data, error } = await supabaseServer
      .from('exercise_asset_registry')
      .select('canonical_key, display_name_cs')
      .in('canonical_key', unique);
    if (error) return map;
    for (const row of data || []) {
      const k = String(row?.canonical_key || '').trim().toLowerCase();
      const cs = String(row?.display_name_cs || '').trim();
      if (k && cs) map.set(k, cs);
    }
  } catch {
    // non-fatal
  }
  return map;
}

/**
 * Doplní name_cs / display_name_cs z mapy (klíč = canonical_key lowercase).
 * @returns {{ json: object, patched: number }}
 */
export function applyRegistryNamesToStructuredPlan(structured, registryMap) {
  const json = JSON.parse(JSON.stringify(structured));
  let patched = 0;
  const days = json.workout_plan?.days;
  if (!Array.isArray(days)) return { json, patched: 0 };
  for (const day of days) {
    if (!Array.isArray(day.exercises)) continue;
    for (const ex of day.exercises) {
      const ck = String(ex?.canonical_key || '').trim().toLowerCase();
      if (!ck) continue;
      const cs = ex?.name_cs;
      const hasCs = typeof cs === 'string' && cs.trim().length > 0;
      if (hasCs) continue;
      const display = registryMap.get(ck);
      if (!display) continue;
      ex.name_cs = display;
      if (!ex.display_name_cs || !String(ex.display_name_cs).trim()) ex.display_name_cs = display;
      patched++;
    }
  }
  return { json, patched };
}

/**
 * Zařadí trainer/initial_plan s force_regenerate pro uživatele s aktivním plánem,
 * kde structured_plan_json stále postrádá name_cs u některého cviku (typicky před commitem 80e7722).
 * Jednou na user_id za běh; nezasahuje, pokud už čeká úloha s force_regenerate.
 */
export async function ensureForceRegenerateTasksForLegacyExerciseNames() {
  const { data: plans, error } = await supabaseServer
    .from('ai_generated_plans')
    .select('id, user_id, structured_plan_json')
    .eq('is_active', true)
    .not('structured_plan_json', 'is', null);

  if (error) {
    console.warn('[ensureForceRegenerateTasksForLegacyExerciseNames]', error.message);
    return { queued: 0, error: error.message };
  }

  const usersNeeding = new Map();
  for (const row of plans || []) {
    const uid = row?.user_id;
    const structured = row?.structured_plan_json;
    if (!uid || !structuredPlanHasExerciseWithMissingNameCs(structured)) continue;
    if (!usersNeeding.has(uid)) usersNeeding.set(uid, row.id);
  }

  let queued = 0;
  for (const userId of usersNeeding.keys()) {
    const { data: pendingRows, error: pErr } = await supabaseServer
      .from('ai_tasks')
      .select('id, payload')
      .eq('user_id', userId)
      .eq('agent_slug', 'trainer')
      .eq('task_type', 'initial_plan')
      .eq('status', 'pending');

    if (pErr) continue;

    const pending = pendingRows || [];
    if (pending.some((t) => t.payload && t.payload.force_regenerate === true)) continue;

    const payloadBase = {
      prompt: 'Doplň strukturovaný plán včetně českých názvů cviků (name_cs) podle aktuálního registru.',
      force_regenerate: true,
      reason: 'legacy_missing_exercise_name_cs',
    };

    if (pending.length) {
      const row = pending[0];
      const merged = { ...(typeof row.payload === 'object' && row.payload ? row.payload : {}), ...payloadBase };
      const { error: uErr } = await supabaseServer.from('ai_tasks').update({ payload: merged }).eq('id', row.id);
      if (!uErr) queued++;
      continue;
    }

    const { error: iErr } = await supabaseServer.from('ai_tasks').insert({
      user_id: userId,
      agent_slug: 'trainer',
      task_type: 'initial_plan',
      payload: payloadBase,
      status: 'pending',
    });
    if (!iErr) queued++;
  }

  if (queued) {
    console.info('[ensureForceRegenerateTasksForLegacyExerciseNames]', { queued, users: usersNeeding.size });
  }
  return { queued, users: usersNeeding.size };
}

/**
 * Admin backfill: doplní name_cs z registry a volitelně přerenderuje plan_html.
 * @param {{ dryRun?: boolean }} opts
 */
export async function backfillActivePlansExerciseNameCsFromRegistry(opts = {}) {
  const dryRun = opts.dryRun === true;
  const { data: plans, error } = await supabaseServer
    .from('ai_generated_plans')
    .select('id, user_id, structured_plan_json, plan_html, user_context')
    .eq('is_active', true)
    .not('structured_plan_json', 'is', null);

  if (error) throw new Error(error.message);

  let plansUpdated = 0;
  let exercisesPatched = 0;
  const allKeys = new Set();
  for (const row of plans || []) {
    if (!structuredPlanHasExerciseWithMissingNameCs(row.structured_plan_json)) continue;
    collectCanonicalKeysFromStructured(row.structured_plan_json).forEach((k) => allKeys.add(k));
  }
  const registryMap = await fetchRegistryDisplayNameCsByKeys([...allKeys]);

  for (const row of plans || []) {
    if (!structuredPlanHasExerciseWithMissingNameCs(row.structured_plan_json)) continue;
    const { json, patched } = applyRegistryNamesToStructuredPlan(row.structured_plan_json, registryMap);
    if (patched === 0) continue;
    exercisesPatched += patched;
    if (dryRun) {
      plansUpdated++;
      continue;
    }
    let plan_html = row.plan_html;
    try {
      const rendered = renderPlanHtmlFromStructured(json, row.user_context || null);
      if (rendered && typeof rendered === 'string' && rendered.trim()) plan_html = rendered;
    } catch {
      // ponechat staré HTML
    }
    const { error: uErr } = await supabaseServer
      .from('ai_generated_plans')
      .update({ structured_plan_json: json, ...(plan_html ? { plan_html } : {}) })
      .eq('id', row.id);
    if (!uErr) plansUpdated++;
  }

  return { plansUpdated, exercisesPatched, dryRun, registryKeys: registryMap.size };
}
