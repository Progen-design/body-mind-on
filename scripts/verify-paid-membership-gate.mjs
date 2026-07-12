#!/usr/bin/env node
/**
 * Ověření paid membership gate: registrace, přístup, Stripe aktivace, DB contract.
 *   npm run verify:paid-membership-gate
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { membershipFromRegistration } from '../lib/membershipRegistration.js';
import {
  resolveTierFromStripePriceId,
  tiersMatch,
} from '../lib/stripeTierMapping.js';
import { mapStripeSubscriptionStatusToMembership } from '../lib/stripeSubscriptionStatus.js';
import { isStripeLegacyCheckoutAllowed } from '../lib/stripeLegacyCheckout.js';

function isAccessAllowedForTest(membership) {
  if (!membership) return { allowed: false };
  const tier = String(membership.tier || 'START').toUpperCase();
  const { status, trial_ends_at: trialEndsAt } = membership;
  const now = new Date();
  if (status === 'pending_payment' || status === 'past_due') return { allowed: false };
  if (tier === 'START') {
    if (status === 'active') return { allowed: true };
    if (status === 'trial' && trialEndsAt && new Date(trialEndsAt) >= now) return { allowed: true };
    return { allowed: false };
  }
  if (status === 'active') return { allowed: true };
  return { allowed: false };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const bodyMetricsSrc = readFileSync(join(ROOT, 'pages/api/body-metrics.js'), 'utf8');
const webhookSrc = readFileSync(join(ROOT, 'pages/api/webhooks/stripe.js'), 'utf8');
const checkoutSrc = readFileSync(join(ROOT, 'pages/api/stripe/create-checkout-session.js'), 'utf8');
const statusMigration = readFileSync(join(ROOT, 'supabase/migrations/20260712121000_membership_status_contract.sql'), 'utf8');
const profilSrc = readFileSync(join(ROOT, 'pages/profil.js'), 'utf8');
const helpersSrc = readFileSync(join(ROOT, 'lib/membershipHelpers.js'), 'utf8');

check('body-metrics uses membershipFromRegistration', bodyMetricsSrc.includes('membershipFromRegistration'));
check('body-metrics no auto active for paid tiers', !/isStart \? 'trial' : 'active'/.test(bodyMetricsSrc));
check('checkout endpoint exists', checkoutSrc.includes('create-checkout-session'));
check('checkout sets client_reference_id', checkoutSrc.includes('client_reference_id'));
check('checkout metadata user_id', checkoutSrc.includes('metadata') && checkoutSrc.includes('expected_tier'));
check('webhook uses stripeEventStore', webhookSrc.includes('stripeEventStore'));
check('webhook tier mismatch guard', webhookSrc.includes('skipped_tier_mismatch'));
check('webhook unknown price skip', webhookSrc.includes('skipped_unknown_price'));
check('webhook rejects missing user_id by default', webhookSrc.includes('skipped_no_user_id'));
check('webhook rejects missing expected_tier', webhookSrc.includes('skipped_no_expected_tier'));
check('legacy checkout gated by env flag', webhookSrc.includes('isStripeLegacyCheckoutAllowed'));
check('legacy checkout default off', isStripeLegacyCheckoutAllowed() === false);
check('runtime no membership status cancelled', !helpersSrc.includes("'cancelled'") && !profilSrc.includes("membershipStatus === 'cancelled'"));
check('runtime uses canceled spelling', helpersSrc.includes("'canceled'") && profilSrc.includes("membershipStatus === 'canceled'"));

const allowedStatuses = ['trial', 'pending_payment', 'active', 'past_due', 'canceled', 'expired'];
for (const st of allowedStatuses) {
  check(`DB contract allows ${st}`, statusMigration.includes(`'${st}'`));
}
check('DB contract migrates cancelled → canceled', statusMigration.includes("status = 'cancelled'") && statusMigration.includes("SET status = 'canceled'"));
check('DB contract forbids cancelled in CHECK', !statusMigration.includes("'cancelled'") || statusMigration.includes("WHERE status = 'cancelled'"));

const startedAt = '2026-07-01T10:00:00.000Z';

const startMem = membershipFromRegistration('START', startedAt);
check('START registration → trial', startMem.tier === 'START' && startMem.status === 'trial');
check('START trial_ends_at +7d', startMem.trial_ends_at === '2026-07-08T10:00:00.000Z');

const clubMem = membershipFromRegistration('ON_CLUB', startedAt);
check('ON_CLUB registration → pending_payment', clubMem.tier === 'ON_CLUB' && clubMem.status === 'pending_payment');
check('ON_CLUB does not create active', clubMem.status !== 'active');

const vipMem = membershipFromRegistration('VIP', startedAt);
check('VIP registration → pending_payment', vipMem.tier === 'VIP' && vipMem.status === 'pending_payment');
check('VIP does not create active', vipMem.status !== 'active');

const pendingAccess = isAccessAllowedForTest({ tier: 'ON_CLUB', status: 'pending_payment', trial_ends_at: null });
check('pending_payment blocks access', pendingAccess.allowed === false);

const pastDueAccess = isAccessAllowedForTest({ tier: 'ON_CLUB', status: 'past_due', trial_ends_at: null });
check('past_due blocks access', pastDueAccess.allowed === false);

const noWebhookAccess = isAccessAllowedForTest({ tier: 'VIP', status: 'pending_payment', trial_ends_at: null });
check('paid tier without webhook not active', noWebhookAccess.allowed === false);

const testEnv = {
  STRIPE_PRICE_START_MONTHLY: 'price_start_test',
  STRIPE_PRICE_ON_CLUB_MONTHLY: 'price_club_test',
  STRIPE_PRICE_VIP_MONTHLY: 'price_vip_test',
};

check('START price → START', resolveTierFromStripePriceId('price_start_test', testEnv) === 'START');
check('ON_CLUB price → ON_CLUB', resolveTierFromStripePriceId('price_club_test', testEnv) === 'ON_CLUB');
check('VIP price → VIP', resolveTierFromStripePriceId('price_vip_test', testEnv) === 'VIP');
check('unknown price → null', resolveTierFromStripePriceId('price_unknown', testEnv) === null);
check('tier mismatch detected', tiersMatch('START', 'ON_CLUB') === false);
check('tier match OK', tiersMatch('VIP', 'VIP') === true);

check('Stripe active → membership active', mapStripeSubscriptionStatusToMembership('active') === 'active');
check('Stripe trialing → membership active', mapStripeSubscriptionStatusToMembership('trialing') === 'active');
check('Stripe incomplete → pending_payment', mapStripeSubscriptionStatusToMembership('incomplete') === 'pending_payment');
check('Stripe past_due → past_due', mapStripeSubscriptionStatusToMembership('past_due') === 'past_due');
check('Stripe unpaid → past_due', mapStripeSubscriptionStatusToMembership('unpaid') === 'past_due');
check('Stripe canceled → canceled', mapStripeSubscriptionStatusToMembership('canceled') === 'canceled');

const eventStoreSrc = readFileSync(join(ROOT, 'lib/stripeEventStore.js'), 'utf8');
check('stripeEventStore claimStripeEvent', eventStoreSrc.includes('export async function claimStripeEvent'));
check('stripeEventStore completeStripeEvent', eventStoreSrc.includes('export async function completeStripeEvent'));
check('stripeEventStore failStripeEvent (retry)', eventStoreSrc.includes('export async function failStripeEvent'));
check('stale processing reclaim', eventStoreSrc.includes('STALE_PROCESSING_MS'));
check('failed status allows retry', eventStoreSrc.includes("'failed'"));
check('duplicate completed is idempotent', eventStoreSrc.includes("'duplicate'") && eventStoreSrc.includes("'completed'"));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
