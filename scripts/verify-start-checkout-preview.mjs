#!/usr/bin/env node
/**
 * Ověří START checkout na preview/production BASE_URL (Stripe test mode).
 * Vždy uklidí syntetického test uživatele vytvořeného v tomto běhu.
 *
 *   BASE_URL=https://app.bodyandmindon.cz npm run verify:start-checkout-preview
 *
 * Volitelně ponechat uživatele (jen s ALLOW_KEEP_STRIPE_TEST_USER=yes):
 *   --keep-test-user
 */
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  TEST_ORIGIN,
  loadStripeTestEnv,
  createSyntheticStripeTestUser,
  upsertStartTrialMembership,
  cleanupRunResources,
  aggregateStripePreviewCounts,
  assertCheckoutTestUrl,
  checkoutModeFromUrl,
} from './lib/syntheticStripeTestUser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
loadStripeTestEnv(root);

const BASE = String(process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '').replace(/\?.*$/, '');
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const keepFlag = process.argv.includes('--keep-test-user');
const allowKeep = String(process.env.ALLOW_KEEP_STRIPE_TEST_USER || '').toLowerCase() === 'yes';

if (!supabaseUrl || !serviceKey) {
  console.error('FAIL missing Supabase env');
  process.exit(1);
}

if (keepFlag && !allowKeep) {
  console.error('FAIL --keep-test-user requires ALLOW_KEEP_STRIPE_TEST_USER=yes');
  process.exit(1);
}

function quoteShellArg(s) {
  const str = String(s);
  if (process.platform === 'win32') return `"${str.replace(/"/g, '""')}"`;
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

function sanitizeErrorBody(body) {
  if (!body || typeof body !== 'object') return '(no details)';
  if (body.error) return String(body.error);
  if (body.message) return String(body.message);
  return '(error response)';
}

function vercelCurlPost(path, { headers = {}, body } = {}) {
  const curlArgs = ['-X', 'POST', '--max-time', '60', '-H', 'Content-Type: application/json'];
  for (const [k, v] of Object.entries(headers)) curlArgs.push('-H', `${k}: ${String(v)}`);
  if (body != null) curlArgs.push('-d', JSON.stringify(body));
  const cmd = [
    'npx', 'vercel', 'curl', quoteShellArg(path),
    '--deployment', quoteShellArg(BASE), '--yes', '--',
    ...curlArgs.map(quoteShellArg),
  ].join(' ');
  const childEnv = { ...process.env };
  delete childEnv.VERCEL_PROJECT_ID;
  delete childEnv.VERCEL_ORG_ID;
  const r = spawnSync(cmd, { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 10 * 1024 * 1024, env: childEnv });
  const out = (r.stdout || '') + (r.stderr || '');
  const jsonMatches = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < out.length; j++) {
      if (out[j] === '{') depth++;
      else if (out[j] === '}') depth--;
      if (depth === 0) {
        try { jsonMatches.push(JSON.parse(out.slice(i, j + 1))); } catch { /* ignore */ }
        break;
      }
    }
  }
  let parsed = jsonMatches[jsonMatches.length - 1] || {};
  for (let i = jsonMatches.length - 1; i >= 0; i--) {
    if (jsonMatches[i]?.url || jsonMatches[i]?.error) {
      parsed = jsonMatches[i];
      break;
    }
  }
  const statusMatch = [...out.matchAll(/HTTP\/[\d.]+\s+(\d{3})/g)].pop();
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;
  const effectiveStatus = parsed?.url ? 200 : (httpStatus || (r.status || 500));
  return { status: effectiveStatus, body: parsed };
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** @type {{ userId: string|null, stripeCustomerId: null, stripeSubscriptionId: null, membershipCreated: boolean }} */
const run = {
  userId: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  membershipCreated: false,
};

let cleanupDone = false;
let cleanupResult = 'SKIPPED';
let testPassed = false;
let exitCode = 1;

async function doCleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  cleanupResult = await cleanupRunResources({
    admin,
    run,
    keepUser: keepFlag && allowKeep,
  });
}

async function handleShutdown() {
  await doCleanup();
  if (!testPassed && cleanupResult === 'FAIL') {
    console.error('WARN cleanup incomplete');
    process.exit(2);
  }
  process.exit(exitCode);
}

process.once('SIGINT', () => { handleShutdown(); });
process.once('SIGTERM', () => { handleShutdown(); });
process.once('uncaughtException', async () => {
  await doCleanup();
  console.error('FAIL uncaught exception');
  process.exit(2);
});

let countsBefore = { authCount: 0, membershipCount: 0 };

try {
  countsBefore = await aggregateStripePreviewCounts(admin);

  const created = await createSyntheticStripeTestUser(admin, { testOrigin: TEST_ORIGIN });
  run.userId = created.userId;

  await upsertStartTrialMembership(admin, run.userId);
  run.membershipCreated = true;

  const { data: signIn, error: signErr } = await admin.auth.signInWithPassword({
    email: created.email,
    password: created.password,
  });
  const accessToken = signIn?.session?.access_token || null;
  if (!accessToken) {
    throw new Error(signErr?.message || 'sign-in failed');
  }

  const { status, body } = vercelCurlPost('/api/stripe/create-checkout-session', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { tier: 'START' },
  });

  if (status !== 200) {
    throw new Error(`checkout HTTP ${status}: ${sanitizeErrorBody(body)}`);
  }

  const mode = assertCheckoutTestUrl(body.url);
  if (mode === 'live') {
    throw new Error('Live Checkout Session — STOP');
  }

  testPassed = true;
  exitCode = 0;

  console.log('PASS START checkout verifier');
  console.log(`HTTP status: ${status}`);
  console.log('Checkout host: checkout.stripe.com');
  console.log(`Mode: ${mode}`);
  console.log('Session created: yes');
} catch (err) {
  console.error('FAIL', err?.message || err);
  testPassed = false;
  exitCode = 1;
} finally {
  await doCleanup();
  console.log(`Cleanup: ${cleanupResult}`);

  if (testPassed && cleanupResult === 'FAIL') {
    console.error('WARN cleanup incomplete');
    exitCode = 2;
  }

  try {
    const countsAfter = await aggregateStripePreviewCounts(admin);
    if (countsAfter.authCount > countsBefore.authCount && !(keepFlag && allowKeep)) {
      console.error('WARN stripe-preview auth count increased');
      exitCode = Math.max(exitCode, 2);
    }
  } catch {
    /* ignore aggregate errors on exit */
  }
}

process.exit(exitCode);
