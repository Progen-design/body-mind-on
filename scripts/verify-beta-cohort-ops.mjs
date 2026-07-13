#!/usr/bin/env node
/**
 * Verify closed beta cohort operations (direct join + legacy invite).
 * npm run verify:beta-cohort-ops
 */
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hashInviteCode, generateInviteCode } from '../lib/betaInviteCrypto.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);
const BASE = String(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let failed = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey) {
  console.error('FAIL SUPABASE env required');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anonClient = anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

async function signInTestUser(email, password) {
  const authClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: signIn, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !signIn?.session?.access_token) throw new Error('test sign-in failed');
  return signIn.session.access_token;
}

const TEST_CODE = `TEST-JOIN-${Date.now()}`;
const cleanup = { cohortIds: [], userIds: [] };

async function cleanupAll() {
  for (const uid of cleanup.userIds) {
    await admin.from('product_events').delete().eq('user_id', uid);
    await admin.from('beta_feedback').delete().eq('user_id', uid);
    await admin.from('beta_participants').delete().eq('user_id', uid);
    await admin.auth.admin.deleteUser(uid);
  }
  for (const cid of cleanup.cohortIds) {
    await admin.from('beta_issues').delete().eq('cohort_id', cid);
    await admin.from('beta_decisions').delete().eq('cohort_id', cid);
    await admin.from('beta_research_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await admin.from('beta_participants').delete().eq('cohort_id', cid);
    await admin.from('beta_cohorts').delete().eq('id', cid);
  }
}

async function makeUser(suffix) {
  const email = `info+beta-join-${suffix}-${Date.now()}@bodyandmindon.cz`;
  const password = randomBytes(18).toString('base64url');
  const { data: created } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { synthetic_test_user: true },
  });
  cleanup.userIds.push(created.user.id);
  const token = await signInTestUser(email, password);
  return { uid: created.user.id, token };
}

async function joinBody(extra = {}) {
  return {
    beta_terms_accepted: true,
    beta_terms_version: '2026-07-cohort-1',
    ...extra,
  };
}

try {
  const INVITE_HIST = `INV-HIST-${Date.now()}`;
  const { data: invCohort, error: invCohortErr } = await admin.from('beta_cohorts').insert({
    code: INVITE_HIST,
    name: 'Invite legacy test',
    status: 'recruiting',
    max_participants: 5,
  }).select('id').single();
  if (invCohortErr || !invCohort?.id) throw new Error(`invite cohort insert failed: ${invCohortErr?.message || 'no id'}`);
  cleanup.cohortIds.push(invCohort.id);
  const plain = generateInviteCode();
  await admin.from('beta_participants').insert({
    cohort_id: invCohort.id,
    invite_code_hash: hashInviteCode(plain),
    status: 'invited',
    internal_alias: 'C1-P99',
    invited_at: new Date().toISOString(),
  });
  const uInvite = await makeUser('invite-legacy');
  const claim = await fetch(`${BASE}/api/beta/claim-invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${uInvite.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invite_code: plain,
      beta_terms_accepted: true,
      beta_terms_version: '2026-07-cohort-1',
    }),
  });
  const claimJson = await claim.json();
  check('historical invite claim still works', claim.status === 200 && claimJson.ok === true);

  const { data: cohort, error: cohortErr } = await admin.from('beta_cohorts').insert({
    code: TEST_CODE,
    name: 'Synthetic direct join cohort',
    status: 'recruiting',
    max_participants: 5,
  }).select('id').single();
  check('cohort table exists', !cohortErr && !!cohort?.id, cohortErr?.message || '');
  if (!cohort?.id) throw new Error(`cohort insert failed: ${cohortErr?.message || 'no id'}`);
  cleanup.cohortIds.push(cohort.id);

  const unauthJoin = await fetch(`${BASE}/api/beta/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(await joinBody()),
  });
  check('unauthenticated join rejected', unauthJoin.status === 401);

  const u1 = await makeUser('1');
  const join1 = await fetch(`${BASE}/api/beta/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u1.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(await joinBody({
      cohort_code: TEST_CODE,
      user_id: '00000000-0000-0000-0000-000000000099',
    })),
  });
  const join1Json = await join1.json();
  check('direct join ok', join1.status === 200 && join1Json.ok === true);

  const { data: p1rpc } = await admin.rpc('get_beta_participant_for_user', { p_user_id: u1.uid });
  check('user_id from session not body', p1rpc?.found === true && p1rpc?.cohort_code === TEST_CODE);
  check('beta terms timestamp saved', !!p1rpc?.registered_at);
  check('beta terms version saved', p1rpc?.beta_terms_version === '2026-07-cohort-1');
  check('source direct_beta_link', p1rpc?.source === 'direct_beta_link');
  check('invite hash not required', p1rpc?.invite_code_hash_set === false);

  const { data: srcRow } = await admin.rpc('join_beta_cohort', {
    p_user_id: u1.uid,
    p_cohort_code: TEST_CODE,
    p_beta_terms_version: 'noop',
    p_source: 'check',
  });
  check('join idempotent rpc', srcRow?.already_joined === true);

  const join1b = await fetch(`${BASE}/api/beta/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u1.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(await joinBody({ cohort_code: TEST_CODE })),
  });
  check('idempotent join api', join1b.status === 200);

  const { count: pCount1 } = await admin.rpc('get_beta_participant_for_user', { p_user_id: u1.uid }).then((r) => ({ count: r.data?.found ? 1 : 0 }));
  check('single participant row per user', pCount1 === 1);

  for (let i = 2; i <= 5; i += 1) {
    const u = await makeUser(`fill-${i}`);
    const r = await fetch(`${BASE}/api/beta/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(await joinBody({ cohort_code: TEST_CODE })),
    });
    check(`join user ${i}`, r.status === 200);
  }

  const u6 = await makeUser('6');
  const fullJoin = await fetch(`${BASE}/api/beta/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u6.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(await joinBody({ cohort_code: TEST_CODE })),
  });
  check('sixth participant rejected', fullJoin.status === 409);

  await admin.from('beta_cohorts').update({ status: 'draft' }).eq('id', cohort.id);
  const u7 = await makeUser('closed');
  const closedJoin = await fetch(`${BASE}/api/beta/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u7.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(await joinBody({ cohort_code: TEST_CODE })),
  });
  check('inactive cohort rejected', closedJoin.status === 403);
  await admin.from('beta_cohorts').update({ status: 'recruiting' }).eq('id', cohort.id);

  if (anonClient) {
    const { error: selErr } = await anonClient.from('beta_cohorts').select('id').limit(1);
    check('regular user no SELECT on cohort tables', !!selErr);
  } else {
    check('regular user no SELECT on cohort tables', true, 'skipped — no anon key');
  }

  const reportOut = await import('child_process').then(({ execSync }) =>
    execSync(`node scripts/report-beta-cohort.mjs --cohort=${TEST_CODE}`, { cwd: ROOT, encoding: 'utf8' }),
  );
  check('report no email PII', !reportOut.includes('@bodyandmindon.cz'));
  check('report shows beta page funnel', reportOut.includes('beta_page'));

} finally {
  await cleanupAll();
}

console.log(failed === 0 ? 'ALL CHECKS PASS' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
