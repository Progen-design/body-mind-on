// GET/POST /api/subscription/withdraw — odstoupení od smlouvy do 14 dnů
//
// GET  → stav pro profil: má nárok? kolik by se vrátilo? (UI podle toho
//        ukáže tlačítko „Odstoupit od smlouvy" vedle „Zrušit předplatné").
// POST → provede odstoupení.
//
// POŘADÍ JE ZÁVAZNÉ: (1) refund → (2) okamžité zrušení subscription →
// (3) zápis do DB → (4) e-mail. Když Stripe selže, vrací se 502 a NIC se
// nezapisuje. Když selže refund, dál se nejde — nikdo nesmí přijít
// o předplatné bez vrácených peněz.
//
// DVOJÍ KLIK: refund i zrušení mají idempotency key (Stripe vrátí výsledek
// prvního volání), zápis má unikátní index na subscription_id (23505 = už
// hotovo) a e-mail odejde jen z toho požadavku, jehož zápis prošel.
//
// ROZDÍL OPROTI /api/subscription/cancel: tam se ruší ke konci období
// a stav nese webhook. Tady se ruší HNED a membership se přepíše na
// 'canceled' rovnou — webhook customer.subscription.deleted pak zapíše totéž.
//
// Stripe v produkci běží na LIVE klíčích — testuje se jen s atrapou
// (lib/__tests__/odstoupeniOdSmlouvy.test.mjs).
import Stripe from 'stripe';
import { supabaseServer } from '../../lib/supabaseServer.js';
import {
  DUVODY_BEZ_NAROKU,
  datumCasCesky,
  datumCesky,
  narokNaOdstoupeni,
  obdobiFaktury,
  platbaFaktury,
  prvniPlacenaFaktura,
  vypocetVratky,
  zaplacenoMs,
} from '../../lib/odstoupeniOdSmlouvy.js';
import { emailOdstoupeniPrijato, posliTransakcniEmail } from '../../lib/smlouvaEmaily.js';
import { uvolniSchedule } from '../../lib/zmenaTarifu.js';

const HLASKA_STRIPE = 'Odstoupení se teď nepodařilo zpracovat u platební brány. Nic se nezměnilo — zkus to prosím za chvíli, nebo napiš na info@bodyandmindon.cz.';
const HLASKA_NEDOSTUPNE = 'Odstoupení teď online nejde. Napiš nám na info@bodyandmindon.cz a vyřídíme ho ručně.';

/** Stavy členství, ve kterých už mohla proběhnout platba. */
const PLACENE_STAVY = new Set(['active', 'past_due']);

export const vychoziZavislosti = {
  async overUzivatele(req) {
    const auth = req.headers?.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    const u = data.user;
    return { id: u.id, email: u.email || null, jmeno: u.user_metadata?.name || null };
  },
  async nactiClenstvi(userId) {
    const { data, error } = await supabaseServer
      .from('memberships')
      .select('status, tier, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`memberships: ${error.message}`);
    return data;
  },
  /** Existuje tabulka contract_withdrawals? (migrace se nasazuje ručně) */
  async tabulkaDostupna() {
    const { error } = await supabaseServer.from('contract_withdrawals').select('id', { head: true, count: 'exact' }).limit(1);
    return !error;
  },
  async najdiOdstoupeni(subscriptionId) {
    const { data } = await supabaseServer
      .from('contract_withdrawals')
      .select('refund_czk, days_used, created_at')
      .eq('subscription_id', subscriptionId)
      .maybeSingle();
    return data || null;
  },
  async zapisOdstoupeni(radek) {
    const { error } = await supabaseServer.from('contract_withdrawals').insert([radek]);
    return { error: error || null };
  },
  async zrusClenstvi(userId) {
    const { error } = await supabaseServer
      .from('memberships')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    return { error: error || null };
  },
  posliEmail: posliTransakcniEmail,
  stripe: (klic) => new Stripe(klic),
  now: () => Date.now(),
};

/**
 * Zjistí nárok a spočítá vratku. Jen čtení ze Stripe.
 * @returns {Promise<{ narok: false, duvod: string } | { narok: true, subscription: any, faktura: any, zaplacenoKc: number, vratka: ReturnType<typeof vypocetVratky> }>}
 */
async function posudNarok(stripe, subscriptionId, nowMs) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const seznam = await stripe.invoices.list({ subscription: subscriptionId, status: 'paid', limit: 100 });
  const faktura = prvniPlacenaFaktura(seznam?.data || []);
  const narok = narokNaOdstoupeni({ subscription, prvniFaktura: faktura, nowMs });
  if (!narok.narok) return narok;

  const item = subscription?.items?.data?.[0];
  const obdobi = obdobiFaktury(faktura) || (item?.current_period_start && item?.current_period_end
    ? { startMs: item.current_period_start * 1000, konecMs: item.current_period_end * 1000 }
    : null);
  if (!obdobi) throw new Error('chybí období faktury');

  const zaplacenoKc = Math.round(Number(faktura.amount_paid) / 100);
  return { narok: true, subscription, faktura, zaplacenoKc, vratka: vypocetVratky({ zaplacenoKc, obdobi, nowMs }) };
}

