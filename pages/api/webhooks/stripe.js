// POST /api/webhooks/stripe – Stripe webhook (checkout.session.completed, subscription events)
// V produkci musí být nastaveno STRIPE_SECRET_KEY a STRIPE_WEBHOOK_SECRET.

import Stripe from 'stripe';
import { supabaseServer } from '../../../lib/supabaseServer';

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
 * Najde user_id podle e-mailu z body_metrics (poslední záznam).
 */
async function getUserIdByEmail(email) {
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
 * Aktivuje předplatné START pro uživatele (po úspěšné platbě).
 */
async function activateMembership(userId, stripeCustomerId = null, stripeSubscriptionId = null) {
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    tier: 'START',
    status: 'active',
    started_at: now,
    trial_ends_at: null,
    notes: 'Aktivováno po platbě přes Stripe',
    updated_at: now,
  };
  if (stripeCustomerId) row.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId) row.stripe_subscription_id = stripeSubscriptionId;

  const { error } = await supabaseServer
    .from('memberships')
    .upsert([row], { onConflict: 'user_id' });
  return error;
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
    console.error('[webhooks/stripe] Failed to read body:', e);
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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerEmail = session.customer_email || session.customer_details?.email;
        const clientReferenceId = session.client_reference_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;

        let userId = clientReferenceId || null;
        if (!userId && customerEmail) {
          userId = await getUserIdByEmail(customerEmail);
        }
        if (!userId) {
          console.warn('[webhooks/stripe] checkout.session.completed: no user_id (client_reference_id or email)', { customerEmail });
          return res.status(200).json({ received: true });
        }

        const err = await activateMembership(userId, customerId, subscriptionId);
        if (err) {
          console.error('[webhooks/stripe] activateMembership failed:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        console.log('[webhooks/stripe] Membership activated for user', userId);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const subscriptionId = sub.id;
        const status = sub.status;
        const customerId = sub.customer;

        if (status === 'active' || status === 'trialing') {
          // Najít user_id podle stripe_subscription_id nebo stripe_customer_id
          const { data: bySub } = await supabaseServer
            .from('memberships')
            .select('user_id')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();
          if (bySub?.user_id) {
            await activateMembership(bySub.user_id, customerId, subscriptionId);
            break;
          }
          const { data: byCust } = await supabaseServer
            .from('memberships')
            .select('user_id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          if (byCust?.user_id) {
            await activateMembership(byCust.user_id, customerId, subscriptionId);
            break;
          }
        } else if (event.type === 'customer.subscription.deleted' || status === 'canceled' || status === 'unpaid') {
          const { data: row } = await supabaseServer
            .from('memberships')
            .select('user_id')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();
          if (row?.user_id) {
            const now = new Date().toISOString();
            await supabaseServer.from('memberships').update({
              status: 'canceled',
              updated_at: now,
            }).eq('user_id', row.user_id);
          }
        }
        break;
      }

      default:
        // Ostatní události ignorujeme
        break;
    }
  } catch (err) {
    console.error('[webhooks/stripe] Handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
}
