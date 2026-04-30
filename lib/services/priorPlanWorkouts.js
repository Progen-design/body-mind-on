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
