#!/usr/bin/env node
/**
 * Agregovaný beta activation report — bez PII.
 * npm run report:beta-activation
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { classifyBetaUser } from '../lib/betaUserClassification.js';

loadLocalEnv();

const admin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const MEANINGFUL_EVENTS = new Set([
  'meal_completed', 'workout_completed', 'habit_completed', 'meal_replaced', 'daily_checkin_completed',
]);

function windowStart(days) {
  if (!days) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

async function loadUsers() {
  const map = new Map();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data?.users || []) {
      map.set(u.id, classifyBetaUser(u));
    }
    if ((data?.users || []).length < 200) break;
    page += 1;
  }
  return map;
}

async function loadEvents(since) {
  let q = admin.from('product_events').select('user_id, event_name, created_at');
  if (since) q = q.gte('created_at', since);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function uniqueUsers(events, names, userClass) {
  const s = new Set();
  for (const e of events) {
    if (!e.user_id) continue;
    if (userClass && userClass.get(e.user_id) !== 'likely_real') continue;
    if (!names.has(e.event_name)) continue;
    s.add(e.user_id);
  }
  return s.size;
}

function reportWindow(label, days) {
  return { label, since: windowStart(days) };
}

const userClass = await loadUsers();
const likelyReal = [...userClass.values()].filter((c) => c === 'likely_real').length;
const synthetic = [...userClass.values()].filter((c) => c === 'synthetic').length;

console.log('BETA ACTIVATION REPORT\n');

for (const w of [reportWindow('last 7 days', 7), reportWindow('last 30 days', 30), reportWindow('all time', null)]) {
  const events = await loadEvents(w.since);
  const realEvents = events.filter((e) => e.user_id && userClass.get(e.user_id) === 'likely_real');

  const onboardingStarted = uniqueUsers(realEvents, new Set(['onboarding_started']), userClass);
  const onboardingCompleted = uniqueUsers(realEvents, new Set(['onboarding_completed']), userClass);
  const plansGenerated = uniqueUsers(realEvents, new Set(['plan_generation_completed']), userClass);
  const plansViewed = uniqueUsers(realEvents, new Set(['plan_viewed']), userClass);
  const firstAction = uniqueUsers(realEvents, MEANINGFUL_EVENTS, userClass);

  const daysByUser = new Map();
  for (const e of realEvents) {
    if (!e.user_id) continue;
    const day = String(e.created_at || '').slice(0, 10);
    if (!daysByUser.has(e.user_id)) daysByUser.set(e.user_id, new Set());
    daysByUser.get(e.user_id).add(day);
  }
  const returnedAnotherDay = [...daysByUser.values()].filter((d) => d.size >= 2).length;

  const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

  console.log(`Data window: ${w.label}`);
  console.log(`- likely real users (total): ${likelyReal}`);
  console.log(`- synthetic users (total): ${synthetic}`);
  console.log(`- onboarding started: ${onboardingStarted}`);
  console.log(`- onboarding completed: ${onboardingCompleted}`);
  console.log(`- onboarding completion rate: ${pct(onboardingCompleted, onboardingStarted)}`);
  console.log(`- plans generated: ${plansGenerated}`);
  console.log(`- plan generation success rate: ${pct(plansGenerated, onboardingCompleted)}`);
  console.log(`- plans viewed: ${plansViewed}`);
  console.log(`- plan view rate: ${pct(plansViewed, plansGenerated)}`);
  console.log(`- first meaningful action users: ${firstAction}`);
  console.log(`- first action rate: ${pct(firstAction, plansViewed)}`);
  console.log(`- users returning on another calendar day: ${returnedAnotherDay}`);
  console.log(`- meals completed (events): ${realEvents.filter((e) => e.event_name === 'meal_completed').length}`);
  console.log(`- workouts completed (events): ${realEvents.filter((e) => e.event_name === 'workout_completed').length}`);
  console.log(`- habits completed (events): ${realEvents.filter((e) => e.event_name === 'habit_completed').length}`);
  console.log(`- daily check-ins (events): ${realEvents.filter((e) => e.event_name === 'daily_checkin_completed').length}`);
  console.log(`- feedback responses (events): ${realEvents.filter((e) => e.event_name === 'feedback_submitted').length}`);
  console.log(`- subscription activated (events): ${realEvents.filter((e) => e.event_name === 'subscription_activated').length}`);
  console.log('');
  console.log('Funnel (likely real):');
  console.log(`  onboarding_started → ${onboardingStarted}`);
  console.log(`  onboarding_completed → ${onboardingCompleted} (${pct(onboardingCompleted, onboardingStarted)} from start)`);
  console.log(`  plan_generation_completed → ${plansGenerated} (${pct(plansGenerated, onboardingStarted)} from start)`);
  console.log(`  plan_viewed → ${plansViewed} (${pct(plansViewed, onboardingStarted)} from start)`);
  console.log(`  first_meaningful_action → ${firstAction} (${pct(firstAction, onboardingStarted)} from start)`);
  console.log(`  returned_another_day → ${returnedAnotherDay} (${pct(returnedAnotherDay, onboardingStarted)} from start)`);
  console.log('');
}

if (likelyReal < 20) {
  console.log('WARN: Small beta sample. Treat percentages as directional only.');
}
