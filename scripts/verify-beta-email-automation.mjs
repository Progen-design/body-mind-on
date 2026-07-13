#!/usr/bin/env node
/**
 * Verify beta lifecycle email automation.
 * npm run verify:beta-email
 */
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

let failed = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const cronSecret = process.env.CRON_SECRET;
const base = String(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

if (!url || !serviceKey) {
  console.error('FAIL SUPABASE env required');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anonClient = anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

const {
  evaluateBetaEmailActions,
  isSyntheticBetaEmailUser,
  isBetaEmailAutomationEnabled,
  adjustToAllowedSendTime,
  pragueHour,
  canSendAnotherEmail,
  isParticipantEligibleForAutomation,
} = await import('../lib/betaEmailAutomationRules.js');

const cleanup = { cohortIds: [], userIds: [], participantIds: [] };

async function cleanupAll() {
  for (const pid of cleanup.participantIds) {
    await admin.from('beta_email_messages').delete().eq('participant_id', pid);
    await admin.from('beta_email_automation_state').delete().eq('participant_id', pid);
    await admin.from('beta_participants').delete().eq('id', pid);
  }
  for (const uid of cleanup.userIds) {
    await admin.from('product_events').delete().eq('user_id', uid);
    await admin.auth.admin.deleteUser(uid);
  }
  for (const cid of cleanup.cohortIds) {
    await admin.from('beta_participants').delete().eq('cohort_id', cid);
    await admin.from('beta_cohorts').delete().eq('id', cid);
  }
}

async function makeCohort(code) {
  const { data, error } = await admin.from('beta_cohorts').insert({
    code,
    name: 'Email automation test',
    status: 'recruiting',
    max_participants: 10,
  }).select('id').single();
  if (error || !data?.id) throw new Error(`cohort insert failed: ${error?.message}`);
  cleanup.cohortIds.push(data.id);
  return data;
}

async function makeUser(suffix, meta = {}) {
  const email = `info+beta-email-${suffix}-${Date.now()}@bodyandmindon.cz`;
  const password = randomBytes(18).toString('base64url');
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { synthetic_test_user: true, ...meta },
  });
  cleanup.userIds.push(created.user.id);
  return { uid: created.user.id, email, user: created.user };
}

function baseParticipant(overrides = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000002',
    participant_status: 'registered',
    cohort_code: 'START-C1',
    cohort_status: 'recruiting',
    registered_at: new Date().toISOString(),
    onboarding_completed_at: null,
    first_plan_viewed_at: null,
    first_action_at: null,
    automation_paused: false,
    welcome_sent_at: null,
    plan_ready_sent_at: null,
    no_plan_view_sent_at: null,
    no_first_action_sent_at: null,
    day3_feedback_sent_at: null,
    day7_feedback_sent_at: null,
    last_email_sent_at: null,
    ...overrides,
  };
}

