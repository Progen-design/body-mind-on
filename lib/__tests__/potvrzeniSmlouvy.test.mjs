/**
 * Potvrzení smlouvy po první placené faktuře (webhook invoice.paid).
 * Jen atrapa Stripe — Stripe v produkci běží na LIVE klíčích.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { zpracujInvoicePaid } from '../potvrzeniSmlouvy.js';
import { emailPotvrzeniSmlouvy, URL_OBCHODNI_PODMINKY } from '../smlouvaEmaily.js';

const PAID_AT = Date.parse('2026-09-25T10:00:00Z') / 1000;

const faktura = (extra = {}) => ({
  id: 'in_1',
  status: 'paid',
  amount_paid: 59900,
  billing_reason: 'subscription_cycle',
  customer: 'cus_1',
  created: PAID_AT - 60,
  status_transitions: { paid_at: PAID_AT },
  parent: { subscription_details: { subscription: 'sub_1' } },
  ...extra,
});

function atrapa({ ostatniFaktury = [], email = 'jan@seznam.cz', uzivatel = 'user-1', odeslani = { ok: true } } = {}) {
  const zaznam = { emaily: [], list: [] };
  const z = {
    stripe: {
      invoices: {
        async list(p) { zaznam.list.push(p); return { data: ostatniFaktury }; },
      },
      subscriptions: {
        async retrieve() {
          return { id: 'sub_1', status: 'active', items: { data: [{ price: { id: 'price_start_test' }, current_period_end: PAID_AT + 30 * 86400 }] } };
        },
      },
    },
    najdiUzivatele: async () => uzivatel,
    emailUzivatele: async () => email,
    posliEmail: async (to, obsah) => { zaznam.emaily.push({ to, obsah }); return odeslani; },
  };
  return { z, zaznam };
}

process.env.STRIPE_PRICE_START_MONTHLY = 'price_start_test';

test('první placená faktura (po trialu, subscription_cycle) → potvrzení odejde', async () => {
  const trialova = faktura({ id: 'in_0', amount_paid: 0, billing_reason: 'subscription_create', status_transitions: { paid_at: PAID_AT - 7 * 86400 } });
  const { z, zaznam } = atrapa({ ostatniFaktury: [trialova, faktura()] });
  const v = await zpracujInvoicePaid(faktura(), z);
  assert.deepEqual(v, { vysledek: 'contract_confirmation_sent_START' });
  assert.equal(zaznam.emaily.length, 1);
  assert.equal(zaznam.emaily[0].to, 'jan@seznam.cz');
  assert.equal(zaznam.emaily[0].obsah.subject, 'Předplatné START je aktivní');
  assert.deepEqual(zaznam.list[0], { subscription: 'sub_1', status: 'paid', limit: 100 });
});

test('subscription_create s platbou (bez trialu) → taky potvrzení', async () => {
  const { z, zaznam } = atrapa();
  const v = await zpracujInvoicePaid(faktura({ billing_reason: 'subscription_create' }), z);
  assert.ok('vysledek' in v);
  assert.equal(zaznam.emaily.length, 1);
});

test('druhá placená faktura (další měsíc) → nic', async () => {
  const prvni = faktura({ id: 'in_1', status_transitions: { paid_at: PAID_AT } });
  const druha = faktura({ id: 'in_2', status_transitions: { paid_at: PAID_AT + 30 * 86400 } });
  const { z, zaznam } = atrapa({ ostatniFaktury: [druha, prvni] });
  assert.deepEqual(await zpracujInvoicePaid(druha, z), { preskoceno: 'skipped_not_first_paid_invoice' });
  assert.equal(zaznam.emaily.length, 0);
});

test('faktura za 0 Kč (trial) nebo jiný billing_reason → nic, Stripe se ani neptá', async () => {
  const { z, zaznam } = atrapa();
  assert.deepEqual(await zpracujInvoicePaid(faktura({ amount_paid: 0 }), z), { preskoceno: 'skipped_invoice_zero' });
  assert.deepEqual(await zpracujInvoicePaid(faktura({ billing_reason: 'manual' }), z), { preskoceno: 'skipped_invoice_reason_manual' });
  assert.deepEqual(await zpracujInvoicePaid(faktura({ billing_reason: 'subscription_update' }), z), { preskoceno: 'skipped_invoice_reason_subscription_update' });
  assert.equal(zaznam.list.length, 0);
  assert.equal(zaznam.emaily.length, 0);
});

test('bez uživatele / testovací e-mail → přeskočit, ne chyba', async () => {
  const a = atrapa({ uzivatel: null });
  assert.deepEqual(await zpracujInvoicePaid(faktura(), a.z), { preskoceno: 'skipped_no_membership_match' });
  const b = atrapa({ email: null });
  assert.deepEqual(await zpracujInvoicePaid(faktura(), b.z), { preskoceno: 'skipped_no_email' });
});

test('selhání odeslání → chyba (webhook vrátí 500 a Stripe to zopakuje)', async () => {
  const { z } = atrapa({ odeslani: { ok: false, error_code: 'send_timeout' } });
  assert.deepEqual(await zpracujInvoicePaid(faktura(), z), { chyba: 'contract_email_send_timeout' });
});

test('obsah: tarif, cena, další platba, jak zrušit, jak odstoupit, odkaz na podmínky', () => {
  const { text, html } = emailPotvrzeniSmlouvy({ tarif: 'START', cenaKc: 599, dalsiPlatba: '25. 10. 2026', lhutaDo: '9. 10. 2026' });
  assert.match(text, /Tarif: START/);
  assert.match(text, /Cena: 599 Kč měsíčně/);
  assert.match(text, /Další platba: 25\. 10\. 2026/);
  assert.match(text, /Jak zrušit: .*Zrušit předplatné/);
  assert.match(text, /Jak odstoupit do 14 dnů: do 9\. 10\. 2026/);
  assert.match(text, /poměrné části/);
  assert.ok(text.includes(URL_OBCHODNI_PODMINKY));
  assert.equal(URL_OBCHODNI_PODMINKY, 'https://bodyandmindon.cz/obchodni-podminky');
  assert.ok(html.includes(`href="${URL_OBCHODNI_PODMINKY}"`));
  assert.match(text, /IČO 19830751/);
});

test('webhook: invoice.paid je napojený, stav členství zapisuje jen syncSubscription', () => {
  const kod = readFileSync(join(import.meta.dirname, '..', '..', 'api', 'webhooks', 'stripe.js'), 'utf8');
  const zacatek = kod.indexOf("if (event.type === 'invoice.paid') {");
  const vetev = kod.slice(zacatek, kod.indexOf('return res.status(200)', zacatek));
  assert.ok(zacatek > 0 && vetev.length > 50, 'větev invoice.paid chybí');
  assert.match(vetev, /zpracujInvoicePaid\(event\.data\.object/);
  assert.match(vetev, /failStripeEvent\(event\.id, vysledek\.chyba\)/);
  assert.match(kod, /'invoice\.paid',/, 'invoice.paid je mezi událostmi se syncem');
  // Webhook sám do memberships nepíše — stav jde jen přes lib/stripeSync.js.
  assert.doesNotMatch(kod, /from\('memberships'\)[\s\S]{0,80}\.(upsert|update|insert)\(/);
  assert.doesNotMatch(kod, /upsertMembership/);
});
