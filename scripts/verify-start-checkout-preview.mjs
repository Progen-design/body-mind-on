#!/usr/bin/env node
/**
 * Ověří START checkout na preview/production BASE_URL (Stripe test mode).
 *   BASE_URL=https://...vercel.app node scripts/verify-start-checkout-preview.mjs
 *
 * Vercel Deployment Protection: používá `vercel curl` (automatický bypass).
 * Nevypisuje checkout URL, session ID, tokeny ani hesla.
 */
import { readFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

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

const BASE = String(process.env.BASE_URL || '').replace(/\/$/, '').replace(/\?.*$/, '');
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE) {
  console.error('FAIL missing BASE_URL');
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) {
  console.error('FAIL missing Supabase env');
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

function checkoutMetaFromUrl(url) {
  const host = 'checkout.stripe.com';
  if (!url || !/^https:\/\/checkout\.stripe\.com\//.test(url)) {
    return { host, mode: 'unknown', sessionCreated: false };
  }
  const mode = /\/c\/pay\/cs_test_/i.test(url) ? 'test' : (/\/c\/pay\/cs_live_/i.test(url) ? 'live' : 'unknown');
  return { host, mode, sessionCreated: true };
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
  return {
    status: effectiveStatus,
    body: parsed,
  };
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const email = `info+stripe-preview-${Date.now()}@bodyandmindon.cz`;
const password = randomBytes(18).toString('base64url');

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr) {
  console.error('FAIL createUser', createErr.message);
  process.exit(1);
}

const uid = created.user.id;
const now = new Date().toISOString();
const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
const { error: memErr } = await admin.from('memberships').upsert({
  user_id: uid,
  tier: 'START',
  status: 'trial',
  started_at: now,
  trial_ends_at: trialEnd,
  updated_at: now,
});
if (memErr) {
  console.error('FAIL membership upsert', memErr.message);
  process.exit(1);
}

const { data: signIn, error: signErr } = await admin.auth.signInWithPassword({ email, password });
const accessToken = signIn?.session?.access_token || null;
if (!accessToken) {
  console.error('FAIL sign-in', signErr?.message || 'no token');
  process.exit(1);
}

const { status, body } = vercelCurlPost('/api/stripe/create-checkout-session', {
  headers: { Authorization: `Bearer ${accessToken}` },
  body: { tier: 'START' },
});

if (status !== 200) {
  console.error('FAIL checkout HTTP', status, sanitizeErrorBody(body));
  process.exit(1);
}

const meta = checkoutMetaFromUrl(body.url);
if (!meta.sessionCreated) {
  console.error('FAIL invalid checkout host');
  process.exit(1);
}

console.log('PASS START checkout preview');
console.log(`HTTP status: ${status}`);
console.log(`Checkout host: ${meta.host}`);
console.log(`Mode: ${meta.mode}`);
console.log(`Session created: ${meta.sessionCreated ? 'yes' : 'no'}`);
process.exit(0);