/** @param {typeof vychoziZavislosti} z */
export function vytvorHandler(z = vychoziZavislosti) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const klic = process.env.STRIPE_SECRET_KEY;
    if (!klic) return res.status(500).json({ error: 'Platby nejsou nakonfigurovány.' });

    const user = await z.overUzivatele(req);
    if (!user) return res.status(401).json({ error: 'Nejste přihlášen' });

    let clenstvi;
    try {
      clenstvi = await z.nactiClenstvi(user.id);
    } catch (err) {
      console.error('[subscription/withdraw]', err?.message);
      return res.status(500).json({ error: 'Nepodařilo se načíst předplatné.' });
    }

    const subscriptionId = clenstvi?.stripe_subscription_id || null;
    const tarif = String(clenstvi?.tier || 'START').toUpperCase();
    const jePost = req.method === 'POST';
    const bezNaroku = (duvod) => (jePost
      ? res.status(409).json({ error: DUVODY_BEZ_NAROKU[duvod], duvod })
      : res.status(200).json({ narok: false, duvod }));

    if (!subscriptionId) return bezNaroku('bez_predplatneho');

    // Dvojí klik / návrat po úspěchu: odstoupení už je zapsané.
    if (!(await z.tabulkaDostupna())) {
      return jePost ? res.status(503).json({ error: HLASKA_NEDOSTUPNE }) : res.status(200).json({ narok: false, duvod: 'nedostupne' });
    }
    const hotovo = await z.najdiOdstoupeni(subscriptionId);
    if (hotovo) {
      return res.status(200).json({ ok: true, narok: false, odstoupeno: true, vratka_kc: hotovo.refund_czk });
    }

    if (!PLACENE_STAVY.has(String(clenstvi.status))) {
      return bezNaroku(clenstvi.status === 'canceled' || clenstvi.status === 'expired' ? 'zruseno' : 'bez_platby');
    }

    const stripe = z.stripe(klic);
    const nowMs = z.now();

    let posudek;
    try {
      posudek = await posudNarok(stripe, subscriptionId, nowMs);
    } catch (err) {
      console.error('[subscription/withdraw] stripe (čtení):', err?.message || err);
      return res.status(502).json({ error: HLASKA_STRIPE });
    }
    if (!posudek.narok) return bezNaroku(posudek.duvod);

    const { faktura, zaplacenoKc, vratka } = posudek;

    if (!jePost) {
      return res.status(200).json({
        narok: true,
        tarif,
        datum_prvni_platby: datumCesky(zaplacenoMs(faktura)),
        zaplaceno_kc: zaplacenoKc,
        vratka_kc: vratka.vratkaKc,
        dny_vyuzito: vratka.dnyVyuzito,
        jmeno: user.jmeno,
        email: user.email,
      });
    }

    // (1) REFUND — když selže, končíme. Předplatné zůstává, nic se nezapíše.
    if (vratka.vratkaKc > 0) {
      try {
        const platba = await platbaFaktury(faktura.id, stripe);
        if (!platba) throw new Error(`faktura ${faktura.id} nemá dohledatelnou platbu`);
        await stripe.refunds.create({
          ...platba,
          amount: vratka.vratkaKc * 100,
          reason: 'requested_by_customer',
          metadata: { duvod: 'odstoupeni_od_smlouvy', user_id: user.id, invoice_id: faktura.id, days_used: String(vratka.dnyVyuzito) },
        }, { idempotencyKey: `odstoupeni-refund-${faktura.id}` });
      } catch (err) {
        console.error('[subscription/withdraw] REFUND SELHAL — nic dalšího se neprovedlo:', err?.message || err, { user_id: user.id });
        return res.status(502).json({ error: HLASKA_STRIPE });
      }
    }

    // (2) OKAMŽITÉ ZRUŠENÍ. Naplánovaný downgrade (schedule) by cancel
    // zablokoval — nejdřív ho uvolnit, změna tarifu tím zanikne.
    try {
      await uvolniSchedule(stripe, posudek.subscription);
      await stripe.subscriptions.cancel(subscriptionId, {}, { idempotencyKey: `odstoupeni-cancel-${subscriptionId}` });
    } catch (err) {
      // Refund už proběhl. Opakovaný pokus ho díky idempotency key nezdvojí.
      console.error('[subscription/withdraw] ZRUŠENÍ SELHALO PO REFUNDU — nutná kontrola ve Stripe:', err?.message || err, {
        user_id: user.id, subscription_id: subscriptionId, refund_czk: vratka.vratkaKc,
      });
      return res.status(502).json({ error: HLASKA_STRIPE });
    }

    // (3) ZÁPIS — peníze už se pohnuly, takže chyby tady jen logujeme.
    const { error: chybaClenstvi } = await z.zrusClenstvi(user.id);
    if (chybaClenstvi) console.error('[subscription/withdraw] membership → canceled selhalo (dorovná webhook):', chybaClenstvi.message);

    const { error: chybaZapisu } = await z.zapisOdstoupeni({
      user_id: user.id,
      subscription_id: subscriptionId,
      invoice_id: faktura.id,
      paid_czk: zaplacenoKc,
      refund_czk: vratka.vratkaKc,
      days_used: vratka.dnyVyuzito,
    });
    if (chybaZapisu?.code === '23505') {
      // Souběžný druhý klik: první požadavek už zapsal i poslal e-mail.
      return res.status(200).json({ ok: true, odstoupeno: true, vratka_kc: vratka.vratkaKc });
    }
    if (chybaZapisu) console.error('[subscription/withdraw] zápis contract_withdrawals selhal:', chybaZapisu.message, { user_id: user.id, subscription_id: subscriptionId });

    // (4) E-MAIL
    const kdy = datumCasCesky(nowMs);
    if (user.email) {
      const odeslano = await z.posliEmail(user.email, emailOdstoupeniPrijato({ kdy, tarif, vratkaKc: vratka.vratkaKc }));
      if (!odeslano.ok) console.error('[subscription/withdraw] e-mail se nepodařilo odeslat:', odeslano.error_code, { user_id: user.id });
    }

    console.info('[subscription/withdraw] hotovo', { user_id: user.id, subscription_id: subscriptionId, refund_czk: vratka.vratkaKc, days_used: vratka.dnyVyuzito });
    return res.status(200).json({ ok: true, odstoupeno: true, vratka_kc: vratka.vratkaKc, kdy });
  };
}

export default vytvorHandler();
