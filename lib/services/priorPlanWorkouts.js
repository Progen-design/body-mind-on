/**
 * Načtení již vyřešených tréninků z uloženého plánu pro režim mealsOnly
 * (bez nových volání wger – stejný tvar jako výstup resolveWorkouts).
 */
import { supabaseServer } from '../supabaseServer.js';

/**
 * Vrací CELÝ uložený objekt `workout` (ne jen `exercises`) — jinak se cestou
 * ztratí `workout_name`/`start_program_variant` a další pole, která
 * `planOrchestrator.js` do `workout` uložilo napoprvé. Změřeno na plánu
 * `64bf0ee1…` (docs/DALSI_KROK.md 8.2): po mealsOnly regeneraci zůstal
 * `workout_name` `undefined` a trénink v UI ztratil jméno „Trénink B“,
 * ačkoli komentář u volajícího (`api/profile-preferences.js`) i banner
 * slibují, že trénink zůstane beze změny.
 *
 * Čistá funkce (žádné volání DB) — testuje se přímo, `loadResolvedWorkoutsFromLatestPlan`
 * ji jen krmí daty z `ai_generated_plans.structured_plan_json`.
 *
 * @param {{ days?: Array<{ day_index?: number, workout?: { exercises?: object[], [key: string]: unknown } }> }|null|undefined} json
 * @returns {Array<{ day_index: number, exercises: object[], [key: string]: unknown }>|null}
 */
export function resolveWorkoutsFromStoredPlanJson(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.days)) return null;
  const out = [];
  for (const d of json.days) {
    const di = Number(d?.day_index);
    if (!Number.isFinite(di) || di < 0 || di > 6) continue;
    const wo = d?.workout;
    if (!wo || !Array.isArray(wo.exercises) || wo.exercises.length === 0) continue;
    out.push({
      ...JSON.parse(JSON.stringify(wo)),
      day_index: di,
    });
  }
  return out.length ? out : null;
}

/**
 * @param {string|number|null|undefined} userId
 * @returns {Promise<Array<{ day_index: number, exercises: object[], [key: string]: unknown }>|null>}
 */
export async function loadResolvedWorkoutsFromLatestPlan(userId) {
  if (userId == null || userId === '') return null;
  const uid = String(userId).trim();
  if (!uid) return null;

  const { data: active } = await supabaseServer
    .from('ai_generated_plans')
    .select('structured_plan_json')
    .eq('user_id', uid)
    .eq('is_active', true)
    .maybeSingle();

  const activeWorkouts = resolveWorkoutsFromStoredPlanJson(active?.structured_plan_json);
  if (activeWorkouts) return activeWorkouts;

  const { data: rows } = await supabaseServer
    .from('ai_generated_plans')
    .select('structured_plan_json')
    .eq('user_id', uid)
    .order('valid_until', { ascending: false })
    .limit(1);

  return resolveWorkoutsFromStoredPlanJson(rows?.[0]?.structured_plan_json) ?? null;
}

/**
 * @param {Array<{ exercises?: object[] }>|null|undefined} workouts
 * @returns {string[]}
 */
export function extractCanonicalKeysFromResolvedWorkouts(workouts) {
  const keys = new Set();
  for (const day of workouts || []) {
    for (const ex of day?.exercises || []) {
      const k = String(ex?.canonical_key || '').trim().toLowerCase();
      if (k && k !== 'rest' && k !== 'warmup' && k !== 'cooldown') keys.add(k);
    }
  }
  return [...keys];
}

/**
 * Klíče cviků z posledního plánu — pro rozmanitost při generování nového týdne.
 * @param {string|number|null|undefined} userId
 * @returns {Promise<string[]>}
 */
export async function loadPriorWorkoutCanonicalKeys(userId) {
  const workouts = await loadResolvedWorkoutsFromLatestPlan(userId);
  return extractCanonicalKeysFromResolvedWorkouts(workouts);
}

/**
 * Doplní bodyMetrics o klíče cviků z minulého plánu (vyhnout se opakování).
 * @param {object} bodyMetrics
 * @param {string} [validFromIso]
 * @returns {Promise<object>}
 */
export async function enrichBodyMetricsWithPriorWorkoutAvoidance(bodyMetrics = {}, validFromIso) {
  const base = {
    ...bodyMetrics,
    valid_from: bodyMetrics?.valid_from || validFromIso || null,
  };
  if (!base?.user_id) return base;
  try {
    const priorKeys = await loadPriorWorkoutCanonicalKeys(base.user_id);
    if (priorKeys.length) {
      return { ...base, _avoid_workout_keys: priorKeys };
    }
  } catch {
    /* neblokovat generování */
  }
  return base;
}
