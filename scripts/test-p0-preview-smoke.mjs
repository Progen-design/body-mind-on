#!/usr/bin/env node
/**
 * P0 preview smoke: T4, T8, T9, T13 proti dev preview deployment.
 *
 *   BASE_URL=https://xxx.vercel.app \
 *   SUPABASE_DEV_URL=https://qfufvsyhlbximanxayci.supabase.co \
 *   SUPABASE_DEV_SERVICE_ROLE_KEY=eyJ... \
 *   TRAINER_EMAIL=info@bodyandmindon.cz \
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   STRIPE_WEBHOOK_SECRET=whsec_... \
 *   node scripts/test-p0-preview-smoke.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

for (const f of ['.env.local', '.env.preview', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const DEV_URL = process.env.SUPABASE_DEV_URL || 'https://qfufvsyhlbximanxayci.supabase.co';
const DEV_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const TRAINER_EMAIL = (process.env.TRAINER_EMAIL || 'info@bodyandmindon.cz').toLowerCase().trim();
const DEV_REF = 'qfufvsyhlbximanxayci';

const results = { T4: null, T8: null, T9: null, T13: null, verify: null };

function fail(code, msg) {
  results[code] = { pass: false, error: msg };
  console.error(`[${code}] FAIL:`, msg);
}

function pass(code, detail) {
  results[code] = { pass: true, ...detail };
  console.log(`[${code}] PASS`, detail?.summary || '');
}

if (!BASE_URL) {
  console.error('Chybí BASE_URL (preview deployment URL)');
  process.exit(1);
}
if (!DEV_KEY) {
  console.error('Chybí SUPABASE_DEV_SERVICE_ROLE_KEY');
  process.exit(1);
}

const devSb = createClient(DEV_URL, DEV_KEY, { auth: { persistSession: false } });

async function verifyPreviewDbTarget() {
  const res = await fetch(`${BASE_URL}/api/integrations-status`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`integrations-status ${res.status}`);
  if (body.supabase_project_ref !== DEV_REF) {
    throw new Error(`Preview ukazuje na ${body.supabase_project_ref}, očekáván ${DEV_REF}`);
  }
  return body;
}

async function getTrainerToken() {
  const password = `P0Trainer!${Date.now().toString(36)}Aa1`;
  const { data: list } = await devSb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let trainer = (list?.users || []).find((u) => (u.email || '').toLowerCase() === TRAINER_EMAIL);
  if (!trainer) {
    const { data, error } = await devSb.auth.admin.createUser({
      email: TRAINER_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { name: 'P0 Trainer Test' },
    });
    if (error) throw new Error(`create trainer: ${error.message}`);
    trainer = data.user;
  } else {
    const { error } = await devSb.auth.admin.updateUserById(trainer.id, { password });
    if (error) throw new Error(`reset trainer password: ${error.message}`);
  }
  const { data: signIn, error: signErr } = await devSb.auth.signInWithPassword({
    email: TRAINER_EMAIL,
    password,
  });
  if (signErr || !signIn?.session?.access_token) throw new Error(`trainer sign-in: ${signErr?.message || 'no token'}`);
  return signIn.session.access_token;
}

async function testT4() {
  try {
    const token = await getTrainerToken();
    const res = await fetch(`${BASE_URL}/api/trainer/clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
    pass('T4', { summary: `200, clients=${(body.clients || []).length}` });
  } catch (e) {
    fail('T4', e.message);
  }
}

async function testT8() {
  const payloadPath = join(__dirname, 'smoke-test-payload.json');
  const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
  payload.email = `p0-preview-${Date.now()}@example.com`;
  payload.password = 'P0TestPass1!';
  try {
    const res = await fetch(`${BASE_URL}/api/body-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.ok || (res.status === 503 && body.hasUserId);
    if (!ok) throw new Error(`HTTP ${res.status}: ${body.error || body.message || JSON.stringify(body)}`);

    const email = payload.email.toLowerCase();
    await new Promise((r) => setTimeout(r, 3000));
    const { data: metrics } = await devSb.from('body_metrics').select('user_id').eq('email', email).maybeSingle();
    if (!metrics?.user_id) throw new Error('body_metrics chybí');
    const uid = metrics.user_id;

    const checks = {};
    const { data: membership } = await devSb.from('memberships').select('tier, status').eq('user_id', uid).maybeSingle();
    checks.membership = membership;
    const { data: task } = await devSb.from('ai_tasks').select('id, status, task_type').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
    checks.ai_task = task;
    const { data: plan } = await devSb.from('ai_generated_plans').select('id, is_active, structured_plan_json, meal_plan, workout_plan').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
    checks.plan = plan ? { id: plan.id, is_active: plan.is_active, has_meals: !!(plan.meal_plan || plan.structured_plan_json?.days), has_workout: !!(plan.workout_plan || plan.structured_plan_json?.days) } : null;
    const { data: profile } = await devSb.from('profiles').select('id').eq('id', uid).maybeSingle();
    checks.profile = profile;

    const { data: signInData, error: signInErr } = await devSb.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });
    if (signInErr) checks.profile_api = `sign-in failed: ${signInErr.message}`;
    else {
      const profileRes = await fetch(`${BASE_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${signInData.session.access_token}` },
      });
      checks.profile_api = profileRes.status;
    }

    pass('T8', {
      summary: `registrace OK, user=${uid}`,
      checks,
      registration: { status: res.status, plan_state: body.plan_state, planSent: body.planSent, emailSent: body.emailSent, emailError: body.emailError },
    });
    return { uid, email: payload.email };
  } catch (e) {
    fail('T8', e.message);
    return null;
  }
}

async function testT9(userInfo) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !whSecret) {
    fail('T9', 'Chybí STRIPE_SECRET_KEY nebo STRIPE_WEBHOOK_SECRET');
    return;
  }
  if (!userInfo?.uid) {
    fail('T9', 'Chybí user_id z T8');
    return;
  }
  try {
    const stripe = new Stripe(stripeKey);
    const eventPayload = {
      id: `evt_p0_test_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_p0_test_${Date.now()}`,
          object: 'checkout.session',
          client_reference_id: userInfo.uid,
          customer_email: userInfo.email,
          customer: 'cus_p0_test',
          subscription: 'sub_p0_test',
        },
      },
    };
    const payload = JSON.stringify(eventPayload);
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: whSecret });
    const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
      body: payload,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    const { data: membership } = await devSb.from('memberships').select('status, tier').eq('user_id', userInfo.uid).maybeSingle();
    if (membership?.status !== 'active') throw new Error(`membership status=${membership?.status}`);
    pass('T9', { summary: 'webhook OK, membership active', membership });
  } catch (e) {
    fail('T9', e.message);
  }
}

async function testT13() {
  try {
    const status = await verifyPreviewDbTarget();
    const community = await fetch(`${BASE_URL}/api/community`);
    const commStatus = community.status;
    pass('T13', {
      summary: `integrations OK, community HTTP ${commStatus}`,
      supabase_project_ref: status.supabase_project_ref,
      ready: status.ready,
    });
  } catch (e) {
    fail('T13', e.message);
  }
}

console.log('BASE_URL:', BASE_URL);
console.log('DEV DB:', DEV_REF);

try {
  results.verify = await verifyPreviewDbTarget();
  console.log('Preview DB ref OK:', results.verify.supabase_project_ref);
} catch (e) {
  console.error('Preview DB verify FAIL:', e.message);
  process.exit(1);
}

await testT4();
const userInfo = await testT8();
await testT9(userInfo);
await testT13();

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(results, null, 2));
const allPass = ['T4', 'T8', 'T9', 'T13'].every((k) => results[k]?.pass);
process.exit(allPass ? 0 : 1);
