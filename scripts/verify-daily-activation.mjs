#!/usr/bin/env node
/**
 * Ověření daily activation + check-in API.
 * npm run verify:daily-activation
 */
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);
const BASE = String(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let failed = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

const admin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const email = `info+stripe-preview-${Date.now()}@bodyandmindon.cz`;
const password = randomBytes(18).toString('base64url');
const { data: created } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
  app_metadata: { synthetic_test_user: true },
});
const uid = created.user.id;
const now = new Date().toISOString();
await admin.from('memberships').upsert({
  user_id: uid, tier: 'START', status: 'trial',
  started_at: now, trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), updated_at: now,
});
const { data: signIn } = await admin.auth.signInWithPassword({ email, password });
const token = signIn.session.access_token;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const complete1 = await fetch(`${BASE}/api/daily-activation`, {
  method: 'POST', headers,
  body: JSON.stringify({ activity_type: 'meal', activity_key: 'breakfast', plan_day: 0 }),
});
check('meal complete', complete1.status === 200);

const complete2 = await fetch(`${BASE}/api/daily-activation`, {
  method: 'POST', headers,
  body: JSON.stringify({ activity_type: 'meal', activity_key: 'breakfast', plan_day: 0 }),
});
check('idempotent meal complete', complete2.status === 200);

const uncomplete = await fetch(`${BASE}/api/daily-activation`, {
  method: 'POST', headers,
  body: JSON.stringify({ action: 'uncomplete', activity_type: 'meal', activity_key: 'breakfast', plan_day: 0 }),
});
check('uncomplete meal', uncomplete.status === 200);

const habitRejected = await fetch(`${BASE}/api/daily-activation`, {
  method: 'POST', headers,
  body: JSON.stringify({ activity_type: 'habit', activity_key: 'training', plan_day: 0 }),
});
const habitJson = await habitRejected.json().catch(() => ({}));
check('habit write rejected', habitRejected.status === 400 && String(habitJson.error || '').includes('habit_logs'));

const checkin1 = await fetch(`${BASE}/api/daily-checkin`, {
  method: 'POST', headers, body: JSON.stringify({ rating: 'good' }),
});
check('daily check-in save', checkin1.status === 200);

const checkin2 = await fetch(`${BASE}/api/daily-checkin`, {
  method: 'POST', headers, body: JSON.stringify({ rating: 'great', blocker: 'no_time' }),
});
check('daily check-in update', checkin2.status === 200);

const { count } = await admin.from('daily_checkins').select('id', { count: 'exact', head: true }).eq('user_id', uid);
check('one check-in per day', count === 1);

await admin.from('daily_activity_completions').delete().eq('user_id', uid);
await admin.from('daily_checkins').delete().eq('user_id', uid);
await admin.from('memberships').delete().eq('user_id', uid);
await admin.auth.admin.deleteUser(uid);
check('cleanup', true);

console.log(failed === 0 ? 'ALL CHECKS PASS' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
