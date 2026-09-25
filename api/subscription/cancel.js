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
// STAV V DATABÁZI ZAPISUJE JEN syncSubscription (lib/stripeSync.js) — čerstvě
// ze Stripe, jeden zdroj pravdy. Endpoint ho volá po úspěchu, webhook
// `customer.subscription.updated` totéž zopakuje.
//
// NAPLÁNOVANÝ DOWNGRADE (ON CLUB → START, /api/subscription/change-tier) drží
// subscription schedule. Stripe pak subscriptions.update({ cancel_at_period_end })
// odmítne („managed by the subscription schedule"). Při rušení se proto schedule
// nejdřív uvolní — naplánovaná změna tarifu tím zanikne, což je při rušení
// v pořádku. Obnovení (obnovit: true) se schedule netýká.
import Stripe from 'stripe';
import { supabaseServer } from '../../lib/supabaseServer.js';
import { konecObdobiSubscription } from '../../lib/stripeSubscriptionStatus.js';
import { uvolniSchedule } from '../../lib/zmenaTarifu.js';
import { syncSubscription } from '../../lib/stripeSync.js';

/** Skutečné závislosti. Test si podstrčí vlastní (lib/__tests__/zruseniSeSchedule.test.mjs). */
export const vychoziZavislosti = {
  async overUzivatele(token) {
    const { data: { user }, error } = await supabaseServer.auth.getUser(token);
    return error ? null : user;
  },
  async nactiClenstvi(userId) {
    return supabaseServer
      .from('memberships')
      .select('status, tier, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();
  },
  stripe: (klic) => new Stripe(klic),
  /** Zrcadlo do DB (subscriptions, memberships) — jediný zápis stavu. */
  sync: (stripe, subId) => syncSubscription(stripe, subId),
};

export function vytvorHandler(zavislosti = vychoziZavislosti) {
  const z = { ...vychoziZavislosti, ...zavislosti };

  return async function handler(req, res) {
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

      const user = await z.overUzivatele(token);
      if (!user?.id) return res.status(401).json({ error: 'Neplatná session' });

      // `obnovit: true` vrátí zrušení zpět, dokud období neskončilo. Bez toho
      // by omyl znamenal e-mail na podporu a ruční zásah ve Stripe.
      const obnovit = req.body?.obnovit === true;

      const { data: membership, error: mErr } = await z.nactiClenstvi(user.id);

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

      const stripe = z.stripe(stripeKey);

      let subscription;
      try {
        if (!obnovit) {
          // Naplánovaný downgrade by zrušení zablokoval — schedule pryč.
          const aktualni = await stripe.subscriptions.retrieve(membership.stripe_subscription_id);
          const uvolneno = await uvolniSchedule(stripe, aktualni);
          if (uvolneno) {
            console.info('[subscription/cancel] schedule uvolněn před zrušením', { user_id: user.id, schedule_id: uvolneno });
          }
        }
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

      // DB srovná sync (cancel_at_period_end do subscriptions). Chyba nevadí:
      // změna ve Stripe proběhla, webhook i rekonciliace ji dorovnají.
      try {
        await z.sync(stripe, subscription.id);
      } catch (err) {
        console.error('[subscription/cancel] sync:', err?.message || err);
      }

      // stripe-node v20 (API basil): období je na items.data[0], ne na subscription.
      const konecObdobi = konecObdobiSubscription(subscription);

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
  };
}

export default vytvorHandler();
