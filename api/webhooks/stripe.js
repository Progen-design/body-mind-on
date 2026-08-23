// POST /api/webhooks/stripe – Stripe webhook (checkout.session.completed, subscription events)
// V produkci musí být nastaveno STRIPE_SECRET_KEY a STRIPE_WEBHOOK_SECRET.

import Stripe from 'stripe';
import { supabaseServer } from '../../lib/supabaseServer.js';
import {
  resolveTierFromStripePriceId,
  resolveTierFromStripeSubscription,
  tiersMatch,
} from '../../lib/stripeTierMapping.js';
import {
  claimStripeEvent,
  completeStripeEvent,
  failStripeEvent,
  skipStripeEvent,
} from '../../lib/stripeEventStore.js';
import { isStripeLegacyCheckoutAllowed } from '../../lib/stripeLegacyCheckout.js';
import { mapStripeSubscriptionStatusToMembership } from '../../lib/stripeSubscriptionStatus.js';
import { produceWeeklyTaskForUser } from '../../lib/weeklyPlanProducer.js';

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Legacy fallback: user_id z e-mailu v body_metrics (jen při STRIPE_ALLOW_LEGACY_CHECKOUT=true).
 * @param {string} email
 */
async function getUserIdByEmailLegacy(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabaseServer
    .from('body_metrics')
    .select('user_id')
    .eq('email', normalized)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.user_id) return null;
  return data.user_id;
}

/**
 * @param {import('stripe').Stripe.Checkout.Session} session
 */
function resolveUserIdFromSession(session) {
  return session.client_reference_id
    || session.metadata?.user_id
    || null;
}

/**
 * @param {string} userId
 * @param {{ tier: string, status: string, stripeCustomerId?: string|null, stripeSubscriptionId?: string|null, note?: string }} opts
 */
async function upsertMembership(userId, {
  tier,
  status,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
  trialEndsAt = null,
  note = null,
}) {
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    tier,
    status,
    updated_at: now,
    notes: note || `Stripe sync (${status}, ${tier})`,
  };
  if (status === 'active') {
    row.started_at = now;
    row.trial_ends_at = null;
  }
  if (status === 'trial') {
    row.started_at = now;
    row.trial_ends_at = trialEndsAt;
  }
  if (stripeCustomerId) row.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId) row.stripe_subscription_id = stripeSubscriptionId;

  const { error } = await supabaseServer
    .from('memberships')
    .upsert([row], { onConflict: 'user_id' });
  return error;
}

/**
 * Stav členství podle Stripe subscription.
 *
 * Trial řídí Stripe, ne my. Když je subscription `trialing`, uživatel má
 * plný přístup, ale ještě nezaplatil — u nás je to `trial` + `trial_ends_at`
 * převzaté ze Stripu. Až trial doběhne a strhne se platba, Stripe pošle
 * `customer.subscription.updated` se stavem `active` a my přepneme.
 *
 * `trial` dáváme jen STARTu — membershipHelpers pouští trial jen u něj.
 * U placených tierů by `trial` znamenal zamčený přístup.
 *
 * @param {import('stripe').Stripe.Subscription} sub
 * @param {string} tier
 * @returns {{ status: string|null, trialEndsAt: string|null }}
 */
function membershipStateFromSubscription(sub, tier) {
  const stripeStatus = String(sub?.status || '').toLowerCase();

  if (stripeStatus === 'trialing' && String(tier).toUpperCase() === 'START' && sub?.trial_end) {
    return {
      status: 'trial',
      trialEndsAt: new Date(sub.trial_end * 1000).toISOString(),
    };
  }

  return {
    status: mapStripeSubscriptionStatusToMembership(stripeStatus),
    trialEndsAt: null,
  };
}

/**
 * @param {import('stripe').Stripe} stripe
 * @param {import('stripe').Stripe.Checkout.Session} session
 * @returns {Promise<{ tier: string|null, priceId: string|null }>}
 */
async function resolveTierFromCheckoutSession(stripe, session) {
  if (session.subscription) {
    const subId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;
    if (subId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] });
        const priceId = sub?.items?.data?.[0]?.price?.id || null;
        const tier = resolveTierFromStripeSubscription(sub);
        if (tier) return { tier, priceId, subscription: sub };
      } catch (err) {
        console.error('[webhooks/stripe] subscription retrieve failed:', err.message);
      }
    }
  }

  try {
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items.data.price'],
    });
    const priceId = full?.line_items?.data?.[0]?.price?.id || null;
    const tier = resolveTierFromStripePriceId(priceId);
    return { tier, priceId, subscription: null };
  } catch (err) {
    console.error('[webhooks/stripe] checkout session retrieve failed:', err.message);
    return { tier: null, priceId: null, subscription: null };
  }
}

