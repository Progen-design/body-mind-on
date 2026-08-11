import { supabaseServer } from './supabaseServer';
import {
  canRenewPlanForMembership,
  isPlanTask,
  isExpired,
  PLAN_TASK_TYPES,
} from './planRenewalRules.js';

// Čistá pravidla žijí v lib/planRenewalRules.js, protože tenhle modul sahá na
// Supabase přes extensionless import a v holém Node ESM se nedá naimportovat.
// Re-export drží dosavadní volající (pages/api/profile.js, weeklyPlanProducer)
// na stejné cestě; importuje se výš, takže je to lokální vazba, ne bare
// re-export (viz lib/__tests__/reexportBinding.test.mjs).
export { canRenewPlanForMembership, isPlanTask, isExpired, PLAN_TASK_TYPES };

async function hasAnyPlan(userId) {
  const { count, error } = await supabaseServer
    .from('ai_generated_plans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return true;
  return Number(count || 0) > 0;
}


export async function canRunPlanTask(userId, agentSlug, taskType) {
  if (!userId) return { allowed: false, reason: 'missing_user_id' };
  if (!isPlanTask(agentSlug, taskType)) return { allowed: true, reason: 'non_plan_task' };

  const { data: membership, error } = await supabaseServer
    .from('memberships')
    .select('tier, status, trial_ends_at')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  const type = String(taskType || '');

  if (error || !membership) {
    if (type !== 'initial_plan') {
      return { allowed: false, reason: 'missing_membership_for_plan_task' };
    }

    return (await hasAnyPlan(userId))
      ? { allowed: false, reason: 'initial_plan_already_exists_without_membership' }
      : { allowed: true, reason: 'registration_initial_plan_without_membership' };
  }

  const tier = String(membership.tier || '').toUpperCase();

  if (membership.status === 'pending_payment') {
    return { allowed: false, reason: 'pending_payment_upgrade_required' };
  }
  if (membership.status === 'past_due') {
    return { allowed: false, reason: 'paid_membership_past_due' };
  }

  if (tier === 'START') {
    if (membership.status === 'active') {
      return { allowed: true, reason: 'start_active' };
    }

    if (isExpired(membership.trial_ends_at)) {
      return { allowed: false, reason: 'start_trial_expired_upgrade_required' };
    }

    if (type !== 'initial_plan') {
      return { allowed: false, reason: 'start_trial_allows_initial_plan_only' };
    }

    return (await hasAnyPlan(userId))
      ? { allowed: false, reason: 'start_trial_initial_plan_already_exists' }
      : { allowed: true, reason: 'start_trial_first_initial_plan' };
  }

  if (membership.status === 'active') {
    return { allowed: true, reason: `${tier}_active` };
  }

  return { allowed: false, reason: 'paid_membership_inactive' };
}
