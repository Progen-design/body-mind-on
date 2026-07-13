#!/usr/bin/env node
/**
 * Closed beta cohort report with GO/FIX/STOP decision gate.
 * npm run report:beta-cohort -- --cohort=START-C1
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg.startsWith('--cohort=')) out.cohort = arg.slice(9);
  }
  return out;
}

const cohortCode = String(parseArgs(process.argv.slice(2)).cohort || 'START-C1').trim().toUpperCase();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('FAIL SUPABASE env required');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: cohort } = await admin.from('beta_cohorts').select('*').eq('code', cohortCode).maybeSingle();
if (!cohort?.id) {
  console.error(`FAIL cohort ${cohortCode} not found`);
  process.exit(1);
}

const { data: participants } = await admin
  .from('beta_participants')
  .select('internal_alias, status, invited_at, registered_at, onboarding_completed_at, first_plan_viewed_at, first_action_at, first_return_at, session_completed_at, exited_at, user_id, source, invite_code_hash')
  .eq('cohort_id', cohort.id)
  .order('internal_alias', { ascending: true });

const rows = participants || [];
const alias = (p) => p.internal_alias || 'C1-P??';
const countWhere = (fn) => rows.filter(fn).length;

const inviteSlots = countWhere((p) => p.invite_code_hash);
const directJoins = countWhere((p) => p.source === 'direct_beta_link' && p.registered_at);
const registered = countWhere((p) => p.registered_at);
const onboardingCompleted = countWhere((p) => p.onboarding_completed_at);
const planViewed = countWhere((p) => p.first_plan_viewed_at);
const firstAction = countWhere((p) => p.first_action_at);
const returned = countWhere((p) => p.first_return_at);
const sessionCompleted = countWhere((p) => p.session_completed_at);
const dropped = countWhere((p) => ['dropped', 'excluded'].includes(p.status));

const userIds = rows.map((p) => p.user_id).filter(Boolean);
let meals = 0; let workouts = 0; let habits = 0; let checkins = 0; let feedbackCount = 0; let feedbackAvg = null;

if (userIds.length) {
  const { count: mc } = await admin.from('daily_activity_completions').select('id', { count: 'exact', head: true }).in('user_id', userIds).eq('activity_type', 'meal');
  const { count: wc } = await admin.from('daily_activity_completions').select('id', { count: 'exact', head: true }).in('user_id', userIds).eq('activity_type', 'workout');
  const { count: hc } = await admin.from('daily_activity_completions').select('id', { count: 'exact', head: true }).in('user_id', userIds).eq('activity_type', 'habit');
  const { count: cc } = await admin.from('daily_checkins').select('id', { count: 'exact', head: true }).in('user_id', userIds);
  const { data: fb } = await admin.from('beta_feedback').select('score').in('user_id', userIds);
  meals = mc || 0; workouts = wc || 0; habits = hc || 0; checkins = cc || 0;
  feedbackCount = (fb || []).length;
  if (feedbackCount) {
    feedbackAvg = ((fb || []).reduce((s, r) => s + Number(r.score || 0), 0) / feedbackCount).toFixed(1);
  }
}

const { data: sessions } = await admin
  .from('beta_research_sessions')
  .select('status, participant_id')
  .in('participant_id', rows.map((p) => p.id));

const sessionsCompleted = (sessions || []).filter((s) => s.status === 'completed').length;

const { data: issues } = await admin.from('beta_issues').select('severity, status, category').eq('cohort_id', cohort.id);
const issueRows = issues || [];
const blockersOpen = issueRows.filter((i) => i.severity === 'blocker' && ['open', 'investigating', 'planned'].includes(i.status));
const highOpen = issueRows.filter((i) => i.severity === 'high' && ['open', 'investigating', 'planned'].includes(i.status));

function pct(a, b) {
  if (!b) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

let decision = 'FIX BEFORE COHORT 2';
if (
  onboardingCompleted >= 4
  && planViewed >= 4
  && firstAction >= 3
  && returned >= 2
  && blockersOpen.length === 0
) {
  decision = 'GO TO COHORT 2';
}
if (
  planViewed < 3
  || blockersOpen.length > 0
  || issueRows.some((i) => ['technical', 'trust'].includes(i.category) && i.severity === 'blocker')
) {
  if (planViewed < 3 || blockersOpen.length > 1) decision = 'STOP AND REWORK';
}

console.log(`# ${cohortCode} COHORT REPORT`);
console.log('');
console.log('Participants:');
console.log(`  invite slots (historical): ${inviteSlots}`);
console.log(`  direct beta joins: ${directJoins}`);
console.log(`  registered: ${registered}`);
console.log(`  onboarding completed: ${onboardingCompleted}`);
console.log(`  plan viewed: ${planViewed}`);
console.log(`  first meaningful action: ${firstAction}`);
console.log(`  returned another day: ${returned}`);
console.log(`  session completed: ${sessionCompleted}`);
console.log(`  dropped: ${dropped}`);
console.log('');
console.log('Funnel:');
console.log(`  beta_page → registration: ${registered} users`);
console.log(`  registration → onboarding: ${pct(onboardingCompleted, registered)}`);
console.log(`  onboarding → plan: ${pct(planViewed, onboardingCompleted)}`);
console.log(`  plan → first action: ${pct(firstAction, planViewed)}`);
console.log(`  first action → return: ${pct(returned, firstAction)}`);
console.log('');
console.log('Product usage:');
console.log(`  meals completed: ${meals}`);
console.log(`  workouts completed: ${workouts}`);
console.log(`  habits completed: ${habits}`);
console.log(`  check-ins: ${checkins}`);
console.log(`  feedback count: ${feedbackCount}`);
console.log(`  feedback average: ${feedbackAvg ?? 'n/a'}`);
console.log('');
console.log('Research:');
console.log(`  sessions completed: ${sessionsCompleted}`);
console.log('');
console.log('Issues:');
console.log(`  blocker open: ${blockersOpen.length}`);
console.log(`  high open: ${highOpen.length}`);
console.log(`  medium: ${issueRows.filter((i) => i.severity === 'medium').length}`);
console.log(`  low: ${issueRows.filter((i) => i.severity === 'low').length}`);
console.log(`  fixed: ${issueRows.filter((i) => i.status === 'fixed').length}`);
console.log(`  accepted: ${issueRows.filter((i) => i.status === 'accepted').length}`);
console.log('');
console.log('Participant aliases (milestones only):');
for (const p of rows) {
  console.log(`  ${alias(p)}: reg=${!!p.registered_at} onboard=${!!p.onboarding_completed_at} plan=${!!p.first_plan_viewed_at} action=${!!p.first_action_at} return=${!!p.first_return_at}`);
}
console.log('');
console.log('Decision:');
console.log(`  ${decision}`);