/**
 * @param {import('stripe').Stripe.Event} event
 * @param {string} result
 */
async function finishSkipped(event, result, errorMessage = null) {
  await skipStripeEvent(event.id, result, errorMessage);
}

/**
 * Po aktivaci předplatného založí úlohu na nový týdenní plán.
 *
 * PROČ TADY. 13. 8. 2026 uživatel zaplatil v 16:31, členství se přepnulo na
 * `active` a tím to skončilo — úlohu zakládá jen denní cron ve 04:00 UTC,
 * takže na plán by čekal 11,5 hodiny (a při platbě těsně po cronu skoro den).
 *
 * Zakládá se JEN úloha, nic se negeneruje: Stripe čeká na 200 a webhook, který
 * se zdrží skládáním plánu, dostane timeout a Stripe ho přehraje. Vlastní
 * generování spustí `/api/plan/run-pending-weekly` hned po návratu uživatele
 * na profil, jinak scheduler.
 *
 * Selhání se NESMÍ propsat do odpovědi: členství už je aktivní a opakovaný
 * webhook by ho jen upsertoval znovu. Úlohu doplní cron.
 *
 * @param {string} userId
 * @param {string} eventId
 * @param {string} tier
 */
async function zaloziWeeklyUlohu(userId, eventId, tier) {
  try {
    const vysledek = await produceWeeklyTaskForUser(userId);
    console.log('[webhooks/stripe] weekly task po aktivaci', {
      event_id: eventId,
      user_id: userId,
      tier,
      created: vysledek.created,
      reason: vysledek.reason,
      target_from: vysledek.target_from,
    });
  } catch (e) {
    console.error('[webhooks/stripe] zalozeni weekly ulohy selhalo', {
      event_id: eventId,
      user_id: userId,
      error: e?.message || String(e),
    });
  }
}

/**
 * @param {string} subscriptionId
 * @param {string} customerId
 * @returns {Promise<string|null>}
 */
