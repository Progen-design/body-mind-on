import { supabaseServer } from './supabaseServer';

const PLAN_TASK_TYPES = new Set([
  'initial_plan',
  'adjust_plan',
  'reduce_training_load',
  'weekly_plan_update',
  'next_week_plan',
  'regenerate_plan',
]);

function isPlanTask(agentSlug, taskType) {
  return String(agentSlug || '').toLowerCase() === 'trainer' || PLAN_TASK_TYPES.has(String(taskType || ''));
}

function isExpired(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

async function hasAnyPlan(userId) {
  const { count, error } = await supabaseServer
    .from('ai_generated_plans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return true;
  return Number(count || 0) > 0;
}

/**
 * Smí tomuhle členství vzniknout NÁSLEDNÝ plán (tj. jiný než initial_plan)?
 *
 * Čistá funkce nad už načteným řádkem z `memberships`. Existuje proto, aby UI
 * nemuselo pravidla opisovat: profil potřebuje uživateli po expiraci plánu říct,
 * jestli nový přijde, nebo nepřijde — a to je přesně tahle otázka. Kdyby si
 * odpověď UI odvozovalo samo, rozejde se to s bránou při první změně tarifu
 * a uživateli slíbíme plán, který mu scheduler nikdy nevygeneruje.
 *
 * Držet v souladu s canRunPlanTask() níže pro taskType !== 'initial_plan'.
 *
 * @param {{ tier?: string, status?: string, trial_ends_at?: string|null }|null|undefined} membership
 * @returns {{ allowed: boolean, reason: string, trialEnded: boolean }}
 */
export function canRenewPlanForMembership(membership) {
  if (!membership) {
    return { allowed: false, reason: 'missing_membership_for_plan_task', trialEnded: false };
  }

  const tier = String(membership.tier || '').toUpperCase();
  const status = String(membership.status || '');
  const trialEnded = isExpired(membership.trial_ends_at);

  if (status === 'pending_payment') {
    return { allowed: false, reason: 'pending_payment_upgrade_required', trialEnded };
  }
  if (status === 'past_due') {
    return { allowed: false, reason: 'paid_membership_past_due', trialEnded };
  }

  if (tier === 'START') {
    if (status === 'active') return { allowed: true, reason: 'start_active', trialEnded };
    if (trialEnded) {
      return { allowed: false, reason: 'start_trial_expired_upgrade_required', trialEnded: true };
    }
    // Trial ještě běží, ale opakovaný plán do něj nepatří — dostane jen ten první.
    return { allowed: false, reason: 'start_trial_allows_initial_plan_only', trialEnded: false };
  }

  if (status === 'active') return { allowed: true, reason: `${tier}_active`, trialEnded };

  return { allowed: false, reason: 'paid_membership_inactive', trialEnded };
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
