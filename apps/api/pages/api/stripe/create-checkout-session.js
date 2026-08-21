// POST /api/stripe/create-checkout-session — autentizovaný Stripe Checkout
import Stripe from 'stripe';
import { supabaseServer } from '../../../lib/supabaseServer';
import { getStripePriceIdForTier } from '../../../lib/stripeTierMapping';
import { isTierCheckoutEnabled } from '../../../lib/salesFeatureFlags';
import { getPublicAppUrl } from '../../../lib/siteUrls';
import { trialDaysForCheckout } from '../../../lib/trialEligibility';

const ALLOWED_TIERS = new Set(['START', 'ON_CLUB', 'VIP']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Platby nejsou nakonfigurovány.' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user?.id) return res.status(401).json({ error: 'Neplatná session' });

    const tier = String(req.body?.tier || req.body?.program || '').toUpperCase();
    if (!ALLOWED_TIERS.has(tier)) {
      return res.status(400).json({ error: 'Neplatný produkt.' });
    }

    if (!isTierCheckoutEnabled(tier)) {
      return res.status(403).json({ error: 'Tento produkt zatím není k dispozici. Připravujeme — přidej se na waitlist.' });
    }

    const priceId = getStripePriceIdForTier(tier);
    if (!priceId) {
      return res.status(500).json({ error: 'Platby pro tento produkt nejsou nakonfigurovány.' });
    }

    // Nárok na 7 dní zdarma se posuzuje podle stávajícího členství.
    // Kdo už trial vyčerpal (nebo měl Stripe subscription), platí rovnou.
    const { data: membership } = await supabaseServer
      .from('memberships')
      .select('status, trial_ends_at, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const trialDays = trialDaysForCheckout(tier, membership);

    const appBase = getPublicAppUrl();
    const stripe = new Stripe(stripeKey);

    const subscriptionData = {
      metadata: {
        user_id: user.id,
        expected_tier: tier,
      },
    };
    if (trialDays) {
      subscriptionData.trial_period_days = trialDays;
      // Když trial doběhne a karta selže, subscription se zruší — nezůstane
      // viset v past_due donekonečna.
      subscriptionData.trial_settings = {
        end_behavior: { missing_payment_method: 'cancel' },
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: user.id,
      customer_email: user.email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      // Kartu/peněženku chceme vždy — i u trialu. To je celý smysl varianty B.
      payment_method_collection: 'always',
      success_url: `${appBase}/profil?checkout=success`,
      cancel_url: `${appBase}/profil?checkout=cancel`,
      metadata: {
        user_id: user.id,
        expected_tier: tier,
      },
      subscription_data: subscriptionData,
    });

    console.info('[stripe/create-checkout-session] created', {
      user_id: user.id,
      tier,
      trial_days: trialDays || 0,
    });

    if (!session?.url) {
      return res.status(500).json({ error: 'Checkout session se nepodařilo vytvořit.' });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[stripe/create-checkout-session] error:', err?.message || err);
    return res.status(500).json({ error: 'Checkout se nepodařilo spustit.' });
  }
}