async function resolveMembershipUserId(subscriptionId, customerId) {
  const { data: bySub } = await supabaseServer
    .from('memberships')
    .select('user_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (bySub?.user_id) return bySub.user_id;

  const { data: byCust } = await supabaseServer
    .from('memberships')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return byCust?.user_id || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    console.error('[webhooks/stripe] Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (e) {
    console.error('[webhooks/stripe] Failed to read body:', e?.message);
    return res.status(400).json({ error: 'Invalid body' });
  }

  let event;
  try {
    const stripe = new Stripe(key);
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'] || '', secret);
  } catch (err) {
    console.error('[webhooks/stripe] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const claim = await claimStripeEvent(event);
  if (claim === 'duplicate') {
    return res.status(200).json({ received: true, duplicate: true });
  }

  const stripe = new Stripe(key);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;

        const { tier, priceId, subscription } = await resolveTierFromCheckoutSession(stripe, session);
        if (!tier) {
          console.error('[webhooks/stripe] checkout.session.completed: unknown price_id', {
            event_id: event.id,
            session_id: session.id,
            price_id: priceId || 'missing',
          });
          // 200, ne 4xx: opakovaným doručením se neznámé price ID nespraví
          // a Stripe by to zkoušel dokola. Musí to ale být VIDĚT — price ID
          // se ukládá a system_health_alerts na to má vlastní hlídku.
          await finishSkipped(
            event,
            'skipped_unknown_price',
            `checkout.session.completed: neznamy price_id ${priceId || 'missing'} (session ${session.id})`
          );
          return res.status(200).json({ received: true, skipped: 'unknown_price' });
        }

        const expectedTier = session.metadata?.expected_tier || null;
        if (!expectedTier) {
          console.error('[webhooks/stripe] checkout.session.completed: missing expected_tier', {
            event_id: event.id,
            session_id: session.id,
          });
          await finishSkipped(event, 'skipped_no_expected_tier');
          return res.status(200).json({ received: true, skipped: 'no_expected_tier' });
        }
        if (!tiersMatch(expectedTier, tier)) {
          console.error('[webhooks/stripe] checkout.session.completed: tier mismatch', {
            event_id: event.id,
            expected_tier: expectedTier,
            resolved_tier: tier,
          });
          await finishSkipped(event, 'skipped_tier_mismatch');
          return res.status(200).json({ received: true, skipped: 'tier_mismatch' });
        }

        let userId = resolveUserIdFromSession(session);
        let usedLegacyEmail = false;
        if (!userId && isStripeLegacyCheckoutAllowed()) {
          const customerEmail = session.customer_email || session.customer_details?.email;
          userId = await getUserIdByEmailLegacy(customerEmail);
          usedLegacyEmail = Boolean(userId);
        }
        if (!userId) {
          console.warn('[webhooks/stripe] checkout.session.completed: no user_id', {
            event_id: event.id,
            legacy_allowed: isStripeLegacyCheckoutAllowed(),
          });
          await finishSkipped(event, 'skipped_no_user_id');
          return res.status(200).json({ received: true, skipped: 'no_user_id' });
        }

        // Když checkout obsahoval trial, subscription přijde jako `trialing`.
        // Pak je členství `trial` a datum konce bereme ze Stripu — ne z vlastního
        // počítání. Jinak by se nám ty dvě pravdy dřív nebo později rozešly.
        const state = subscription
          ? membershipStateFromSubscription(subscription, tier)
          : { status: 'active', trialEndsAt: null };

        const membershipStatus = state.status || 'active';

        const err = await upsertMembership(userId, {
          tier,
          status: membershipStatus,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          trialEndsAt: state.trialEndsAt,
          note: membershipStatus === 'trial'
            ? `Zkušební období spuštěno přes Stripe (${tier})`
            : `Aktivováno po platbě přes Stripe (${tier})`,
        });
        if (err) {
          console.error('[webhooks/stripe] upsertMembership failed:', err.message);
          await failStripeEvent(event.id, 'activation_db_error', err.message);
          return res.status(500).json({ error: 'Database error' });
        }

        console.log('[webhooks/stripe] Membership synced', {
          userId,
          tier,
          status: membershipStatus,
          trial_ends_at: state.trialEndsAt,
          legacy_email_fallback: usedLegacyEmail,
        });

        if (membershipStatus === 'active') {
          await zaloziWeeklyUlohu(userId, event.id, tier);
        }

        await completeStripeEvent(event.id, `${membershipStatus}_${tier}`);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const subscriptionId = sub.id;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null;

        // Tier musíme znát dřív než stav — `trialing` mapujeme na `trial`
        // jen u STARTu, u ostatních tierů by to znamenalo zamčený přístup.
        const tier = resolveTierFromStripeSubscription(sub);
        if (!tier) {
          console.error('[webhooks/stripe] subscription event: unknown price_id', {
            event_id: event.id,
            subscription_id: subscriptionId,
          });
          await finishSkipped(
            event,
            'skipped_unknown_price',
            `${event.type}: neznamy price_id ${sub?.items?.data?.[0]?.price?.id || 'missing'} (subscription ${subscriptionId})`
          );
          break;
        }

        const isDeleted = event.type === 'customer.subscription.deleted';
        const state = isDeleted
          ? { status: 'canceled', trialEndsAt: null }
          : membershipStateFromSubscription(sub, tier);

        if (!state.status) {
          await finishSkipped(event, `skipped_subscription_status_${sub.status}`);
          break;
        }
        const membershipStatus = state.status;

        const expectedTier = sub.metadata?.expected_tier || null;
        if (expectedTier && !tiersMatch(expectedTier, tier)) {
          console.error('[webhooks/stripe] subscription event: tier mismatch', {
            event_id: event.id,
            expected_tier: expectedTier,
            resolved_tier: tier,
          });
          await finishSkipped(event, 'skipped_tier_mismatch');
          break;
        }

        const userId = await resolveMembershipUserId(subscriptionId, customerId);
        if (!userId) {
          await finishSkipped(event, 'skipped_no_membership_match');
          break;
        }

        const err = await upsertMembership(userId, {
          tier,
          status: membershipStatus,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          trialEndsAt: state.trialEndsAt,
        });
        if (err) {
          console.error('[webhooks/stripe] subscription sync failed:', err.message);
          await failStripeEvent(event.id, 'subscription_sync_db_error', err.message);
          return res.status(500).json({ error: 'Database error' });
        }

        // Sem vede přechod trialing → active. Dnešní uživatelé Stripe trial
        // nedostávají (registrace zapisuje trial_ends_at), ale kdyby se to
        // změnilo, aktivace přijde právě touhle větví, ne checkoutem.
        if (membershipStatus === 'active') {
          await zaloziWeeklyUlohu(userId, event.id, tier);
        }

        await completeStripeEvent(event.id, `subscription_${membershipStatus}_${tier}`);
        break;
      }

      default:
        await finishSkipped(event, `ignored_${event.type}`);
        break;
    }
  } catch (err) {
    console.error('[webhooks/stripe] Handler error:', err?.message || err);
    await failStripeEvent(event.id, 'handler_exception', err?.message);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
}
