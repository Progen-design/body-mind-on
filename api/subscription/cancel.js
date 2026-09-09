// POST /api/subscription/cancel — zrušení (nebo obnovení) předplatného
//
// PROČ TENHLE ENDPOINT VZNIKL. Obchodní podmínky (bod 9) i text u trialu
// v registraci slibují „předplatné můžeš kdykoli zrušit ve svém profilu".
// Do 9. 9. 2026 zrušení NEEXISTOVALO — ani API, ani UI, ani Stripe portál.
// Slibovali jsme lidem něco, co se osmý den mění ve strženou platbu.
//
// ZRUŠENÍ = `cancel_at_period_end`, NE okamžité storno. Podmínky (bod 9)
// říkají „zrušení je účinné ke konci už zaplaceného období; do té doby ti
// služba běží dál" — okamžité `subscriptions.cancel()` by uživatele
// o zaplacené dny připravilo. V trialu tím zároveň platí bod 7: zruší-li se
// před koncem zkušebního období, první platba nikdy nepřijde.
//
// STAV V DATABÁZI SE TADY NEPŘEPISUJE. Změnu potvrdí Stripe webhookem
// `customer.subscription.updated` (api/webhooks/stripe.js) — jeden zdroj
// pravdy. Kdyby si ho endpoint zapsal sám, máme dvě místa, která si můžou
// odporovat, kdykoli Stripe operaci odmítne.
import Stripe from 'stripe';
import { supabaseServer } from '../../lib/supabaseServer.js';

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

    // `obnovit: true` vrátí zrušení zpět, dokud období neskončilo. Bez toho
    // by omyl znamenal e-mail na podporu a ruční zásah ve Stripe.
    const obnovit = req.body?.obnovit === true;

    const { data: membership, error: mErr } = await supabaseServer
      .from('memberships')
      .select('status, tier, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (mErr) {
      console.error('[subscription/cancel] memberships:', mErr.message);
      return res.status(500).json({ error: 'Nepodařilo se načíst předplatné.' });
    }

    if (!membership?.stripe_subscription_id) {
      // Účet bez Stripe subscription nemá co rušit — typicky ruční členství
      // nebo účet z doby před platbami. Není to chyba uživatele.
      return res.status(409).json({
        error: 'K tvému účtu není vedené aktivní předplatné. Napiš nám na info@bodyandmindon.cz.',
      });
    }

    const stripe = new Stripe(stripeKey);

    let subscription;
    try {
      subscription = await stripe.subscriptions.update(membership.stripe_subscription_id, {
        cancel_at_period_end: !obnovit,
      });
    } catch (err) {
      console.error('[subscription/cancel] stripe:', err?.message || err);
      return res.status(502).json({
        error: obnovit
          ? 'Předplatné se nepodařilo obnovit. Zkus to prosím za chvíli.'
          : 'Předplatné se nepodařilo zrušit. Zkus to prosím za chvíli.',
      });
    }

    const konecObdobi = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    console.info('[subscription/cancel] hotovo', {
      user_id: user.id,
      subscription_id: subscription.id,
      cancel_at_period_end: subscription.cancel_at_period_end,
    });

    return res.status(200).json({
      ok: true,
      zruseno: subscription.cancel_at_period_end === true,
      // Do kdy služba běží dál. UI z toho skládá větu, ať člověk nemusí
      // hádat, jestli o přístup přišel hned.
      bezi_do: konecObdobi,
      stav: subscription.status,
    });
  } catch (err) {
    console.error('[subscription/cancel]', err);
    return res.status(500).json({ error: 'Nepodařilo se zpracovat požadavek.' });
  }
}
