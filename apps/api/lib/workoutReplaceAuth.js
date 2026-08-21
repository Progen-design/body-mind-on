/**
 * Shared auth + plan ownership for workout replacement APIs.
 */
import { supabaseServer } from './supabaseServer';
import { requireActiveMembership } from './membershipHelpers';

export async function getWorkoutReplaceAuth(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Nejste přihlášen', status: 401 };

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user?.id) return { error: 'Neplatná session', status: 401 };

  const access = await requireActiveMembership(user.id);
  if (!access.allowed) return { error: 'Členství není aktivní.', status: 403 };

  return { user, token };
}

/**
 * @param {string} userId
 * @param {string} planId
 * @param {number} planDayIndex
 */
export async function loadOwnedPlanDay(userId, planId, planDayIndex) {
  const { data: planRow, error: planErr } = await supabaseServer
    .from('ai_generated_plans')
    .select('id, user_id, structured_plan_json, plan_html')
    .eq('id', planId)
    .eq('user_id', userId)
    .maybeSingle();

  if (planErr || !planRow) return { error: 'Plán nenalezen', status: 404 };

  const structured = planRow.structured_plan_json && typeof planRow.structured_plan_json === 'object'
    ? JSON.parse(JSON.stringify(planRow.structured_plan_json))
    : null;
  if (!structured?.days?.length) return { error: 'Plán nemá structured data', status: 400 };

  const dayIdx = Number(planDayIndex);
  if (!Number.isFinite(dayIdx) || dayIdx < 0 || dayIdx >= structured.days.length) {
    return { error: 'Neplatný den plánu', status: 400 };
  }

  const day = structured.days[dayIdx];
  const workout = day?.workout;
  const exercises = Array.isArray(workout?.exercises)
    ? workout.exercises.filter((ex) => String(ex?.canonical_key || '').toLowerCase() !== 'rest')
    : [];

  return {
    planRow,
    structured,
    day,
    dayIdx,
    workout,
    exercises,
    hasWorkout: exercises.length > 0,
  };
}

/**
 * @param {string} userId
 * @param {string} planId
 * @param {number} planDayIndex
 */
export async function isTodayWorkoutCompleted(userId, planId, planDayIndex) {
  let q = supabaseServer
    .from('daily_activity_completions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_day', planDayIndex)
    .eq('activity_type', 'workout')
    .eq('activity_key', 'plan_day')
    .limit(1);
  if (planId) q = q.eq('plan_id', planId);
  else q = q.is('plan_id', null);
  const { data } = await q;
  return (data || []).length > 0;
}
