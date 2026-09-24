// POST /api/stripe/create-checkout-session — autentizovaný Stripe Checkout
import Stripe from 'stripe';
import { supabaseServer } from '../../lib/supabaseServer.js';
import { getStripePriceIdForTier } from '../../lib/stripeTierMapping.js';
import { isTierCheckoutEnabled } from '../../lib/salesFeatureFlags.js';
import { getPublicAppUrl } from '../../lib/siteUrls.js';
import { stripeTrialProCheckout } from '../../lib/trialEligibility.js';
import { poukazUzivatele } from '../../lib/poukazy.js';

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

    // TRIAL: kdo platí během svého trialu (7 dní, s poukazem 30), nepřijde
    // o zbývající dny — Stripe dostane trial_end = konec trialu a první
    // platba je až po něm. Nový uživatel bez členství 7 dní, jinak hned.
    // Jedno rozhodnutí pro všechny: stripeTrialProCheckout (lib/trialEligibility.js).
    const trial = stripeTrialProCheckout(tier, membership);
    // Poukaz jen do metadat (dohledatelnost); délku trialu nese trial_ends_at.
    const poukaz = tier === 'START' ? await poukazUzivatele(supabaseServer, user.id) : null;

    const appBase = getPublicAppUrl();
    const stripe = new Stripe(stripeKey);

    const subscriptionData = {
      metadata: {
        user_id: user.id,
        expected_tier: tier,
        ...(poukaz ? { voucher_code: poukaz.code } : {}),
      },
      ...trial,
    };

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
      trial_days: trial.trial_period_days || 0,
      trial_end: trial.trial_end || null,
      voucher: poukaz ? true : false,
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
