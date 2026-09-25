// POST /api/webhooks/stripe – Stripe webhook (checkout, subscription.*, invoice.paid / payment_failed)
// Stav předplatného zapisuje JEN syncSubscription (lib/stripeSync.js) — Stripe je zdroj pravdy.
// V produkci musí být nastaveno STRIPE_SECRET_KEY a STRIPE_WEBHOOK_SECRET.

import Stripe from 'stripe';
import { supabaseServer } from '../../lib/supabaseServer.js';
import {
  claimStripeEvent,
  completeStripeEvent,
  failStripeEvent,
  skipStripeEvent,
} from '../../lib/stripeEventStore.js';
import { isStripeLegacyCheckoutAllowed } from '../../lib/stripeLegacyCheckout.js';
import { syncSubscription } from '../../lib/stripeSync.js';
import { tiersMatch } from '../../lib/stripeTierMapping.js';
import { produceWeeklyTaskForUser } from '../../lib/weeklyPlanProducer.js';
import { calendarDateIsoInPrague, addCalendarDaysIsoPrague } from '../../lib/czechCalendar.js';
import { zpracujInvoicePaid } from '../../lib/potvrzeniSmlouvy.js';
import { posliTransakcniEmail } from '../../lib/smlouvaEmaily.js';
import { isSyntheticEmail } from '../../lib/lifecycleEmailRules.js';

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

// membershipStateFromSubscription žije v lib/stripeSubscriptionStatus.js (volá ho lib/stripeSync.js).
export { membershipStateFromSubscription } from '../../lib/stripeSubscriptionStatus.js';

/**
 * @param {import('stripe').Stripe.Event} event
 * @param {string} result
 */
async function finishSkipped(event, result, errorMessage = null) {
  await skipStripeEvent(event.id, result, errorMessage);
}

/**
 * Sedm dní zdarma musí být opravdu sedm — docs/DALSI_KROK.md 9.7.
 *
 * PROBLÉM. Plán se vyrábí při registraci s `valid_from` = den registrace,
 * ale odemyká se až checkoutem (registrace končí ve stavu `pending_payment`,
 * trial drží Stripe přes `trial_period_days`). Kdo odemkne třetí den, dostal
 * ze slíbených sedmi dní reálně čtyři; kdo odemkl po deseti dnech, odemykal
 * plán, který už neplatil (změřeno 7. 9. 2026 na účtu, který se registroval
 * 3. 8. a zaplatil 13. 8.).
 *
 * ŘEŠENÍ. Při odemčení se první plán POSUNE na den odemčení. Je to jen posun
 * okna `valid_from`/`valid_until`, obsah se NEGENERUJE znovu — nové generování
 * by uživateli vyměnilo jídelníček, na který se už mohl dívat v e-mailu.
 *
 * Posouvá se jen tehdy, když jsou splněné VŠECHNY podmínky:
 *   - plán je aktivní a je to nejstarší plán uživatele (ten z registrace),
 *   - `valid_from` je před dneškem (registrace a odemčení týž den = nic
 *     se neděje, což je dnes většina účtů),
 *   - uživatel na něm ještě nic neodškrtal.
 *
 * Poslední podmínka je opatrnost, ne nutnost: `daily_activity_completions`
 * se váže na `plan_id` + `plan_day` (index dne v plánu), NE na kalendářní
 * datum — ověřeno ve schématu. Posun oken tedy záznamy neosiří. Ale den 1
 * by se přesunul na jiné datum a člověk, který si už něco odškrtal, by to
 * viděl jinde, než to udělal. Radši mu plán necháme být.
 *
 * Kotva mřížky z bodu 9.6 (`valid_from` nejstaršího plánu) se tím u nového
 * uživatele stává dnem odemčení — obě změny do sebe zapadají.
 *
 * Selhání se NESMÍ propsat do odpovědi: členství už je aktivní, Stripe čeká
 * na 200 a opakovaný webhook by ho jen upsertoval znovu.
 *
 * @param {string} userId
 * @param {string} eventId
 * @returns {Promise<void>}
 */