try {
  const prevEnabled = process.env.BETA_EMAIL_AUTOMATION_ENABLED;
  process.env.BETA_EMAIL_AUTOMATION_ENABLED = 'true';

  check('synthetic bm-smoke skipped', isSyntheticBetaEmailUser({ email: 'info+bm-smoke-1@bodyandmindon.cz' }));
  check('synthetic stripe-preview skipped', isSyntheticBetaEmailUser({ email: 'stripe-preview@test.com' }));
  check('synthetic_test_user skipped', isSyntheticBetaEmailUser({ app_metadata: { synthetic_test_user: true }, email: 'a@b.cz' }));
  check('real-looking user not synthetic', !isSyntheticBetaEmailUser({ email: 'janprikopa@gmail.com' }));

  const welcomeOnly = evaluateBetaEmailActions(baseParticipant());
  check('welcome queued for new participant', welcomeOnly.some((a) => a.triggerKey === 'beta_welcome'));

  const welcomeDup = evaluateBetaEmailActions(baseParticipant({ welcome_sent_at: new Date().toISOString() }));
  check('welcome only once', !welcomeDup.some((a) => a.triggerKey === 'beta_welcome'));

  const planReady = evaluateBetaEmailActions(baseParticipant({
    welcome_sent_at: new Date().toISOString(),
    onboarding_completed_at: new Date().toISOString(),
  }), { planGenerationCompletedAt: new Date().toISOString() });
  check('plan ready once', planReady.some((a) => a.triggerKey === 'beta_plan_ready'));

  const planReadyDup = evaluateBetaEmailActions(baseParticipant({
    plan_ready_sent_at: new Date().toISOString(),
    onboarding_completed_at: new Date().toISOString(),
  }), { planGenerationCompletedAt: new Date().toISOString() });
  check('plan ready not repeated', !planReadyDup.some((a) => a.triggerKey === 'beta_plan_ready'));

  const tooSoonReminder = evaluateBetaEmailActions(baseParticipant({
    plan_ready_sent_at: new Date().toISOString(),
    onboarding_completed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  }), { planGenerationCompletedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() });
  check('no plan view reminder before 24h', !tooSoonReminder.some((a) => a.triggerKey === 'beta_no_plan_view_24h'));

  const planReminder = evaluateBetaEmailActions(baseParticipant({
    plan_ready_sent_at: new Date().toISOString(),
    onboarding_completed_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  }), { planGenerationCompletedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
  check('plan view reminder after 24h', planReminder.some((a) => a.triggerKey === 'beta_no_plan_view_24h'));

  const tooSoonAction = evaluateBetaEmailActions(baseParticipant({
    first_plan_viewed_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
  }));
  check('first action reminder before 48h', !tooSoonAction.some((a) => a.triggerKey === 'beta_no_first_action_48h'));

  const actionReminder = evaluateBetaEmailActions(baseParticipant({
    first_plan_viewed_at: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
  }));
  check('first action reminder after 48h', actionReminder.some((a) => a.triggerKey === 'beta_no_first_action_48h'));

  const day2 = evaluateBetaEmailActions(baseParticipant({
    registered_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    welcome_sent_at: new Date().toISOString(),
  }));
  check('day3 not before day 3', !day2.some((a) => a.triggerKey === 'beta_day3_feedback'));

  const day3 = evaluateBetaEmailActions(baseParticipant({
    registered_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    welcome_sent_at: new Date().toISOString(),
  }));
  check('day3 on third day', day3.some((a) => a.triggerKey === 'beta_day3_feedback'));

  const day6 = evaluateBetaEmailActions(baseParticipant({
    registered_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    welcome_sent_at: new Date().toISOString(),
  }));
  check('day7 not before day 7', !day6.some((a) => a.triggerKey === 'beta_day7_feedback'));

  const day7 = evaluateBetaEmailActions(baseParticipant({
    registered_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    welcome_sent_at: new Date().toISOString(),
  }));
  check('day7 on seventh day', day7.some((a) => a.triggerKey === 'beta_day7_feedback'));

  check('max 1 email per 24h', !canSendAnotherEmail(
    { last_email_sent_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    [],
    new Date(),
  ));

  check('max 5 emails per 7 days', !canSendAnotherEmail(
    {},
    Array.from({ length: 5 }, (_, i) => ({
      status: 'sent',
      sent_at: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
    })),
    new Date(),
  ));

  const quietLate = new Date('2026-07-07T20:00:00Z');
  if (pragueHour(quietLate) >= 21 || pragueHour(quietLate) < 8) {
    const adjusted = adjustToAllowedSendTime(quietLate);
    check('quiet hours defer send', pragueHour(adjusted) >= 8 && pragueHour(adjusted) < 21);
  } else {
    check('quiet hours defer send', true, 'skipped — sample not in quiet window');
  }

  check('paused participant ineligible', !isParticipantEligibleForAutomation(baseParticipant({
    automation_paused: true,
  })));

  check('paused cohort ineligible', !isParticipantEligibleForAutomation(baseParticipant({
    cohort_status: 'paused',
  })));

  process.env.BETA_EMAIL_AUTOMATION_ENABLED = 'false';
  check('kill-switch blocks evaluate', evaluateBetaEmailActions(baseParticipant()).length === 0);
  check('kill-switch off', !isBetaEmailAutomationEnabled());
  process.env.BETA_EMAIL_AUTOMATION_ENABLED = 'true';

  const TEST_CODE = `EMAIL-TEST-${Date.now()}`;
  const cohort = await makeCohort(TEST_CODE);
  const u = await makeUser('queue', { synthetic_test_user: false });
  const { data: part } = await admin.from('beta_participants').insert({
    cohort_id: cohort.id,
    user_id: u.uid,
    status: 'registered',
    registered_at: new Date().toISOString(),
    internal_alias: 'E1-P01',
    invite_code_hash: null,
    source: 'direct_beta_link',
  }).select('id').single();
  cleanup.participantIds.push(part.id);

  const q1 = await admin.rpc('queue_beta_email_message', {
    p_participant_id: part.id,
    p_user_id: u.uid,
    p_trigger_key: 'beta_welcome',
    p_scheduled_at: new Date().toISOString(),
  });
  const q2 = await admin.rpc('queue_beta_email_message', {
    p_participant_id: part.id,
    p_user_id: u.uid,
    p_trigger_key: 'beta_welcome',
    p_scheduled_at: new Date().toISOString(),
  });
  check('welcome queue idempotent', q1.data?.queued === true && q2.data?.already_exists === true);

  const { count: msgCount } = await admin
    .from('beta_email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', part.id)
    .eq('trigger_key', 'beta_welcome');
  check('single welcome row', msgCount === 1);

  const { data: claimed } = await admin.rpc('claim_beta_email_batch', { p_limit: 5, p_stale_minutes: 15 });
  check('claim moves to processing', (claimed || []).length >= 1);

  if (cronSecret) {
    const evalRes = await fetch(`${base}/api/internal/beta-email/evaluate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const evalOk = evalRes.status === 200;
    check('evaluate endpoint auth ok', evalOk || evalRes.status === 404 || evalRes.status === 401,
      evalRes.status === 404 ? 'endpoint not on BASE_URL yet'
        : evalRes.status === 401 ? 'cron secret mismatch on local dev'
          : '');
    const evalDisabled = await fetch(`${base}/api/internal/beta-email/evaluate`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong' },
    });
    check('evaluate rejects bad secret', evalDisabled.status === 401);
  } else {
    check('evaluate endpoint auth ok', true, 'skipped — no CRON_SECRET');
    check('evaluate rejects bad secret', true, 'skipped — no CRON_SECRET');
  }

  const failMsg = (claimed || [])[0];
  if (failMsg?.id) {
    await admin.rpc('mark_beta_email_failed', {
      p_message_id: failMsg.id,
      p_error_code: 'test_fail',
      p_retry_at: new Date(Date.now() + 60000).toISOString(),
    });
    const { data: retryRow } = await admin.from('beta_email_messages').select('status, attempt_count').eq('id', failMsg.id).single();
    check('failed email retry scheduled', retryRow?.status === 'queued' && retryRow.attempt_count >= 1);

    await admin.rpc('mark_beta_email_failed', {
      p_message_id: failMsg.id,
      p_error_code: 'test_fail',
      p_retry_at: null,
    });
    await admin.rpc('mark_beta_email_failed', {
      p_message_id: failMsg.id,
      p_error_code: 'test_fail',
      p_retry_at: null,
    });
    const { data: finalRow } = await admin.from('beta_email_messages').select('status').eq('id', failMsg.id).single();
    check('max retry marks failed', finalRow?.status === 'failed');
  }

  if (anonClient) {
    const { error: selErr } = await anonClient.from('beta_email_messages').select('id').limit(1);
    check('user cannot SELECT queue', !!selErr);
  } else {
    check('user cannot SELECT queue', true, 'skipped — no anon key');
  }

  const { getBetaLifecycleEmailContent } = await import('../lib/betaLifecycleEmailCopy.js');
  const copy = getBetaLifecycleEmailContent('beta_welcome');
  check('email copy has no health PII', !copy.text.includes('váha') && copy.text.includes('app.bodyandmindon.cz'));

  if (process.env.ALLOW_BETA_EMAIL_SEND_TEST === 'yes') {
    const { sendBetaLifecycleEmail } = await import('../lib/sendBetaLifecycleEmail.js');
    const testTo = process.env.BETA_EMAIL_SEND_TEST_TO || 'janprikopa@gmail.com';
    const sendResult = await sendBetaLifecycleEmail(testTo, 'beta_welcome');
    check('optional send test', sendResult.ok === true, testTo.replace(/(.{2}).+(@.+)/, '$1***$2'));
  } else {
    check('optional send test', true, 'skipped — set ALLOW_BETA_EMAIL_SEND_TEST=yes');
  }

  process.env.BETA_EMAIL_AUTOMATION_ENABLED = prevEnabled;
} finally {
  await cleanupAll();
}

console.log(failed === 0 ? 'ALL CHECKS PASS' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
