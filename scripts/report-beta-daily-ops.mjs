#!/usr/bin/env node
/**
 * Daily beta operations report (no PII).
 * npm run report:beta-daily
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

const cohortCode = process.argv.find((a) => a.startsWith('--cohort='))?.slice(9)?.trim().toUpperCase() || 'START-C1';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('FAIL SUPABASE env required');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const { data: cohort } = await admin.from('beta_cohorts').select('*').eq('code', cohortCode).maybeSingle();
if (!cohort?.id) {
  console.error(`FAIL cohort ${cohortCode} not found`);
  process.exit(1);
}

const { data: participants } = await admin
  .from('beta_participants')
  .select('id, internal_alias, status, registered_at, onboarding_completed_at, first_plan_viewed_at, first_action_at, first_return_at, user_id, updated_at')
  .eq('cohort_id', cohort.id);

const rows = participants || [];
const byStatus = rows.reduce((acc, p) => {
  acc[p.status] = (acc[p.status] || 0) + 1;
  return acc;
}, {});

const newOnboarding = rows.filter((p) => p.onboarding_completed_at && p.onboarding_completed_at >= since).length;
const newPlan = rows.filter((p) => p.first_plan_viewed_at && p.first_plan_viewed_at >= since).length;
const newAction = rows.filter((p) => p.first_action_at && p.first_action_at >= since).length;
const newReturn = rows.filter((p) => p.first_return_at && p.first_return_at >= since).length;

const userIds = rows.map((p) => p.user_id).filter(Boolean);
let newFeedback = 0;
if (userIds.length) {
  const { count } = await admin.from('beta_feedback').select('id', { count: 'exact', head: true }).in('user_id', userIds).gte('created_at', since);
  newFeedback = count || 0;
}

const { data: newIssues } = await admin
  .from('beta_issues')
  .select('severity, title')
  .eq('cohort_id', cohort.id)
  .gte('created_at', since)
  .in('severity', ['blocker', 'high']);

let planGenFailures = 0;
if (userIds.length) {
  const { count } = await admin
    .from('product_events')
    .select('id', { count: 'exact', head: true })
    .in('user_id', userIds)
    .eq('event_name', 'plan_generation_failed')
    .gte('created_at', since);
  planGenFailures = count || 0;
}

const recommendations = [];
if ((newIssues || []).some((i) => i.severity === 'blocker')) recommendations.push('FIX BLOCKER');
if (newOnboarding === 0 && rows.filter((p) => p.status === 'registered').length > 0) recommendations.push('CONTACT PARTICIPANT');
if (newPlan === 0 && newOnboarding > 0) recommendations.push('REVIEW PLAN QUALITY');
if (newFeedback > 0) recommendations.push('REVIEW FEEDBACK');
if (!recommendations.length) recommendations.push('NO ACTION');

console.log('# BETA DAILY OPS REPORT');
console.log(`cohort: ${cohortCode}`);
console.log(`status: ${cohort.status}`);
console.log(`generated_at: ${new Date().toISOString()}`);
console.log('');
console.log('Participants by status:');
for (const [st, n] of Object.entries(byStatus)) console.log(`  ${st}: ${n}`);
console.log('');
console.log('Last 24h:');
console.log(`  new onboarding completions: ${newOnboarding}`);
console.log(`  new plan views: ${newPlan}`);
console.log(`  new first actions: ${newAction}`);
console.log(`  new returns: ${newReturn}`);
console.log(`  new feedback: ${newFeedback}`);
console.log(`  new blocker/high issues: ${(newIssues || []).length}`);
console.log(`  plan generation failures: ${planGenFailures}`);

let emailQueued = 0;
let emailFailed = 0;
let emailAutomationEnabled = String(process.env.BETA_EMAIL_AUTOMATION_ENABLED || '').trim().toLowerCase() === 'true';
const participantIds = rows.map((p) => p.id);
if (participantIds.length) {
  const { count: qc } = await admin.from('beta_email_messages').select('id', { count: 'exact', head: true }).in('participant_id', participantIds).eq('status', 'queued');
  const { count: fc } = await admin.from('beta_email_messages').select('id', { count: 'exact', head: true }).in('participant_id', participantIds).eq('status', 'failed');
  emailQueued = qc || 0;
  emailFailed = fc || 0;
}

console.log('');
console.log('Email automation:');
console.log(`  enabled: ${emailAutomationEnabled}`);
console.log(`  queued: ${emailQueued}`);
console.log(`  failed: ${emailFailed}`);
if (!emailAutomationEnabled) recommendations.push('AUTOMATION DISABLED');
else if (emailFailed > 0) recommendations.push('REVIEW FAILED EMAIL');
console.log('');
console.log('Recommendation:');
console.log(`  ${recommendations[0]}`);
