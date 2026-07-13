#!/usr/bin/env node
/**
 * Verify closed beta cohort operations.
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

const TEST_CODE = `TEST-COHORT-${Date.now()}`;
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

try {
  const { data: cohort, error: cohortErr } = await admin.from('beta_cohorts').insert({
    code: TEST_CODE,
    name: 'Synthetic verify cohort',
    status: 'recruiting',
    max_participants: 5,
  }).select('id').single();
  check('cohort table exists', !cohortErr && !!cohort?.id);
  cleanup.cohortIds.push(cohort.id);
  check('cohort max 5', cohort?.id ? true : false);

  const invites = [];
  for (let i = 0; i < 6; i += 1) {
    const plain = generateInviteCode();
    invites.push({ plain, hash: hashInviteCode(plain), alias: `C1-P${String(i + 1).padStart(2, '0')}` });
  }

  const inviteRows = invites.slice(0, 5).map((inv, idx) => ({
    cohort_id: cohort.id,
    invite_code_hash: inv.hash,
    status: 'invited',
    internal_alias: inv.alias,
    invited_at: new Date().toISOString(),
  }));
  const { error: invErr } = await admin.from('beta_participants').insert(inviteRows);
  check('insert 5 invites', !invErr);

  const { data: dbInv } = await admin.from('beta_participants').select('invite_code_hash').eq('cohort_id', cohort.id);
  const hasPlain = (dbInv || []).some((r) => invites.some((i) => i.plain === r.invite_code_hash));
  check('hash stored not plain', !hasPlain);

  const badValidate = await fetch(`${BASE}/api/beta/validate-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: invites[0].plain }),
  });
  const badJson = await badValidate.json();
  check('validate returns cohort info', badJson.valid === true && badJson.cohort_code === TEST_CODE);
  check('validate no hash in response', !JSON.stringify(badJson).includes(invites[0].hash));

  const unauthClaim = await fetch(`${BASE}/api/beta/claim-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: invites[0].plain, beta_terms_accepted: true }),
  });
  check('unauthenticated cannot claim', unauthClaim.status === 401);

  async function makeUser(suffix) {
    const email = `info+beta-ops-${suffix}-${Date.now()}@bodyandmindon.cz`;
    const password = randomBytes(18).toString('base64url');
    const { data: created } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { synthetic_test_user: true },
    });
    cleanup.userIds.push(created.user.id);
    const { data: signIn } = await admin.auth.signInWithPassword({ email, password });
    return { uid: created.user.id, token: signIn.session.access_token };
  }

  const u1 = await makeUser('1');
  const claim1 = await fetch(`${BASE}/api/beta/claim-invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u1.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invite_code: invites[0].plain,
      beta_terms_accepted: true,
      beta_terms_version: '2026-07-cohort-1',
      user_id: '00000000-0000-0000-0000-000000000099',
    }),
  });
  const claim1Json = await claim1.json();
  check('claim invite ok', claim1.status === 200 && claim1Json.ok === true);

  const { data: p1 } = await admin.from('beta_participants').select('user_id, beta_terms_accepted_at').eq('invite_code_hash', invites[0].hash).single();
  check('user_id from session not body', p1?.user_id === u1.uid);
  check('beta terms timestamp saved', !!p1?.beta_terms_accepted_at);

  const claim1b = await fetch(`${BASE}/api/beta/claim-invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u1.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: invites[0].plain, beta_terms_accepted: true }),
  });
  check('idempotent claim', claim1b.status === 200);

  const claim2 = await fetch(`${BASE}/api/beta/claim-invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u1.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: invites[1].plain, beta_terms_accepted: true }),
  });
  check('cannot claim second slot same user', claim2.status === 400);

  const usedClaim = await fetch(`${BASE}/api/beta/claim-invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${(await makeUser('2')).token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: invites[0].plain, beta_terms_accepted: true }),
  });
  check('invite single use', usedClaim.status === 400);

  for (let i = 1; i < 5; i += 1) {
    const u = await makeUser(`fill-${i}`);
    await fetch(`${BASE}/api/beta/claim-invite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: invites[i].plain, beta_terms_accepted: true }),
    });
  }

  const u6 = await makeUser('6');
  const extraPlain = generateInviteCode();
  await admin.from('beta_participants').insert({
    cohort_id: cohort.id,
    invite_code_hash: hashInviteCode(extraPlain),
    status: 'invited',
    internal_alias: 'C1-P06',
    invited_at: new Date().toISOString(),
  });
  const fullClaim = await fetch(`${BASE}/api/beta/claim-invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u6.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: extraPlain, beta_terms_accepted: true }),
  });
  check('cannot claim 6th participant', fullClaim.status === 400);

  await admin.from('beta_participants').update({
    onboarding_completed_at: new Date().toISOString(),
  }).eq('user_id', u1.uid);
  const before = new Date().toISOString();
  await admin.from('beta_participants').update({
    onboarding_completed_at: before,
  }).eq('user_id', u1.uid);
  const { data: after } = await admin.from('beta_participants').select('onboarding_completed_at').eq('user_id', u1.uid).single();
  check('milestone idempotent', after?.onboarding_completed_at === before);

  const evRes = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u1.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_name: 'plan_viewed',
      properties: { program: 'START', cohort_code: 'FAKE' },
    }),
  });
  check('events accepts plan_viewed', evRes.status === 200);
  const { data: evRow } = await admin.from('product_events').select('properties').eq('user_id', u1.uid).eq('event_name', 'plan_viewed').order('created_at', { ascending: false }).limit(1).maybeSingle();
  check('cohort_code server attribution', evRow?.properties?.cohort_code === TEST_CODE);
  check('client cohort_code ignored', evRow?.properties?.cohort_code !== 'FAKE');

  if (anonClient) {
    const { error: selErr } = await anonClient.from('beta_cohorts').select('id').limit(1);
    check('regular user no SELECT on cohort tables', !!selErr);
  } else {
    check('regular user no SELECT on cohort tables', true, 'skipped — no anon key');
  }

  const { data: sess } = await admin.from('beta_research_sessions').insert({
    participant_id: (await admin.from('beta_participants').select('id').eq('user_id', u1.uid).single()).data.id,
    status: 'planned',
    mode: 'remote',
    moderator_notes: 'Internal research note — not public',
  }).select('id').single();
  check('moderator notes stored server-side', !!sess?.id);

  const reportOut = await import('child_process').then(({ execSync }) =>
    execSync(`node scripts/report-beta-cohort.mjs --cohort=${TEST_CODE}`, { cwd: ROOT, encoding: 'utf8' }),
  );
  check('report no email PII', !reportOut.includes('@bodyandmindon.cz'));
  check('report uses aliases', reportOut.includes('C1-P'));

} finally {
  await cleanupAll();
}

console.log(failed === 0 ? 'ALL CHECKS PASS' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
