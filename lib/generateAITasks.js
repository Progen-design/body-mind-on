/**
 * Generate ai_tasks for users who need automated actions (weekly plan, coach message).
 * Called before runAIScheduler so pending queue is filled.
 * Future expansion: marketing campaigns (schedule by date), social calendar (post slots), AI push notifications, automated weekly coaching reminders.
 */
import { supabaseServer } from './supabaseServer';
import { ensureForceRegenerateTasksForLegacyExerciseNames } from './planExerciseNameCsBackfill';

const TRAINER_PLAN_DAYS = 7;
const COACH_CHECKIN_DAYS = 5;

/**
 * FEATURE FLAG — TEMPORARY (P0 stop bleeding Spoonacular quota).
 * `weekly_plan_update` task creation is paused until missing_days_structure (and related)
 * failures are fixed; re-enable in code (remove hard `|| true`) when success rate is >80% for 24h.
 * Env: PAUSE_WEEKLY_PLAN_UPDATE is ignored while `|| true` remains — remove that clause to honor env.
 * Tracking: tie to your issue tracker when you open a ticket for the root fix.
 */
const WEEKLY_PLAN_UPDATE_CREATION_PAUSED =
  process.env.PAUSE_WEEKLY_PLAN_UPDATE === 'true' || true; // hard pause: must re-enable after fix

/**
 * Create initial AI tasks for a newly registered user (after body_metrics insert).
 * Inserts trainer initial_plan and coach onboarding_message so the scheduler generates first plan and sends onboarding.
 */
export async function createInitialAITasks(userId) {
  if (!userId) return { created: 0 };
  try {
    const inserts = [
      {
        user_id: userId,
        agent_slug: 'trainer',
        task_type: 'initial_plan',
        payload: { prompt: 'Vygeneruj úvodní týdenní plán na základě kontextu uživatele.' },
        status: 'pending',
      },
      {
        user_id: userId,
        agent_slug: 'coach',
        task_type: 'onboarding_message',
        payload: { prompt: 'Pošli uvítací / onboarding zprávu na základě kontextu uživatele.' },
        status: 'pending',
      },
    ];
    const { error } = await supabaseServer.from('ai_tasks').insert(inserts);
    if (error) {
      console.warn('[createInitialAITasks]', error.message);
      return { created: 0 };
    }
    return { created: inserts.length };
  } catch (err) {
    console.warn('[createInitialAITasks]', err?.message);
    return { created: 0 };
  }
}

export async function generateAITasks() {
  const legacyRegen = await ensureForceRegenerateTasksForLegacyExerciseNames();

  const now = new Date();
  const planThreshold = new Date(now.getTime() - TRAINER_PLAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const checkinThreshold = new Date(now.getTime() - COACH_CHECKIN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let created = 0;

  // Trainer: users whose most recent plan is older than 7 days
  const { data: allPlans } = await supabaseServer
    .from('ai_generated_plans')
    .select('user_id, created_at')
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false });

  const latestPlanByUser = new Map();
  for (const row of allPlans ?? []) {
    if (row.user_id && !latestPlanByUser.has(row.user_id)) {
      latestPlanByUser.set(row.user_id, row);
    }
  }

  for (const [userId, plan] of latestPlanByUser) {
    if (new Date(plan.created_at) >= new Date(planThreshold)) continue;
    const { data: existing } = await supabaseServer
      .from('ai_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_slug', 'trainer')
      .eq('task_type', 'weekly_plan_update')
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      if (WEEKLY_PLAN_UPDATE_CREATION_PAUSED) {
        console.warn('[scheduler] weekly_plan_update task creation paused', {
          user_id: userId,
          reason: 'missing_days_structure bug — TEMPORARY until root cause fixed; re-enable after fix + stable success',
          timestamp: new Date().toISOString(),
        });
        continue;
      }
      await supabaseServer.from('ai_tasks').insert({
        user_id: userId,
        agent_slug: 'trainer',
        task_type: 'weekly_plan_update',
        payload: { prompt: 'Vygeneruj nový týdenní plán na základě kontextu uživatele.' },
        status: 'pending',
      });
      created++;
    }
  }

  // Coach: users whose last check-in is older than 5 days (and they have at least one check-in)
  const { data: checkins } = await supabaseServer
    .from('user_checkins')
    .select('user_id, created_at')
    .order('created_at', { ascending: false });

  const usersWithOldCheckin = new Set();
  const seenUser = new Set();
  for (const row of checkins ?? []) {
    if (!row.user_id) continue;
    if (seenUser.has(row.user_id)) continue;
    seenUser.add(row.user_id);
    if (new Date(row.created_at) < new Date(checkinThreshold)) {
      usersWithOldCheckin.add(row.user_id);
    }
  }

  for (const userId of usersWithOldCheckin) {
    const { data: existing } = await supabaseServer
      .from('ai_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_slug', 'coach')
      .eq('task_type', 'motivation_message')
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      await supabaseServer.from('ai_tasks').insert({
        user_id: userId,
        agent_slug: 'coach',
        task_type: 'motivation_message',
        payload: { prompt: 'Pošli motivační zprávu na základě kontextu uživatele.' },
        status: 'pending',
      });
      created++;
    }
  }

  return { created, legacy_regen_queued: legacyRegen?.queued ?? 0 };
}
