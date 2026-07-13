#!/usr/bin/env node
/**
 * Ověření /api/beta-feedback.
 * npm run verify:beta-feedback
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
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const anon = await fetch(`${BASE}/api/beta-feedback`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ context: 'general', score: 3 }),
});
check('unauthenticated rejected', anon.status === 401);

const email = `info+stripe-preview-${Date.now()}@bodyandmindon.cz`;
const password = randomBytes(18).toString('base64url');
const { data: created } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
  app_metadata: { synthetic_test_user: true },
});
const uid = created.user.id;
const { data: signIn } = await admin.auth.signInWithPassword({ email, password });
const token = signIn.session.access_token;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const badCat = await fetch(`${BASE}/api/beta-feedback`, {
  method: 'POST', headers,
  body: JSON.stringify({ context: 'general', score: 3, category: 'invalid_cat' }),
});
check('invalid category rejected', badCat.status === 400);

const longMsg = 'x'.repeat(1001);
const longRes = await fetch(`${BASE}/api/beta-feedback`, {
  method: 'POST', headers,
  body: JSON.stringify({ context: 'daily_use', score: 4, message: longMsg }),
});
check('long message rejected', longRes.status === 400);

const ok = await fetch(`${BASE}/api/beta-feedback`, {
  method: 'POST', headers,
  body: JSON.stringify({ context: 'daily_use', score: 5, category: 'useful', message: 'Beta test feedback' }),
});
check('valid feedback accepted', ok.status === 200);

const { data: evRows } = await admin
  .from('product_events')
  .select('properties')
  .eq('user_id', uid)
  .eq('event_name', 'feedback_submitted');
const hasMessageInEvent = (evRows || []).some((r) => JSON.stringify(r.properties || {}).includes('Beta test'));
check('feedback message not in product_events', !hasMessageInEvent);

await admin.from('beta_feedback').delete().eq('user_id', uid);
await admin.from('product_events').delete().eq('user_id', uid);
await admin.auth.admin.deleteUser(uid);
check('cleanup', true);

console.log(failed === 0 ? 'ALL CHECKS PASS' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
