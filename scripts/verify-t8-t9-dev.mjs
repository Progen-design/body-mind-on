#!/usr/bin/env node
/** Ověření T8+T9 pro konkrétního dev preview uživatele */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env.preview.local', '.env']) {
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

const BASE_URL = (process.env.BASE_URL || 'https://body-mind-kmmntkg9y-progen-designs-projects.vercel.app').replace(/\/$/, '');
const DEV_URL = 'https://qfufvsyhlbximanxayci.supabase.co';
const DEV_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const email = process.argv[2] || 'p0-preview-1780786386788@example.com';
const password = process.argv[3] || 'P0TestPass1!';

if (!DEV_KEY) {
  console.error('Chybí SUPABASE_DEV_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(DEV_URL, DEV_KEY, { auth: { persistSession: false } });

function quoteShellArg(s) {
  const str = String(s);
  if (process.platform === 'win32') return `"${str.replace(/"/g, '""')}"`;
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

function previewFetch(path, { method = 'GET', rawBody, headers = {}, jsonKeys = [] } = {}) {
  const curlArgs = [];
  if (method !== 'GET') curlArgs.push('-X', method);
  curlArgs.push('--max-time', '60');
  for (const [k, v] of Object.entries(headers)) curlArgs.push('-H', `${k}: ${String(v)}`);
  if (rawBody != null) curlArgs.push('-d', rawBody);
  const cmd = ['npx', '-y', 'vercel@latest', 'curl', quoteShellArg(path), '--deployment', quoteShellArg(BASE_URL), '--yes', '--', ...curlArgs.map(quoteShellArg)].join(' ');
  const r = spawnSync(cmd, { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 10 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const all = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < out.length; j++) {
      if (out[j] === '{') depth++;
      else if (out[j] === '}') depth--;
      if (depth === 0) {
        try { all.push(JSON.parse(out.slice(i, j + 1))); } catch { /* ignore */ }
        break;
      }
    }
  }
  let parsed = all[all.length - 1];
  if (jsonKeys.length) {
    for (let i = all.length - 1; i >= 0; i--) {
      if (jsonKeys.some((k) => all[i] && Object.prototype.hasOwnProperty.call(all[i], k))) { parsed = all[i]; break; }
    }
  }
  const statusMatch = [...out.matchAll(/HTTP\/[\d.]+\s+(\d{3})/g)].pop();
  return { status: statusMatch ? Number(statusMatch[1]) : 500, body: parsed, raw: out.slice(-500) };
}

const { data: bm } = await sb.from('body_metrics').select('*').eq('email', email).maybeSingle();
if (!bm?.user_id) {
  console.error('body_metrics nenalezeny pro', email);
  process.exit(1);
}
const uid = bm.user_id;
console.log('user_id', uid);

const { data: authList } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const authUser = (authList?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
console.log('auth_user', authUser ? { id: authUser.id, email: authUser.email } : null);

const { data: membership } = await sb.from('memberships').select('*').eq('user_id', uid).maybeSingle();
console.log('membership', membership);

const { data: tasks } = await sb.from('ai_tasks').select('id, status, task_type').eq('user_id', uid);
console.log('ai_tasks', tasks);

const { data: plan } = await sb.from('ai_generated_plans').select('id, is_active, meal_plan, workout_plan, structured_plan_json').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
console.log('plan', plan ? {
  id: plan.id,
  is_active: plan.is_active,
  has_meals: !!(plan.meal_plan || plan.structured_plan_json?.days),
  has_workout: !!(plan.workout_plan || plan.structured_plan_json?.days),
} : null);

const { data: profile } = await sb.from('profiles').select('id, email, full_name').eq('id', uid).maybeSingle();
console.log('profile', profile);

const { data: signIn } = await sb.auth.signInWithPassword({ email, password });
const profileApi = previewFetch('/api/profile', {
  headers: { Authorization: `Bearer ${signIn.session.access_token}` },
  jsonKeys: ['membership', 'plan', 'metrics', 'error'],
});
console.log('profile_api', profileApi.status, profileApi.body?.error || (profileApi.body?.plan ? 'plan OK' : JSON.stringify(profileApi.body)?.slice(0, 200)));

const stripeKey = process.env.STRIPE_SECRET_KEY;
const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (stripeKey && whSecret) {
  const stripe = new Stripe(stripeKey);
  const eventPayload = {
    id: `evt_p0_verify_${Date.now()}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_p0_verify_${Date.now()}`,
        object: 'checkout.session',
        client_reference_id: uid,
        customer_email: email,
        customer: 'cus_p0_verify',
        subscription: 'sub_p0_verify',
      },
    },
  };
  const payload = JSON.stringify(eventPayload);
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: whSecret });
  const wh = previewFetch('/api/webhooks/stripe', {
    method: 'POST',
    rawBody: payload,
    headers: { 'stripe-signature': sig, 'Content-Type': 'application/json' },
    jsonKeys: ['received'],
  });
  console.log('stripe_webhook', wh.status, wh.body);
  const { data: memAfter } = await sb.from('memberships').select('status, tier').eq('user_id', uid).maybeSingle();
  console.log('membership_after_webhook', memAfter);
}
