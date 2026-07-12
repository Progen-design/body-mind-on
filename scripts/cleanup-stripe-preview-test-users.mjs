#!/usr/bin/env node
/**
 * Bezpečný cleanup starých syntetických stripe-preview test účtů.
 * Výchozí: dry-run. Smazání: --confirm=DELETE_STRIPE_PREVIEW_TEST_USERS
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  STRIPE_PREVIEW_EMAIL_RE,
  loadStripeTestEnv,
  hasProductActivity,
  aggregateStripePreviewCounts,
} from './lib/syntheticStripeTestUser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
loadStripeTestEnv(root);

const args = process.argv.slice(2);
const dryRun = !args.some((a) => a.startsWith('--confirm='));
const confirm = args.find((a) => a.startsWith('--confirm='))?.split('=')[1] || '';
const confirmed = confirm === 'DELETE_STRIPE_PREVIEW_TEST_USERS';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('FAIL missing Supabase env');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const stats = {
  candidates: 0,
  safe: 0,
  skippedActive: 0,
  skippedStripe: 0,
  skippedActivity: 0,
  ambiguous: 0,
  deleted: 0,
};

async function listStripePreviewUsers() {
  const out = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      const email = (u.email || '').trim().toLowerCase();
      if (!email || !STRIPE_PREVIEW_EMAIL_RE.test(email)) continue;
      if (/bm-smoke/i.test(email)) continue;
      out.push({ id: u.id, email });
    }
    if (users.length < 200) break;
    page += 1;
  }
  return out;
}

async function evaluateCandidate(userId) {
  const { data: mem, error: memErr } = await admin
    .from('memberships')
    .select('tier, status, stripe_customer_id, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (memErr) {
    stats.ambiguous += 1;
    return { safe: false, reason: 'ambiguous' };
  }

  if (!mem) {
    const activity = await hasProductActivity(admin, userId);
    if (activity) {
      stats.skippedActivity += 1;
      return { safe: false, reason: 'activity' };
    }
    return { safe: true, reason: 'no_membership' };
  }

  if (mem.tier !== 'START') {
    stats.ambiguous += 1;
    return { safe: false, reason: 'ambiguous' };
  }

  if (!['trial', 'pending_payment'].includes(String(mem.status || ''))) {
    stats.skippedActive += 1;
    return { safe: false, reason: 'active_membership' };
  }

  if (mem.stripe_customer_id || mem.stripe_subscription_id) {
    stats.skippedStripe += 1;
    return { safe: false, reason: 'stripe_linked' };
  }

  const activity = await hasProductActivity(admin, userId);
  if (activity) {
    stats.skippedActivity += 1;
    return { safe: false, reason: 'activity' };
  }

  return { safe: true, reason: 'ok' };
}

async function deleteSafeUser(userId) {
  const { error: rpcErr } = await admin.rpc('delete_user_data', { target_user_id: userId });
  if (rpcErr) {
    await admin.from('memberships').delete().eq('user_id', userId);
  }
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) throw new Error(authErr.message);
}

async function runDryRunSummary() {
  const users = await listStripePreviewUsers();
  stats.candidates = users.length;
  const safeIds = [];

  for (const u of users) {
    const ev = await evaluateCandidate(u.id);
    if (ev.safe) {
      stats.safe += 1;
      safeIds.push(u.id);
    }
  }

  console.log(`Candidates found: ${stats.candidates}`);
  console.log(`Safe to delete: ${stats.safe}`);
  console.log(`Skipped because active membership: ${stats.skippedActive}`);
  console.log(`Skipped because Stripe linkage: ${stats.skippedStripe}`);
  console.log(`Skipped because product activity: ${stats.skippedActivity}`);
  console.log(`Skipped because ambiguous: ${stats.ambiguous}`);

  return safeIds;
}

try {
  const safeIds = await runDryRunSummary();

  if (dryRun || !confirmed) {
    process.exit(0);
  }

  if (stats.ambiguous > 0) {
    console.error('FAIL ambiguous candidates present — aborting delete');
    process.exit(1);
  }

  for (const id of safeIds) {
    await deleteSafeUser(id);
    stats.deleted += 1;
  }

  console.log(`Deleted: ${stats.deleted}`);

  // Post-delete dry-run
  Object.assign(stats, {
    candidates: 0, safe: 0, skippedActive: 0, skippedStripe: 0, skippedActivity: 0, ambiguous: 0,
  });
  await runDryRunSummary();

  if (stats.safe !== 0) {
    console.error('WARN safe candidates remain after delete');
    process.exit(1);
  }

  process.exit(0);
} catch (err) {
  console.error('FAIL', err?.message || err);
  process.exit(1);
}
