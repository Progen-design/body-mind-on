import { supabaseServer } from './supabaseServer';
import { getRecovery } from './health/queries';
import { buildAggregatedRecoverySummary, hasConsecutiveLowRecovery } from './health/recoveryReview';
import { createAITasksFromDecisions } from './createAITasksFromDecisions';
import { calendarDateIsoInPrague } from './czechCalendar';
import { runAICoachScheduler, runAIScheduler } from './aiScheduler';

const REVIEW_DAYS = 14;
const TRAINER_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const COACH_REVIEW_PROMPT =
  'Vyhodnoť agregovaná denní data z Apple Watch (regenerace, HRV, klidový tep, spánek, aktivita). ' +
  'Dej praktické doporučení na dnešek — tréninková zátěž, ne zdravotní diagnóza. ' +
  'Nepracuj s raw payloady, jen se summary v apple_health_recovery_summary.';

const TRAINER_LOW_RECOVERY_PROMPT =
  'Uživatel má dva dny po sobě nízké skóre regenerace z Apple Watch (<50). ' +
  'Uprav aktuální plán se sníženým objemem tréninku a větším důrazem na regeneraci.';

async function loadTrainerRulesForLowRecovery() {
  try {
    const { data, error } = await supabaseServer
      .from('ai_trigger_rules')
      .select('trigger_type, trigger_value, agent_slug, task_type, priority, conditions_json')
      .eq('enabled', true)
      .eq('trigger_type', 'apple_health_low_recovery')
      .order('priority', { ascending: true });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

function resolveTrainerDecisionFromRules(rules, summary) {
  const rule = rules?.[0];
  if (rule?.agent_slug && rule?.task_type) {
    return {
      agent_slug: rule.agent_slug,
      task_type: rule.task_type,
      reason: 'apple_health_low_recovery',
      payload: {
        prompt: TRAINER_LOW_RECOVERY_PROMPT,
        apple_health_recovery_summary: summary,
        trigger_rule: {
          trigger_type: rule.trigger_type,
          trigger_value: rule.trigger_value,
        },
      },
    };
  }

  return {
    agent_slug: 'trainer',
    task_type: 'reduce_training_load',
    reason: 'apple_health_low_recovery',
    payload: {
      prompt: TRAINER_LOW_RECOVERY_PROMPT,
      apple_health_recovery_summary: summary,
    },
  };
}

async function isTrainerAlertRateLimited(userId) {
  const alertKey = `apple_health_low_recovery:${userId}`;
  const { data: alertRow } = await supabaseServer
    .from('trainer_alert_state')
    .select('value, updated_at')
    .eq('key', alertKey)
    .maybeSingle();

  const last = alertRow?.updated_at ? new Date(alertRow.updated_at).getTime() : 0;
  return Date.now() - last <= TRAINER_ALERT_COOLDOWN_MS;
}

async function markTrainerAlertSent(userId, value = 'low_recovery') {
  const alertKey = `apple_health_low_recovery:${userId}`;
  await supabaseServer.from('trainer_alert_state').upsert(
    {
      key: alertKey,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
}

export async function getActiveAppleHealthUserIds() {
  const { data, error } = await supabaseServer
    .from('apple_health_connections')
    .select('user_id')
    .eq('status', 'active');

  if (error) throw new Error(error.message || 'Nepodařilo se načíst aktivní Apple Health připojení.');

  return [...new Set((data || []).map((row) => row.user_id).filter(Boolean))];
}

export async function createDailyCoachReviewTask(userId, summary) {
  const today = calendarDateIsoInPrague();
  const idempotencyKey = `apple_health_review:${userId}:${today}`;

  const { data: existing, error: existingErr } = await supabaseServer
    .from('ai_tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('agent_slug', 'coach')
    .eq('task_type', 'apple_health_daily_review')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing?.id) return { created: false, task_id: existing.id };

  const { data: inserted, error: insertErr } = await supabaseServer
    .from('ai_tasks')
    .insert({
      user_id: userId,
      agent_slug: 'coach',
      task_type: 'apple_health_daily_review',
      idempotency_key: idempotencyKey,
      payload: {
        prompt: COACH_REVIEW_PROMPT,
        apple_health_recovery_summary: summary,
      },
      status: 'pending',
      attempts: 0,
      next_retry_at: null,
      last_error: null,
    })
    .select('id')
    .maybeSingle();

  if (insertErr) {
    if (/duplicate key|unique constraint|idx_ai_tasks_idempotency/i.test(insertErr.message || '')) {
      return { created: false, duplicate: true };
    }
    throw new Error(insertErr.message || 'Nepodařilo se vytvořit coach review task.');
  }

  return { created: true, task_id: inserted?.id ?? null };
}

export async function maybeTriggerTrainerLowRecovery(userId, summary) {
  if (!hasConsecutiveLowRecovery(summary.daily)) {
    return { triggered: false, reason: 'no_streak' };
  }

  if (await isTrainerAlertRateLimited(userId)) {
    return { triggered: false, reason: 'rate_limited' };
  }

  const rules = await loadTrainerRulesForLowRecovery();
  const decision = resolveTrainerDecisionFromRules(rules, summary);
  const result = await createAITasksFromDecisions({
    userId,
    decisions: [decision],
  });

  if (result.created > 0) {
    await markTrainerAlertSent(userId);
    return { triggered: true, trainer_tasks_created: result.created, decision };
  }

  return { triggered: false, reason: 'task_skipped', skipped: result.skipped };
}

export async function processAppleHealthDailyReviewForUser(userId) {
  const rows = await getRecovery(userId, REVIEW_DAYS);
  const summary = buildAggregatedRecoverySummary(rows, REVIEW_DAYS);

  const coachTask = await createDailyCoachReviewTask(userId, summary);
  const trainerTrigger = await maybeTriggerTrainerLowRecovery(userId, summary);

  return {
    user_id: userId,
    recovery_days: summary.daily.length,
    coach_task: coachTask,
    trainer_trigger: trainerTrigger,
    consecutive_low_recovery: summary.consecutive_low_recovery,
  };
}

export async function runAppleHealthDailyReviewBatch() {
  const userIds = await getActiveAppleHealthUserIds();
  const results = [];
  let coachTasksCreated = 0;
  let trainerTriggers = 0;

  for (const userId of userIds) {
    try {
      const row = await processAppleHealthDailyReviewForUser(userId);
      results.push(row);
      if (row.coach_task?.created) coachTasksCreated += 1;
      if (row.trainer_trigger?.triggered) trainerTriggers += 1;
    } catch (err) {
      results.push({
        user_id: userId,
        error: err?.message || 'processing_failed',
      });
    }
  }

  let coachSchedulerRuns = 0;
  let coachProcessed = 0;
  for (let i = 0; i < 40; i += 1) {
    const run = await runAICoachScheduler({ limit: 3 });
    coachSchedulerRuns += 1;
    coachProcessed += run.processed || 0;
    if (!run.processed) break;
  }

  let trainerSchedulerRuns = 0;
  let trainerProcessed = 0;
  if (trainerTriggers > 0) {
    for (let i = 0; i < 10; i += 1) {
      const run = await runAIScheduler();
      trainerSchedulerRuns += 1;
      trainerProcessed += run.processed || 0;
      if (!run.processed) break;
    }
  }

  return {
    users_total: userIds.length,
    coach_tasks_created: coachTasksCreated,
    trainer_triggers: trainerTriggers,
    coach_processed: coachProcessed,
    trainer_processed: trainerProcessed,
    coach_scheduler_runs: coachSchedulerRuns,
    trainer_scheduler_runs: trainerSchedulerRuns,
    results,
  };
}
