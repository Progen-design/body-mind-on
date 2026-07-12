#!/usr/bin/env node
/**
 * Ověření Stripe tier mapování (static + unit mapping).
 *   npm run verify:stripe-tier-mapping
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  buildStripePriceToTierMap,
  resolveTierFromStripePriceId,
  resolveTierFromStripeSubscription,
  stripeTierEnvStatus,
  tiersMatch,
  getStripePriceIdForTier,
} from '../lib/stripeTierMapping.js';
import { loadLocalEnv } from './audit-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

loadLocalEnv();

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const webhookSrc = readFileSync(join(ROOT, 'pages/api/webhooks/stripe.js'), 'utf8');
const checkoutSrc = readFileSync(join(ROOT, 'pages/api/stripe/create-checkout-session.js'), 'utf8');
const migrationExists = readFileSync(join(ROOT, 'supabase/migrations/20260712120000_stripe_events_idempotency.sql'), 'utf8');
const eventStoreSrc = readFileSync(join(ROOT, 'lib/stripeEventStore.js'), 'utf8');

check('webhook imports tier mapping', webhookSrc.includes('stripeTierMapping'));
check('webhook uses stripeEventStore', webhookSrc.includes('stripeEventStore'));
check('webhook no hardcoded tier START in activate', !/tier:\s*['"]START['"]/.test(webhookSrc));
check('webhook rejects unknown price', webhookSrc.includes('skipped_unknown_price'));
check('webhook tier mismatch guard', webhookSrc.includes('skipped_tier_mismatch'));
check('webhook legacy email fallback', webhookSrc.includes('getUserIdByEmailLegacy'));
check('checkout endpoint allowlist', checkoutSrc.includes("ALLOWED_TIERS") && checkoutSrc.includes('START'));
check('checkout price from env only', checkoutSrc.includes('getStripePriceIdForTier'));
check('migration stripe_events status column', migrationExists.includes('status text'));
check('event store stale processing', eventStoreSrc.includes('STALE_PROCESSING_MS'));

const testEnv = {
  STRIPE_PRICE_START_MONTHLY: 'price_start_test',
  STRIPE_PRICE_ON_CLUB_MONTHLY: 'price_club_test',
  STRIPE_PRICE_VIP_MONTHLY: 'price_vip_test',
};

check('maps START price', resolveTierFromStripePriceId('price_start_test', testEnv) === 'START');
check('maps ON_CLUB price', resolveTierFromStripePriceId('price_club_test', testEnv) === 'ON_CLUB');
check('maps VIP price', resolveTierFromStripePriceId('price_vip_test', testEnv) === 'VIP');
check('unknown price returns null', resolveTierFromStripePriceId('price_unknown', testEnv) === null);
check('metadata tier mismatch', tiersMatch('START', 'VIP') === false);
check('getStripePriceIdForTier START', getStripePriceIdForTier('START', testEnv) === 'price_start_test');

const subTier = resolveTierFromStripeSubscription({
  items: { data: [{ price: { id: 'price_club_test' } }] },
}, testEnv);
check('subscription price mapping', subTier === 'ON_CLUB');

const map = buildStripePriceToTierMap(testEnv);
check('map has 3 entries', Object.keys(map).length === 3);

const envStatus = stripeTierEnvStatus(process.env);
if (envStatus.missing.length) {
  console.log(`WARN Stripe price env missing: ${envStatus.missing.join(', ')}`);
} else {
  check('production Stripe price env configured', envStatus.configured.length === 3, envStatus.configured.join(', '));
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
