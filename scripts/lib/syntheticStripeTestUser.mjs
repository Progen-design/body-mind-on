/**
 * Sdílené utility pro syntetické Stripe test účty (bez PII ve výstupu).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

export const TEST_ORIGIN = 'preview-start-checkout-verifier';
export const STRIPE_PREVIEW_EMAIL_RE = /^info\+stripe-preview-[0-9]+(?:-[A-Za-z0-9_-]+)?@bodyandmindon\.cz$/i;

const CLEANUP_TIMEOUT_MS = 30_000;

export function loadStripeTestEnv(root) {
  for (const f of ['.env.local', '.env', '.env.production.local', '.env.stripe-e2e.tmp']) {
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
}

/** Production Stripe E2E — přepíše Supabase/Stripe klíče z Vercel pull. */
export function loadStripeE2eProductionEnv(root) {
  const p = join(root, '.env.stripe-e2e.tmp');
  if (!existsSync(p)) return;
  const keys = new Set([
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_START_MONTHLY',
  ]);
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!keys.has(k)) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

export function makeStripePreviewEmail() {
  const shortRandom = randomBytes(4).toString('hex');
  return `info+stripe-preview-${Date.now()}-${shortRandom}@bodyandmindon.cz`;
}

export function assertStripeTestSecret(stripeSecret) {
  const key = String(stripeSecret || '').trim();
  if (!key.startsWith('sk_test_')) {
    throw new Error('STRIPE_SECRET_KEY must be sk_test_ (test mode only)');
  }
  return key;
}

export function checkoutModeFromUrl(url) {
  if (!url || !/^https:\/\/checkout\.stripe\.com\//.test(url)) return 'unknown';
  if (/\/c\/pay\/cs_test_/i.test(url)) return 'test';
  if (/\/c\/pay\/cs_live_/i.test(url)) return 'live';
  return 'unknown';
}

export function assertCheckoutTestUrl(url) {
  const mode = checkoutModeFromUrl(url);
  if (mode === 'live') throw new Error('Live Checkout Session detected — STOP');
  if (mode !== 'test') throw new Error('Invalid or missing Stripe test checkout session');
  return mode;
}

export function isPublishableSupabaseKey(key) {
  const k = String(key || '');
  return k.startsWith('sb_publishable_') || /^eyJ/.test(k) === false && k.includes('publishable');
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function createSyntheticStripeTestUser(admin, { password, testOrigin = TEST_ORIGIN } = {}) {
  const email = makeStripePreviewEmail();
  const pwd = password || randomBytes(18).toString('base64url');
  const meta = {
    test_origin: testOrigin,
    synthetic_test_user: true,
  };
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pwd,
    email_confirm: true,
    app_metadata: meta,
    user_metadata: meta,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  return {
    userId: data.user.id,
    email,
    password: pwd,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    membershipCreated: false,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 */
export async function upsertStartTrialMembership(admin, userId) {
  const now = new Date().toISOString();
  const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
  const { error } = await admin.from('memberships').upsert({
    user_id: userId,
    tier: 'START',
    status: 'trial',
    started_at: now,
    trial_ends_at: trialEnd,
    updated_at: now,
  });
  if (error) throw new Error(`membership upsert failed: ${error.message}`);
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ admin: import('@supabase/supabase-js').SupabaseClient, stripe?: import('stripe').Stripe|null, run: { userId: string|null, stripeCustomerId?: string|null, stripeSubscriptionId?: string|null }, keepUser?: boolean }} opts
 * @returns {Promise<'PASS'|'FAIL'|'SKIPPED'>}
 */
export async function cleanupRunResources({ admin, stripe = null, run, keepUser = false }) {
  if (keepUser || !run?.userId) return 'SKIPPED';

  const userId = run.userId;
  let ok = true;

  try {
    await withTimeout((async () => {
      if (stripe && run.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(run.stripeSubscriptionId);
        } catch {
          /* already canceled */
        }
      }
      if (stripe && run.stripeCustomerId) {
        try {
          const cust = await stripe.customers.retrieve(run.stripeCustomerId);
          if (cust && !cust.deleted && cust.livemode === false) {
            await stripe.customers.del(run.stripeCustomerId);
          }
        } catch {
          /* ignore */
        }
      }

      const { error: rpcErr } = await admin.rpc('delete_user_data', { target_user_id: userId });
      if (rpcErr) {
        await admin.from('memberships').delete().eq('user_id', userId);
      }

      const { error: authErr } = await admin.auth.admin.deleteUser(userId);
      if (authErr) ok = false;

      const { data: still } = await admin.auth.admin.getUserById(userId);
      if (still?.user?.id) ok = false;
    })(), CLEANUP_TIMEOUT_MS, 'cleanup');
  } catch {
    ok = false;
  }

  return ok ? 'PASS' : 'FAIL';
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function aggregateStripePreviewCounts(admin) {
  let authCount = 0;
  let membershipCount = 0;
  const userIds = [];

  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      const em = (u.email || '').trim().toLowerCase();
      if (em && STRIPE_PREVIEW_EMAIL_RE.test(em)) {
        authCount += 1;
        userIds.push(u.id);
      }
    }
    if (users.length < 200) break;
    page += 1;
  }

  if (userIds.length) {
    const { data: mems } = await admin
      .from('memberships')
      .select('user_id')
      .in('user_id', userIds)
      .eq('tier', 'START');
    membershipCount = (mems || []).length;
  }

  return { authCount, membershipCount };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 */
export async function hasProductActivity(admin, userId) {
  const checks = [
    ['workouts', 'user_id'],
    ['habit_logs', 'user_id'],
    ['community_posts', 'user_id'],
    ['community_replies', 'user_id'],
    ['withings_connections', 'user_id'],
    ['withings_measurements', 'user_id'],
    ['ai_generated_plans', 'user_id'],
    ['body_metrics', 'user_id'],
  ];

  for (const [table, col] of checks) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq(col, userId);
    if (error) continue;
    if ((count || 0) > 0) return true;
  }
  return false;
}