async function prekotviPrvniPlanNaOdemceni(userId, eventId) {
  try {
    const dnes = calendarDateIsoInPrague(new Date());

    const { data: plany, error: chybaPlanu } = await supabaseServer
      .from('ai_generated_plans')
      .select('id, valid_from, valid_until, is_active')
      .eq('user_id', userId)
      .order('valid_from', { ascending: true })
      .limit(1);
    if (chybaPlanu) throw new Error(`ai_generated_plans: ${chybaPlanu.message}`);

    const prvni = (plany || [])[0];
    if (!prvni) return;

    const od = String(prvni.valid_from || '').split('T')[0];
    if (!prvni.is_active || !od || od >= dnes) {
      console.log('[webhooks/stripe] prekotveni preskoceno', {
        event_id: eventId, user_id: userId, plan_id: prvni.id,
        duvod: !prvni.is_active ? 'neaktivni' : 'uz sedi nebo je v budoucnu',
        valid_from: od, dnes,
      });
      return;
    }

    const { count, error: chybaDokonceni } = await supabaseServer
      .from('daily_activity_completions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', prvni.id);
    if (chybaDokonceni) throw new Error(`daily_activity_completions: ${chybaDokonceni.message}`);

    if ((count ?? 0) > 0) {
      console.log('[webhooks/stripe] prekotveni preskoceno — uzivatel uz ma odskrtano', {
        event_id: eventId, user_id: userId, plan_id: prvni.id, dokonceni: count,
      });
      return;
    }

    const doIso = addCalendarDaysIsoPrague(dnes, 6);
    const { error: chybaUpdate } = await supabaseServer
      .from('ai_generated_plans')
      .update({ valid_from: dnes, valid_until: doIso, updated_at: new Date().toISOString() })
      .eq('id', prvni.id);
    if (chybaUpdate) throw new Error(`update planu: ${chybaUpdate.message}`);

    console.log('[webhooks/stripe] prvni plan prekotven na den odemceni', {
      event_id: eventId, user_id: userId, plan_id: prvni.id,
      z: `${od} - ${String(prvni.valid_until || '').split('T')[0]}`,
      na: `${dnes} - ${doIso}`,
    });
  } catch (e) {
    console.error('[webhooks/stripe] prekotveni prvniho planu selhalo', {
      event_id: eventId, user_id: userId, error: e?.message || String(e),
    });
  }
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

/**
 * E-mail uživatele pro potvrzení smlouvy. Testovací adresy → null (nic se nepošle).
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function emailProPotvrzeni(userId) {
  const { data, error } = await supabaseServer.auth.admin.getUserById(userId);
  const email = data?.user?.email || null;
  if (error || !email || isSyntheticEmail(email)) return null;
  return email;
}

/** ID subscription z objektu události (checkout session / subscription / invoice). */
function subscriptionIdZUdalosti(event) {
  const o = event.data?.object || {};
  if (event.type.startsWith('customer.subscription.')) return o.id || null;
  if (event.type.startsWith('invoice.')) {
    const s = o.parent?.subscription_details?.subscription ?? o.subscription ?? null;
    return typeof s === 'string' ? s : s?.id || null;
  }
  const s = o.subscription;
  return typeof s === 'string' ? s : s?.id || null;
}

/** Události, po kterých se stav předplatného srovná se Stripe (syncSubscription). */
const SYNC_UDALOSTI = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

/**
 * Webhook s vyměnitelnými závislostmi (testy: atrapa Stripe API a sync).
 * Podpis se ověřuje vždy skutečně — statickým Stripe.webhooks.
 */
export function vytvorWebhook(zavislosti = {}) {
  const noveStripe = zavislosti.stripe || ((klic) => new Stripe(klic));
  const sync = zavislosti.sync || syncSubscription;

  return async function handler(req, res) {
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
      event = Stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'] || '', secret);
    } catch (err) {
      console.error('[webhooks/stripe] Signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const claim = await claimStripeEvent(event);
    if (claim === 'duplicate') {
      return res.status(200).json({ received: true, duplicate: true });
    }

    if (!SYNC_UDALOSTI.has(event.type)) {
      await finishSkipped(event, `ignored_${event.type}`);
      return res.status(200).json({ received: true });
    }

    const stripe = noveStripe(key);

    try {
      // ------------------------------------------------ checkout: kdo zaplatil
      let userIdHint = null;
      const jeCheckout = event.type === 'checkout.session.completed';
      const ocekavanyTier = jeCheckout ? event.data.object?.metadata?.expected_tier || null : null;
      if (jeCheckout) {
        const session = event.data.object;
        // Checkout bez expected_tier nevznikl u nás (create-checkout-session ho
        // vždy posílá) — neaktivovat.
        if (!ocekavanyTier) {
          console.error('[webhooks/stripe] checkout.session.completed: missing expected_tier', { event_id: event.id, session_id: session.id });
          await finishSkipped(event, 'skipped_no_expected_tier');
          return res.status(200).json({ received: true, skipped: 'no_expected_tier' });
        }
        userIdHint = resolveUserIdFromSession(session);
        if (!userIdHint && isStripeLegacyCheckoutAllowed()) {
          userIdHint = await getUserIdByEmailLegacy(session.customer_email || session.customer_details?.email);
        }
        if (!userIdHint) {
          console.warn('[webhooks/stripe] checkout.session.completed: no user_id', { event_id: event.id, legacy_allowed: isStripeLegacyCheckoutAllowed() });
          await finishSkipped(event, 'skipped_no_user_id');
          return res.status(200).json({ received: true, skipped: 'no_user_id' });
        }
      }

      const subId = subscriptionIdZUdalosti(event);
      if (!subId) {
        await finishSkipped(event, 'skipped_no_subscription');
        return res.status(200).json({ received: true, skipped: 'no_subscription' });
      }

      // STAV PŘEDPLATNÉHO ZAPISUJE JEN syncSubscription — čerstvě ze Stripe,
      // do subscriptions, memberships i vouchers (lib/stripeSync.js).
      let report;
      try {
        report = await sync(stripe, subId, { userIdHint });
      } catch (err) {
        console.error('[webhooks/stripe] sync selhal:', err?.message || err, { event_id: event.id, subscription_id: subId });
        await failStripeEvent(event.id, 'sync_db_error', err?.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[webhooks/stripe] sync', {
        event_id: event.id,
        type: event.type,
        subscription_id: subId,
        user_id: report.userId,
        tier: report.tier,
        status: report.membershipStatus,
        zmeny: Object.keys(report.zmeny),
        alerty: report.alerty.map((a) => a.kod),
      });

      // NEZNÁMÁ CENA: sync ji zapsal jako UNKNOWN a poslal alert. Událost se
      // navíc označí skipped_unknown_price i s price_id — z toho čte
      // system_health_alerts (stripe_udalost_zahozena). 200: opakování nepomůže.
      if (!report.tier && event.type !== 'invoice.paid') {
        await finishSkipped(
          event,
          'skipped_unknown_price',
          `${event.type}: neznamy price_id ${report.priceId || 'missing'} (subscription ${subId})`
        );
        return res.status(200).json({ received: true, skipped: 'unknown_price' });
      }

      // TARIF Z CENY ≠ OČEKÁVANÝ (metadata checkoutu / subscription): sync
      // membership nezměnil (stripe_tier_nesedi) a nic se neaktivuje.
      const nesedi = report.alerty.some((a) => a.kod === 'stripe_tier_nesedi')
        || (jeCheckout && report.tier && !tiersMatch(ocekavanyTier, report.tier));
      if (nesedi) {
        console.error('[webhooks/stripe] tier mismatch', { event_id: event.id, expected_tier: ocekavanyTier, resolved_tier: report.tier });
        await finishSkipped(event, 'skipped_tier_mismatch');
        return res.status(200).json({ received: true, skipped: 'tier_mismatch' });
      }

      const aktivace = report.userId && (report.membershipStatus === 'active' || report.membershipStatus === 'trial');

      // ------------------------------------------------ vedlejší efekty (ne stav)
      if (event.type === 'checkout.session.completed' && aktivace) {
        // ODEMČENÍ. Tady a nikde jinde — tenhle event je ten okamžik, kdy
        // uživateli začíná sedm dní zdarma (docs/DALSI_KROK.md 9.7). Plán se
        // posune na den odemčení; trialing → active o týden později už ne.
        await prekotviPrvniPlanNaOdemceni(report.userId, event.id);
      }
      if ((event.type === 'checkout.session.completed' || event.type === 'customer.subscription.updated')
        && report.userId && report.membershipStatus === 'active') {
        // Přechod trialing → active (první platba) nebo rovnou aktivní Checkout.
        await zaloziWeeklyUlohu(report.userId, event.id, report.tier);
      }

      if (event.type === 'invoice.paid') {
        // Potvrzení smlouvy (§ 1824a OZ) po PRVNÍ placené faktuře.
        // POZOR: event musí být zapnutý u webhook endpointu ve Stripe Dashboardu.
        const vysledek = await zpracujInvoicePaid(event.data.object, {
          stripe,
          najdiUzivatele: resolveMembershipUserId,
          emailUzivatele: emailProPotvrzeni,
          posliEmail: posliTransakcniEmail,
        });
        if ('chyba' in vysledek) {
          console.error('[webhooks/stripe] invoice.paid:', vysledek.chyba, { event_id: event.id });
          await failStripeEvent(event.id, vysledek.chyba);
          return res.status(500).json({ error: 'Contract confirmation failed' });
        }
        await completeStripeEvent(event.id, 'vysledek' in vysledek ? vysledek.vysledek : vysledek.preskoceno);
        return res.status(200).json({ received: true });
      }

      if (!report.userId) {
        await finishSkipped(event, 'skipped_no_membership_match');
        return res.status(200).json({ received: true, skipped: 'no_user' });
      }
      await completeStripeEvent(event.id, `sync_${report.membershipStatus || report.stripeStatus || 'x'}_${report.tier || 'UNKNOWN'}`);
    } catch (err) {
      console.error('[webhooks/stripe] Handler error:', err?.message || err);
      await failStripeEvent(event.id, 'handler_exception', err?.message);
      return res.status(500).json({ error: 'Webhook handler failed' });
    }

    return res.status(200).json({ received: true });
  };
}

export default vytvorWebhook();
