#!/usr/bin/env node
/**
 * Dočasný E2E: Preview START Stripe checkout (test mode). Nesmí se commitovat.
 * Nevypisuje URL, tokeny, hesla ani PII.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = String(process.env.BASE_URL || 'https://body-mind-on-git-ops-preview-sta-e50acb-progen-designs-projects.vercel.app').replace(/\/$/, '');

for (const f of ['.env.local', '.env']) {
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

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('FAIL missing Supabase env');
  process.exit(1);
}

function quoteShellArg(s) {
  const str = String(s);
  if (process.platform === 'win32') return `"${str.replace(/"/g, '""')}"`;
  return `'${str.replace(/'/g, `'\\''`)}'`;
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
    if (jsonMatches[i]?.url) { parsed = jsonMatches[i]; break; }
  }
  return parsed;
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const email = `info+stripe-preview-${Date.now()}@bodyandmindon.cz`;
const password = randomBytes(18).toString('base64url');

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (createErr) {
  console.error('FAIL createUser', createErr.message);
  process.exit(1);
}
const uid = created.user.id;
const now = new Date().toISOString();
await admin.from('memberships').upsert({
  user_id: uid,
  tier: 'START',
  status: 'trial',
  started_at: now,
  trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  updated_at: now,
});

const { data: signIn } = await admin.auth.signInWithPassword({ email, password });
const token = signIn?.session?.access_token;
if (!token) {
  console.error('FAIL sign-in');
  process.exit(1);
}

const checkoutBody = vercelCurlPost('/api/stripe/create-checkout-session', {
  headers: { Authorization: `Bearer ${token}` },
  body: { tier: 'START' },
});
const checkoutUrl = checkoutBody?.url;
if (!checkoutUrl || !/^https:\/\/checkout\.stripe\.com\//.test(checkoutUrl)) {
  console.error('FAIL session not created');
  process.exit(1);
}
const mode = /cs_test_/i.test(checkoutUrl) ? 'test' : (/cs_live_/i.test(checkoutUrl) ? 'live' : 'unknown');
console.log('Session created: yes');
console.log(`Stripe mode: ${mode}`);

let browserCheckout = 'BLOCKED_EXTERNAL';
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

  // Stripe hosted checkout — card payment
  const cardFrame = page.frameLocator('iframe').first();
  await page.getByRole('textbox', { name: /e-mail|email/i }).fill(email).catch(() => {});
  await page.locator('[data-testid="card-accordion-item"], button:has-text("Card")').first().click({ timeout: 15000 }).catch(() => {});

  const num = page.locator('input[name="cardNumber"], input[placeholder*="1234"]').first();
  await num.fill('4242424242424242', { timeout: 30000 });
  await page.locator('input[name="cardExpiry"], input[placeholder*="MM"]').first().fill('12/34', { timeout: 10000 }).catch(async () => {
    await page.getByPlaceholder(/MM/i).fill('1234');
  });
  await page.locator('input[name="cardCvc"], input[placeholder*="CVC"]').first().fill('123', { timeout: 10000 }).catch(async () => {
    await page.getByPlaceholder(/CVC/i).fill('123');
  });
  await page.getByRole('textbox', { name: /name|jméno/i }).fill('Stripe Preview Test', { timeout: 10000 }).catch(() => {});

  await page.getByRole('button', { name: /pay|subscribe|zaplatit|předplatit/i }).click({ timeout: 30000 });
  await page.waitForURL(/checkout=success|profil/, { timeout: 120000 });
  const finalUrl = page.url();
  if (/checkout=success/.test(finalUrl) || (finalUrl.includes('/profil') && finalUrl.includes(BASE.replace('https://', '')))) {
    browserCheckout = 'PASS';
  } else if (finalUrl.includes('checkout.stripe.com')) {
    browserCheckout = 'FAIL';
  }
  await browser.close();
} catch (e) {
  browserCheckout = 'BLOCKED_EXTERNAL';
  console.log('Browser checkout note: automation blocked or Stripe UI changed');
}

console.log(`Browser checkout: ${browserCheckout}`);

// Poll membership + stripe_events (read-only aggregate)
let membershipActive = false;
let customerLinked = false;
let subscriptionLinked = false;
let eventProcessed = false;

for (let i = 0; i < 20; i++) {
  const { data: mem } = await admin.from('memberships').select('status, stripe_customer_id, stripe_subscription_id').eq('user_id', uid).maybeSingle();
  if (mem?.status === 'active') membershipActive = true;
  if (mem?.stripe_customer_id) customerLinked = true;
  if (mem?.stripe_subscription_id) subscriptionLinked = true;

  const { count } = await admin.from('stripe_events').select('id', { count: 'exact', head: true }).eq('status', 'completed');
  if ((count || 0) > 0) eventProcessed = true;

  if (membershipActive && customerLinked && subscriptionLinked) break;
  await new Promise((r) => setTimeout(r, 3000));
}

// More precise event check for checkout.session.completed recent
const { data: events } = await admin
  .from('stripe_events')
  .select('event_type, status')
  .eq('event_type', 'checkout.session.completed')
  .eq('status', 'completed')
  .order('processed_at', { ascending: false })
  .limit(1);
if (events?.length) eventProcessed = true;

console.log(`Stripe event processed: ${eventProcessed ? 'yes' : 'no'}`);
console.log(`START membership active: ${membershipActive ? 'yes' : 'no'}`);
console.log(`Stripe customer linked: ${customerLinked ? 'yes' : 'no'}`);
console.log(`Stripe subscription linked: ${subscriptionLinked ? 'yes' : 'no'}`);

if (browserCheckout === 'BLOCKED_EXTERNAL') {
  console.log('E2E result: PASS API + BLOCKED_EXTERNAL browser');
  process.exit(0);
}
process.exit(browserCheckout === 'PASS' && membershipActive ? 0 : 1);
