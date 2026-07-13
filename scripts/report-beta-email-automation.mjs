#!/usr/bin/env node
/**
 * Beta lifecycle email automation report (no PII).
 * npm run report:beta-email
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { parseBetaEmailAutomationEnabled } from '../lib/betaEmailAutomationRules.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('FAIL SUPABASE env required');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const automationEnabled = parseBetaEmailAutomationEnabled(process.env.BETA_EMAIL_AUTOMATION_ENABLED);
const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const { data: cohort } = await admin.from('beta_cohorts').select('id, code, status').eq('code', 'START-C1').maybeSingle();

const { data: participants } = cohort?.id
  ? await admin
    .from('beta_participants')
    .select('id, user_id, status')
    .eq('cohort_id', cohort.id)
    .not('user_id', 'is', null)
    .in('status', ['registered', 'onboarding', 'active', 'completed'])
  : { data: [] };

const activeParticipants = (participants || []).length;

const { data: messages } = await admin
  .from('beta_email_messages')
  .select('trigger_key, status, sent_at, created_at, participant_id');

const rows = messages || [];
const countStatus = (st) => rows.filter((r) => r.status === st).length;
const countTrigger = (tk) => rows.filter((r) => r.trigger_key === tk).length;
const sent24h = rows.filter((r) => r.status === 'sent' && r.sent_at && r.sent_at >= since24h).length;
const sent7d = rows.filter((r) => r.status === 'sent' && r.sent_at && r.sent_at >= since7d).length;

const participantIdsWithSent = new Set(rows.filter((r) => r.status === 'sent').map((r) => r.participant_id));
const noEmailSent = activeParticipants - participantIdsWithSent.size;

let recommendation = 'NO ACTION';
if (!automationEnabled) recommendation = 'AUTOMATION DISABLED';
else if (cohort?.status === 'paused') recommendation = 'COHORT PAUSED';
else if (countStatus('failed') > 0) recommendation = 'REVIEW FAILED EMAIL';
else if (countStatus('queued') > 10) recommendation = 'REVIEW QUEUE BACKLOG';

console.log('# BETA EMAIL AUTOMATION REPORT');
console.log(`generated_at: ${new Date().toISOString()}`);
console.log(`automation_enabled: ${automationEnabled}`);
console.log(`cohort: START-C1 (${cohort?.status || 'missing'})`);
console.log('');
console.log('Participants:');
console.log(`  active: ${activeParticipants}`);
console.log(`  with no email sent: ${Math.max(0, noEmailSent)}`);
console.log('');
console.log('Queue status:');
console.log(`  queued: ${countStatus('queued')}`);
console.log(`  processing: ${countStatus('processing')}`);
console.log(`  sent: ${countStatus('sent')}`);
console.log(`  failed: ${countStatus('failed')}`);
console.log(`  skipped: ${countStatus('skipped')}`);
console.log(`  canceled: ${countStatus('canceled')}`);
console.log('');
console.log('Delivery window:');
console.log(`  sent last 24h: ${sent24h}`);
console.log(`  sent last 7d: ${sent7d}`);
console.log('');
console.log('Trigger breakdown:');
console.log(`  welcome: ${countTrigger('beta_welcome')}`);
console.log(`  plan ready: ${countTrigger('beta_plan_ready')}`);
console.log(`  plan reminder: ${countTrigger('beta_no_plan_view_24h')}`);
console.log(`  action reminder: ${countTrigger('beta_no_first_action_48h')}`);
console.log(`  day 3 feedback: ${countTrigger('beta_day3_feedback')}`);
console.log(`  day 7 feedback: ${countTrigger('beta_day7_feedback')}`);
console.log('');
console.log('Recommendation:');
console.log(`  ${recommendation}`);
