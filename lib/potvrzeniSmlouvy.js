/**
 * POTVRZENÍ SMLOUVY PO PRVNÍ PLACENÉ FAKTUŘE (§ 1824a OZ).
 *
 * Volá se z webhooku `invoice.paid` (api/webhooks/stripe.js). E-mail odejde
 * jen tehdy, když:
 *   - amount_paid > 0 (trialová faktura za 0 Kč se nepočítá),
 *   - billing_reason je subscription_create nebo subscription_cycle,
 *   - je to PRVNÍ placená faktura subscription (další měsíce nic neposílají).
 *
 * Idempotence per event.id drží stripe_events (claimStripeEvent) — opakované
 * doručení téže události se sem vůbec nedostane. Selže-li odeslání, webhook
 * vrátí 500 a Stripe to zkusí znovu; e-mail tedy odejde nejvýš jednou úspěšně.
 *
 * Závislosti se injektují, testy běží s atrapou Stripe.
 */
import {
  LHUTA_ODSTOUPENI_DNI,
  datumCesky,
  jePrvniPlacenaFaktura,
  subscriptionIdFaktury,
  zaplacenoMs,
} from './odstoupeniOdSmlouvy.js';
import { emailPotvrzeniSmlouvy } from './smlouvaEmaily.js';
import { konecObdobiSubscription } from './stripeSubscriptionStatus.js';
import { resolveTierFromStripeSubscription } from './stripeTierMapping.js';

const MS_DEN = 24 * 60 * 60 * 1000;

/**
 * @param {any} invoice event.data.object z invoice.paid
 * @param {{
 *   stripe: any,
 *   najdiUzivatele: (subscriptionId: string, customerId: string|null) => Promise<string|null>,
 *   emailUzivatele: (userId: string) => Promise<string|null>,
 *   posliEmail: (to: string, obsah: {subject:string,text:string,html:string}) => Promise<{ok:boolean, error_code?:string}>,
 * }} z
 * @returns {Promise<{ vysledek: string } | { preskoceno: string } | { chyba: string }>}
 */
export async function zpracujInvoicePaid(invoice, z) {
  if (!(Number(invoice?.amount_paid) > 0)) return { preskoceno: 'skipped_invoice_zero' };
  if (!['subscription_create', 'subscription_cycle'].includes(invoice?.billing_reason)) {
    return { preskoceno: `skipped_invoice_reason_${invoice?.billing_reason || 'none'}` };
  }
  const subscriptionId = subscriptionIdFaktury(invoice);
  if (!subscriptionId) return { preskoceno: 'skipped_invoice_no_subscription' };

  if (!(await jePrvniPlacenaFaktura(invoice, z.stripe))) return { preskoceno: 'skipped_not_first_paid_invoice' };

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null;
  const userId = await z.najdiUzivatele(subscriptionId, customerId);
  if (!userId) return { preskoceno: 'skipped_no_membership_match' };

  const email = await z.emailUzivatele(userId);
  if (!email) return { preskoceno: 'skipped_no_email' };

  const subscription = await z.stripe.subscriptions.retrieve(subscriptionId);
  const tarif = resolveTierFromStripeSubscription(subscription) || 'START';
  const dalsiPlatbaIso = konecObdobiSubscription(subscription);
  const lhutaDoMs = zaplacenoMs(invoice) + LHUTA_ODSTOUPENI_DNI * MS_DEN;

  const obsah = emailPotvrzeniSmlouvy({
    tarif,
    cenaKc: Math.round(Number(invoice.amount_paid) / 100),
    dalsiPlatba: dalsiPlatbaIso ? datumCesky(Date.parse(dalsiPlatbaIso)) : null,
    lhutaDo: datumCesky(lhutaDoMs),
  });

  const odeslano = await z.posliEmail(email, obsah);
  if (!odeslano.ok) return { chyba: `contract_email_${odeslano.error_code || 'failed'}` };
  return { vysledek: `contract_confirmation_sent_${tarif}` };
}
