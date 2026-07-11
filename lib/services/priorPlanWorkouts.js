/**
 * Načtení již vyřešených tréninků z uloženého plánu pro režim mealsOnly
 * (bez nových volání wger – stejný tvar jako výstup resolveWorkouts).
 */
import { supabaseServer } from '../supabaseServer';

/**
 * @param {string|number|null|undefined} userId
 * @returns {Promise<Array<{ day_index: number, exercises: object[] }>|null>}
 */
export async function loadResolvedWorkoutsFromLatestPlan(userId) {
  if (userId == null || userId === '') return null;
  const uid = String(userId).trim();
  if (!uid) return null;

  const fromJson = (json) => {
    if (!json || typeof json !== 'object' || !Array.isArray(json.days)) return null;
    const out = [];
    for (const d of json.days) {
      const di = Number(d?.day_index);
      if (!Number.isFinite(di) || di < 0 || di > 6) continue;
      const wo = d?.workout;
      if (!wo || !Array.isArray(wo.exercises) || wo.exercises.length === 0) continue;
      out.push({
        day_index: di,
        exercises: JSON.parse(JSON.stringify(wo.exercises)),
      });
    }
    return out.length ? out : null;
  };

  const { data: active } = await supabaseServer
    .from('ai_generated_plans')
    .select('structured_plan_json')
    .eq('user_id', uid)
    .eq('is_active', true)
    .maybeSingle();

  const activeWorkouts = fromJson(active?.structured_plan_json);
  if (activeWorkouts) return activeWorkouts;

  const { data: rows } = await supabaseServer
    .from('ai_generated_plans')
    .select('structured_plan_json')
    .eq('user_id', uid)
    .order('valid_until', { ascending: false })
    .limit(1);

  return fromJson(rows?.[0]?.structured_plan_json) ?? null;
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
