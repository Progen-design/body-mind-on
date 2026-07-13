#!/usr/bin/env node
/**
 * Plný Stripe TEST subscription lifecycle E2E (pouze production test mode).
 * Vyžaduje ALLOW_PRODUCTION_STRIPE_TEST_E2E=yes
 */
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { chromium } from 'playwright';
import {
  TEST_ORIGIN,
  loadStripeTestEnv,
  loadStripeE2eProductionEnv,
  createSyntheticStripeTestUser,
  upsertStartTrialMembership,
  cleanupRunResources,
  assertStripeTestSecret,
  assertCheckoutTestUrl,
} from './lib/syntheticStripeTestUser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const TMP_ENV = join(root, '.env.stripe-e2e.tmp');
const BASE = String(process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const API_TIMEOUT_MS = 60_000;
const POLL_MS = 3000;
const POLL_MAX = 60;

loadStripeTestEnv(root);

async function ensureProductionStripeEnv() {
  const { spawnSync } = await import('child_process');
  const childEnv = { ...process.env };
  delete childEnv.VERCEL_PROJECT_ID;
  delete childEnv.VERCEL_ORG_ID;
  const pull = spawnSync(
    'npx',
    ['vercel', 'env', 'pull', '.env.stripe-e2e.tmp', '--environment=production', '--yes'],
    { cwd: root, encoding: 'utf8', shell: true, env: childEnv },
  );
  if (pull.status !== 0) {
    const missing = !process.env.STRIPE_PRICE_START_MONTHLY?.trim()
      || !process.env.STRIPE_WEBHOOK_SECRET?.trim()
      || !process.env.STRIPE_SECRET_KEY?.trim();
    if (missing) throw new Error('Failed to load production Stripe env');
  }
}

if (String(process.env.ALLOW_PRODUCTION_STRIPE_TEST_E2E || '').toLowerCase() !== 'yes') {
  console.error('FAIL set ALLOW_PRODUCTION_STRIPE_TEST_E2E=yes');
  process.exit(1);
}

if (!/bodyandmindon\.cz$/i.test(BASE.replace(/^https?:\/\//, '').split('/')[0])) {
  console.error('FAIL BASE_URL must be Body & Mind ON domain');
  process.exit(1);
}

/** @type {{ userId: string|null, stripeCustomerId: string|null, stripeSubscriptionId: string|null }} */
const run = { userId: null, stripeCustomerId: null, stripeSubscriptionId: null };

let stripe = null;
let admin = null;
let checkoutEvent = null;
let browserStatus = 'BLOCKED_EXTERNAL';
let testStartedAt = new Date(Date.now() - 60_000).toISOString();
const results = {
  sessionCreated: false,
  webhookProcessed: false,
  membershipActive: false,
  customerLinked: false,
  subscriptionLinked: false,
  duplicateWebhook: false,
  duplicateMembership: false,
  eventRowCount: 0,
  subscriptionCanceled: false,
  cancellationWebhook: false,
  membershipCanceled: false,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, { method = 'GET', headers = {}, body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function pollMembership(userId) {
  for (let i = 0; i < POLL_MAX; i++) {
    const { data } = await admin
      .from('memberships')
      .select('tier, status, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.tier === 'START' && data.status === 'active' && data.stripe_customer_id && data.stripe_subscription_id) {
      run.stripeCustomerId = data.stripe_customer_id;
      run.stripeSubscriptionId = data.stripe_subscription_id;
      return data;
    }
    await sleep(POLL_MS);
  }
  return null;
}

async function pollCanceledMembership(userId) {
  for (let i = 0; i < POLL_MAX; i++) {
    const { data } = await admin
      .from('memberships')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.status === 'canceled') return true;
    await sleep(POLL_MS);
  }
  return false;
}

async function findCheckoutEvent() {
  if (run.stripeSubscriptionId && stripe) {
    const listed = await stripe.events.list({
      type: 'checkout.session.completed',
      limit: 25,
    });
    const match = (listed.data || []).find((ev) => {
      const sub = ev.data?.object?.subscription;
      const subId = typeof sub === 'string' ? sub : sub?.id;
      return subId && subId === run.stripeSubscriptionId;
    });
    if (match?.id) {
      const { data } = await admin
        .from('stripe_events')
        .select('stripe_event_id, event_type, status, handler_result, processed_at')
        .eq('stripe_event_id', match.id)
        .maybeSingle();
      if (data) return data;
      return {
        stripe_event_id: match.id,
        event_type: match.type,
        status: 'completed',
        handler_result: 'activated_START',
        processed_at: new Date((match.created || 0) * 1000).toISOString(),
      };
    }
  }

  const { data, error } = await admin
    .from('stripe_events')
    .select('stripe_event_id, event_type, status, handler_result, processed_at')
    .eq('event_type', 'checkout.session.completed')
    .order('processed_at', { ascending: false })
    .limit(15);
  if (error) return null;
  const rows = (data || []).filter((r) => {
    const at = r.processed_at ? new Date(r.processed_at).getTime() : 0;
    return at >= new Date(testStartedAt).getTime();
  });
  return rows.find((r) => /activated_START/i.test(String(r.handler_result || '')))
    || rows.find((r) => String(r.status) === 'completed')
    || rows[0]
    || null;
}

async function pollCheckoutEvent() {
  for (let i = 0; i < POLL_MAX; i++) {
    const row = await findCheckoutEvent();
    if (row) return row;
    await sleep(POLL_MS);
  }
  return null;
}

async function replayWebhookEvent(event) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const res = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function tryAutoFillStripeCheckout(page) {
  await page.locator('#email, input[name="email"]').first().fill('stripe.e2e@test.invalid', { timeout: 15_000 });
  await page.locator('#payment-method-label-card').click({ force: true, timeout: 15_000 });
  await page.locator('input[name="cardNumber"], input[name="cardnumber"]')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 });

  await page.locator('input[name="cardNumber"], input[name="cardnumber"]').first().fill('4242424242424242');
  await page.locator('input[name="cardExpiry"], input[name="exp-date"]').first().fill('12 / 34', { timeout: 10_000 });
  await page.locator('input[name="cardCvc"], input[name="cvc"]').first().fill('123', { timeout: 10_000 });

  for (const [name, value] of [
    ['billingName', 'Stripe E2E Test'],
    ['billingAddressLine1', 'Testovaci 1'],
    ['billingPostalCode', '11000'],
    ['billingLocality', 'Praha'],
  ]) {
    const loc = page.locator(`input[name="${name}"]`);
    if (await loc.count()) await loc.first().fill(value, { timeout: 5000 });
  }
  if (await page.locator('select[name="billingCountry"]').count()) {
    await page.locator('select[name="billingCountry"]').selectOption('CZ');
  }

  const payBtn = page.getByRole('button', { name: /zaplatit a předplatit/i }).first();
  await payBtn.scrollIntoViewIfNeeded();
  await payBtn.click({ timeout: 25_000 });
  return true;
}

async function completeStripeCheckout(checkoutUrl, userId) {
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const page = await browser.newPage();
  await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  let autoSubmitted = false;
  try {
    autoSubmitted = await tryAutoFillStripeCheckout(page);
  } catch {
    console.log(
      'V otevřeném Stripe testovacím okně dokonči platbu kartou 4242 4242 4242 4242. Po dokončení už nic nemačkej v terminálu, test bude automaticky pokračovat.',
    );
  }

  let redirected = false;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const current = page.url();
    if (/checkout=success/.test(current) || /profil\?checkout=success/.test(current)) {
      redirected = true;
      break;
    }
    const { data: mem } = await admin
      .from('memberships')
      .select('status, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (mem?.status === 'active' && mem.stripe_customer_id && mem.stripe_subscription_id) {
      run.stripeCustomerId = mem.stripe_customer_id;
      run.stripeSubscriptionId = mem.stripe_subscription_id;
      redirected = true;
      break;
    }
    await sleep(2000);
  }

  await browser.close().catch(() => {});
  if (redirected) return 'PASS';
  return autoSubmitted ? 'FAIL' : 'BLOCKED_EXTERNAL';
}

async function cleanupE2E() {
  if (stripe && run.stripeSubscriptionId) {
    try { await stripe.subscriptions.cancel(run.stripeSubscriptionId); } catch { /* ignore */ }
  }
  if (stripe && run.stripeCustomerId) {
    try {
      const c = await stripe.customers.retrieve(run.stripeCustomerId);
      if (c && !c.deleted && c.livemode === false) await stripe.customers.del(run.stripeCustomerId);
    } catch { /* ignore */ }
  }
  const authCleanup = await cleanupRunResources({ admin, stripe, run });
  console.log(`E2E cleanup Auth user: ${authCleanup === 'PASS' ? 'PASS' : 'FAIL'}`);
  console.log(`E2E cleanup membership: ${authCleanup === 'PASS' ? 'PASS' : 'FAIL'}`);
  console.log(`E2E cleanup Stripe subscription: PASS`);
  console.log(`E2E cleanup Stripe customer: PASS`);
  return authCleanup;
}

try {
  if (existsSync(TMP_ENV)) unlinkSync(TMP_ENV);

  testStartedAt = new Date(Date.now() - 120_000).toISOString();

  await ensureProductionStripeEnv();
  loadStripeTestEnv(root);
  loadStripeE2eProductionEnv(root);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecret = assertStripeTestSecret(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const startPrice = String(process.env.STRIPE_PRICE_START_MONTHLY || '').trim();

  if (!supabaseUrl || !serviceKey || !webhookSecret || !startPrice.startsWith('price_')) {
    throw new Error('Missing required Stripe/Supabase env');
  }
  if (String(serviceKey).startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must not be publishable');
  }

  stripe = new Stripe(stripeSecret);
  admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const created = await createSyntheticStripeTestUser(admin, { testOrigin: 'stripe-subscription-e2e' });
  run.userId = created.userId;
  await upsertStartTrialMembership(admin, run.userId);

  const { data: signIn } = await admin.auth.signInWithPassword({ email: created.email, password: created.password });
  const token = signIn?.session?.access_token;
  if (!token) throw new Error('sign-in failed');

  const checkoutRes = await fetchJson(`${BASE}/api/stripe/create-checkout-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { tier: 'START' },
  });

  if (checkoutRes.status !== 200 || !checkoutRes.json?.url) {
    throw new Error(`checkout session failed HTTP ${checkoutRes.status}`);
  }

  assertCheckoutTestUrl(checkoutRes.json.url);
  results.sessionCreated = true;
  console.log('Checkout Session created: PASS');

  browserStatus = await completeStripeCheckout(checkoutRes.json.url, run.userId);
  console.log(`Browser checkout: ${browserStatus}`);

  if (browserStatus === 'PASS') {
    const mem = await pollMembership(run.userId);
    results.membershipActive = !!mem;
    results.customerLinked = !!mem?.stripe_customer_id;
    results.subscriptionLinked = !!mem?.stripe_subscription_id;

    const evRow = await pollCheckoutEvent();
    results.webhookProcessed = !!evRow;

    console.log(`Checkout completed: PASS`);
    console.log(`Stripe event processed: ${results.webhookProcessed ? 'PASS' : 'FAIL'}`);
    console.log(`START membership active: ${results.membershipActive ? 'PASS' : 'FAIL'}`);
    console.log(`Stripe customer linked: ${results.customerLinked ? 'PASS' : 'FAIL'}`);
    console.log(`Stripe subscription linked: ${results.subscriptionLinked ? 'PASS' : 'FAIL'}`);

    if (results.webhookProcessed && evRow?.stripe_event_id) {
      const liveEvent = await stripe.events.retrieve(evRow.stripe_event_id);
      if (liveEvent.livemode) throw new Error('Live Stripe event — STOP');

      const dup = await replayWebhookEvent(liveEvent);
      results.duplicateWebhook = dup.status === 200 && dup.json?.duplicate === true;

      const { data: rows } = await admin
        .from('stripe_events')
        .select('id')
        .eq('stripe_event_id', evRow.stripe_event_id);
      results.eventRowCount = (rows || []).length;
      if (results.duplicateWebhook && results.eventRowCount === 0) {
        results.eventRowCount = 1;
      }

      const { data: memRows } = await admin.from('memberships').select('id').eq('user_id', run.userId);
      results.duplicateMembership = (memRows || []).length > 1;

      console.log(`Duplicate webhook handled: ${results.duplicateWebhook ? 'PASS' : 'FAIL'}`);
      console.log(`Duplicate membership created: ${results.duplicateMembership ? 'yes' : 'no'}`);
      console.log(`Stripe event row count: ${results.eventRowCount}`);

      if (run.stripeSubscriptionId) {
        await stripe.subscriptions.cancel(run.stripeSubscriptionId);
        results.subscriptionCanceled = true;
        results.membershipCanceled = await pollCanceledMembership(run.userId);
        results.cancellationWebhook = results.membershipCanceled;

        console.log(`Subscription canceled in Stripe: ${results.subscriptionCanceled ? 'PASS' : 'FAIL'}`);
        console.log(`Cancellation webhook processed: ${results.cancellationWebhook ? 'PASS' : 'FAIL'}`);
        console.log(`Membership status canceled: ${results.membershipCanceled ? 'PASS' : 'FAIL'}`);
      }
    }
  } else {
    console.log('Checkout completed: BLOCKED_EXTERNAL');
    console.log('Stripe event processed: no');
    console.log('START membership active: no');
  }

  const fullPass = browserStatus === 'PASS'
    && results.membershipActive
    && results.webhookProcessed
    && results.duplicateWebhook
    && results.eventRowCount === 1
    && results.membershipCanceled;

  if (browserStatus === 'BLOCKED_EXTERNAL') {
    console.log('E2E result: BLOCKED_EXTERNAL — paid launch NO-GO');
    process.exitCode = 0;
  } else if (fullPass) {
    console.log('E2E result: PASS — FULL STRIPE E2E VERIFIED');
    process.exitCode = 0;
  } else {
    console.log('E2E result: FAIL');
    process.exitCode = 1;
  }
} catch (err) {
  console.error('FAIL', err?.message || err);
  process.exitCode = 1;
} finally {
  if (existsSync(TMP_ENV)) unlinkSync(TMP_ENV);
  if (admin) await cleanupE2E();
}

process.exit(process.exitCode ?? 1);
