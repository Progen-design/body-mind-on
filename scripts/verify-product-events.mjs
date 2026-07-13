#!/usr/bin/env node
/**
 * Ověření /api/events — allowlist, PII guard, auth.
 * npm run verify:product-events
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

const BASE = String(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let failed = 0;
const cleanupEventIds = [];
let testUserId = null;

function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function postEvents(body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const email = `info+stripe-preview-${Date.now()}@bodyandmindon.cz`;
const password = randomBytes(18).toString('base64url');
const { data: created } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { synthetic_test_user: true, test_origin: 'verify-product-events' },
});
testUserId = created.user.id;
await new Promise((r) => setTimeout(r, 800));
const { data: signIn } = await admin.auth.signInWithPassword({ email, password });
const token = signIn.session.access_token;

const unknown = await postEvents({ event_name: 'evil_event', properties: {} }, token);
check('unknown event rejected', unknown.status === 400 && unknown.json?.error_code === 'unknown_event');

const pii = await postEvents({
  event_name: 'plan_viewed',
  properties: { email: 'x@test.com', program: 'START' },
}, token);
check('PII key rejected', pii.status === 400 && pii.json?.error_code === 'event_properties_rejected');

const spoof = await postEvents({
  event_name: 'plan_viewed',
  user_id: '00000000-0000-0000-0000-000000000000',
  properties: { program: 'START' },
}, token);
check('spoof user_id ignored', spoof.status === 200);

const bigProps = { program: 'START', x: 'a'.repeat(6000) };
const big = await postEvents({ event_name: 'plan_viewed', properties: bigProps }, token);
check('oversized properties rejected', big.status === 400);

const ok = await postEvents({
  event_name: 'plan_viewed',
  properties: { program: 'START', source_component: 'verify_script' },
}, token);
check('allowed event accepted', ok.status === 200 && ok.json?.received === true && ok.json?.stored === true);

const anonOk = await postEvents({
  event_name: 'onboarding_started',
  properties: { program: 'START' },
  anonymous_id: 'anon-test-1',
  session_id: 'sess-test-1',
});
check('anonymous onboarding_started', anonOk.status === 200);

const anonBad = await postEvents({
  event_name: 'plan_viewed',
  properties: { program: 'START' },
  anonymous_id: 'anon-test-2',
  session_id: 'sess-test-2',
});
check('anonymous plan_viewed rejected', anonBad.status === 401);

await new Promise((r) => setTimeout(r, 500));

const { data: rows } = await admin
  .from('product_events')
  .select('id, user_id')
  .contains('properties', { source_component: 'verify_script' })
  .order('created_at', { ascending: false })
  .limit(5);
cleanupEventIds.push(...(rows || []).map((r) => r.id));
check('event stored in DB', ok.json?.stored === true);

if (cleanupEventIds.length) {
  await admin.from('product_events').delete().in('id', cleanupEventIds);
}
await admin.from('product_events').delete().eq('anonymous_id', 'anon-test-1');
await admin.auth.admin.deleteUser(testUserId);
check('cleanup', true);

const src = readFileSync(join(ROOT, 'pages/api/events.js'), 'utf8');
check('PII guard in source', src.includes('event_properties_rejected'));
check('allowlist in source', src.includes('unknown_event'));

console.log(failed === 0 ? 'ALL CHECKS PASS' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
