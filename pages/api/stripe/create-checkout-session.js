// POST /api/stripe/create-checkout-session — autentizovaný Stripe Checkout
import Stripe from 'stripe';
import { supabaseServer } from '../../../lib/supabaseServer';
import { getStripePriceIdForTier } from '../../../lib/stripeTierMapping';
import { isTierCheckoutEnabled } from '../../../lib/salesFeatureFlags';
import { getPublicAppUrl } from '../../../lib/siteUrls';

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

    const appBase = getPublicAppUrl();
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appBase}/profil?checkout=success`,
      cancel_url: `${appBase}/profil?checkout=cancel`,
      metadata: {
        user_id: user.id,
        expected_tier: tier,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          expected_tier: tier,
        },
      },
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
