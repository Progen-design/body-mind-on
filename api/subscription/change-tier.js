// GET/POST/DELETE /api/subscription/change-tier — přechod START ↔ ON CLUB
//
// GET    → náhled pro profil: aktuální tarif, co jde změnit a za kolik
//          („Dnes doplatíš X Kč, dál 1 499 Kč/měsíc" / v trialu „Dnes 0 Kč,
//          od <datum> 1 499 Kč/měsíc"), naplánovaný downgrade.
// POST   { tier: 'ON_CLUB', souhlas: true } → upgrade hned (souhlas s OP povinný, jinak 400)
// POST   { tier: 'START' }                  → downgrade od dalšího období
// DELETE                                    → zruší naplánovaný downgrade
//
// Nový Checkout pro existující předplatné dál vrací 409 — tarif se mění tady.
// Stav v DB se nepřepisuje: nový tier zapíše webhook customer.subscription.updated
// (tier z price_id), stejně jako u /api/subscription/cancel.
//
// Stripe v produkci běží na LIVE klíčích — testy jen s atrapou
// (lib/__tests__/zmenaTarifu.test.mjs).
import Stripe from 'stripe';
import { syncSubscription } from '../../lib/stripeSync.js';
import { supabaseServer } from '../../lib/supabaseServer.js';
import { isTierCheckoutEnabled } from '../../lib/salesFeatureFlags.js';
import { jePredplatneZive, konecObdobiSubscription } from '../../lib/stripeSubscriptionStatus.js';
import { isSyntheticEmail } from '../../lib/lifecycleEmailRules.js';
import { emailPotvrzeniSmlouvy, posliTransakcniEmail } from '../../lib/smlouvaEmaily.js';
import {
  LHUTA_ODSTOUPENI_DNI,
  datumCesky,
  prvniPlacenaFaktura,
  zaplacenoMs,
} from '../../lib/odstoupeniOdSmlouvy.js';
import {
  CENA_TARIFU_KC,
  aktualniCena,
  cenyTarifu,
  datumProrace,
  nahledUpgradu,
  naplanovanyDowngrade,
  naplanujDowngrade,
  parametryUpgradu,
  smerZmeny,
  tierPredplatneho,
} from '../../lib/zmenaTarifu.js';

export const HLASKA_BEZ_SOUHLASU = 'Pro změnu tarifu potvrď souhlas s obchodními podmínkami.';
export const HLASKA_ON_CLUB_VYPNUTY = 'ON CLUB teď nejde koupit. Připravujeme — dáme vědět.';
const HLASKA_STRIPE = 'Změnu tarifu se teď nepodařilo provést. Nic se nezměnilo — zkus to prosím za chvíli.';
const HLASKA_PLATBA = 'Doplatek se nepodařilo strhnout z karty. Tarif zůstává beze změny — zkontroluj kartu a zkus to znovu.';
const MS_DEN = 24 * 60 * 60 * 1000;

export const vychoziZavislosti = {
  async overUzivatele(req) {
    const auth = req.headers?.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;
    const { data, error } = await supabaseServer.auth.getUser(token);
    return error || !data?.user?.id ? null : { id: data.user.id, email: data.user.email || null };
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
  posliEmail: posliTransakcniEmail,
  stripe: (klic) => new Stripe(klic),
  /** Zrcadlo do DB (subscriptions, memberships, vouchers) — jediný zápis stavu. */
  sync: (stripe, subId) => syncSubscription(stripe, subId),
  now: () => Date.now(),
  ceny: () => cenyTarifu(),
  onClubVProdeji: () => isTierCheckoutEnabled('ON_CLUB'),
};

/** Lhůta na odstoupení pro potvrzovací e-mail (stejné pravidlo jako /api/subscription/withdraw). */
async function lhutaOdstoupeni(stripe, subId, nowMs) {
  try {
    const seznam = await stripe.invoices.list({ subscription: subId, status: 'paid', limit: 100 });
    const prvni = prvniPlacenaFaktura(seznam?.data || []);
    if (!prvni) return { lhutaDo: null, lhutaUplynula: false };
    const konec = zaplacenoMs(prvni) + LHUTA_ODSTOUPENI_DNI * MS_DEN;
    return konec >= nowMs ? { lhutaDo: datumCesky(konec), lhutaUplynula: false } : { lhutaDo: null, lhutaUplynula: true };
  } catch {
    return { lhutaDo: null, lhutaUplynula: false };
  }
}

/**
 * Po úspěšné změně ve Stripe srovnat DB. Selhání nevrací chybu uživateli —
 * změna ve Stripe proběhla a webhook i denní rekonciliace to dorovnají.
 */
async function srovnej(z, stripe, subId) {
  try {
    await z.sync(stripe, subId);
  } catch (err) {
    console.error('[subscription/change-tier] sync:', err?.message || err, { subscription_id: subId });
  }
}

/** @param {typeof vychoziZavislosti} zavislosti */
export function vytvorHandler(zavislosti = vychoziZavislosti) {
  const z = { ...vychoziZavislosti, ...zavislosti };

  return async function handler(req, res) {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
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
      console.error('[subscription/change-tier]', err?.message);
      return res.status(500).json({ error: 'Nepodařilo se načíst předplatné.' });
    }
    const subId = clenstvi?.stripe_subscription_id || null;
    if (!subId) {
      return req.method === 'GET'
        ? res.status(200).json({ muze_menit: false })
        : res.status(409).json({ error: 'K účtu není vedené předplatné, které by šlo změnit.' });
    }

    const stripe = z.stripe(klic);
    const ceny = z.ceny();
    const nowMs = z.now();

    let sub;
    try {
      sub = await stripe.subscriptions.retrieve(subId);
    } catch (err) {
      console.error('[subscription/change-tier] retrieve:', err?.message || err);
      return res.status(502).json({ error: HLASKA_STRIPE });
    }
    if (!jePredplatneZive(sub)) {
      return req.method === 'GET'
        ? res.status(200).json({ muze_menit: false })
        : res.status(409).json({ error: 'Předplatné už neběží. Nové si založíš v nabídce tarifů.' });
    }
    const tierTed = tierPredplatneho(sub);
    // Cena mimo mapu START/ON_CLUB: říct proč, ne jen „nejde".
    if (!tierTed) {
      return req.method === 'GET'
        ? res.status(200).json({ muze_menit: false, duvod: 'neznama_cena' })
        : res.status(409).json({ error: 'Tvoje předplatné má cenu, kterou tady změnit neumíme. Napiš nám na info@bodyandmindon.cz.', duvod: 'neznama_cena' });
    }

    // ---------------------------------------------------------------- GET
    if (req.method === 'GET') {
      try {
        if (tierTed === 'START') {
          if (!z.onClubVProdeji() || !ceny.ON_CLUB) {
            return res.status(200).json({ muze_menit: false, tier: 'START' });
          }
          const n = await nahledUpgradu(stripe, sub, ceny.ON_CLUB, nowMs);
          return res.status(200).json({
            muze_menit: true, tier: 'START', cil: 'ON_CLUB',
            dnes_kc: n.dnesKc, dal_kc: n.dalKc, od: n.trialDo,
          });
        }
        if (tierTed === 'ON_CLUB') {
          const plan = await naplanovanyDowngrade(stripe, sub, ceny.START);
          return res.status(200).json({
            muze_menit: true, tier: 'ON_CLUB', cil: 'START',
            dal_kc: CENA_TARIFU_KC.START,
            od: plan?.od ?? konecObdobiSubscription(sub),
            naplanovano: Boolean(plan),
            // V trialu se na START přechází hned (trial běží dál) — UI to řekne jinak.
            v_trialu: sub.status === 'trialing' && Boolean(sub.trial_end),
          });
        }
        return res.status(200).json({ muze_menit: false, tier: tierTed });
      } catch (err) {
        console.error('[subscription/change-tier] náhled:', err?.message || err);
        return res.status(502).json({ error: HLASKA_STRIPE });
      }
    }

    // ---------------------------------------------------------------- DELETE
    if (req.method === 'DELETE') {
      try {
        const plan = await naplanovanyDowngrade(stripe, sub, ceny.START);
        if (!plan) return res.status(200).json({ ok: true, zruseno: false });
        await stripe.subscriptionSchedules.release(plan.schedule.id);
        await srovnej(z, stripe, sub.id);
        console.info('[subscription/change-tier] downgrade zrušen', { user_id: user.id, subscription_id: sub.id });
        return res.status(200).json({ ok: true, zruseno: true, tier: 'ON_CLUB' });
      } catch (err) {
        console.error('[subscription/change-tier] release:', err?.message || err);
        return res.status(502).json({ error: HLASKA_STRIPE });
      }
    }

    // ---------------------------------------------------------------- POST
    const cil = String(req.body?.tier || '').toUpperCase();
    const smer = smerZmeny(tierTed, cil);
    if (!smer) return res.status(400).json({ error: 'Tenhle přechod mezi tarify nejde.' });

    if (smer === 'upgrade' || (smer === 'beze_zmeny' && cil === 'ON_CLUB')) {
      if (!z.onClubVProdeji()) return res.status(403).json({ error: HLASKA_ON_CLUB_VYPNUTY });
      if (req.body?.souhlas !== true) return res.status(400).json({ error: HLASKA_BEZ_SOUHLASU });
      if (!ceny.ON_CLUB) return res.status(500).json({ error: 'Platby pro ON CLUB nejsou nakonfigurovány.' });
    }

    // DVOJKLIK: cena už je cílová → nic neměnit (druhý request po prvním).
    if (smer === 'beze_zmeny') {
      return res.status(200).json({ ok: true, zmeneno: false, tier: cil });
    }

    if (smer === 'upgrade') {
      const cenaTed = aktualniCena(sub);
      try {
        // Rozpracovaný downgrade by update ceny zablokoval — nejdřív pryč.
        const plan = await naplanovanyDowngrade(stripe, sub, ceny.START);
        if (plan) await stripe.subscriptionSchedules.release(plan.schedule.id);
        const parametry = parametryUpgradu(sub, ceny.ON_CLUB, nowMs);
        // Souběžný dvojklik: stejná minuta = stejné parametry = stejný klíč → Stripe provede jen jednou.
        sub = await stripe.subscriptions.update(sub.id, parametry, {
          idempotencyKey: `upgrade-${sub.id}-${cenaTed}-${datumProrace(sub, nowMs)}`,
        });
      } catch (err) {
        const platba = err?.type === 'StripeCardError' || err?.code === 'card_declined' || err?.statusCode === 402;
        console.error('[subscription/change-tier] upgrade:', err?.message || err, { user_id: user.id });
        return res.status(platba ? 402 : 502).json({ error: platba ? HLASKA_PLATBA : HLASKA_STRIPE });
      }

      await srovnej(z, stripe, sub.id);
      const trialDo = sub.status === 'trialing' && sub.trial_end ? sub.trial_end * 1000 : null;
      if (user.email && !isSyntheticEmail(user.email)) {
        const lhuta = await lhutaOdstoupeni(stripe, sub.id, nowMs);
        const dalsi = trialDo ?? Date.parse(konecObdobiSubscription(sub) || '');
        const obsah = emailPotvrzeniSmlouvy({
          tarif: 'ON_CLUB',
          cenaKc: CENA_TARIFU_KC.ON_CLUB,
          dalsiPlatba: Number.isFinite(dalsi) ? datumCesky(dalsi) : null,
          ...lhuta,
          uvod: trialDo
            ? 'Tarif jsi změnil na ON CLUB. Zkušební období běží dál, první platba už bude za ON CLUB. Tenhle e-mail je potvrzení změny smlouvy — schovej si ho.'
            : 'Tarif jsi změnil na ON CLUB a doplatek za zbytek období proběhl. Tenhle e-mail je potvrzení změny smlouvy — schovej si ho.',
        });
        const odeslano = await z.posliEmail(user.email, obsah);
        if (!odeslano.ok) console.error('[subscription/change-tier] e-mail:', odeslano.error_code, { user_id: user.id });
      }

      console.info('[subscription/change-tier] upgrade hotovo', { user_id: user.id, subscription_id: sub.id, trial: Boolean(trialDo) });
      return res.status(200).json({ ok: true, zmeneno: true, tier: 'ON_CLUB', trial_do: trialDo ? new Date(trialDo).toISOString() : null });
    }

    // downgrade
    try {
      const plan = await naplanovanyDowngrade(stripe, sub, ceny.START);
      if (plan) return res.status(200).json({ ok: true, naplanovano: true, tier: 'ON_CLUB', od: plan.od });
      const vysledek = await naplanujDowngrade(stripe, sub, ceny.START);
      await srovnej(z, stripe, sub.id);
      console.info('[subscription/change-tier] downgrade', { user_id: user.id, subscription_id: sub.id, od: vysledek.od, zpusob: vysledek.zpusob });
      if (vysledek.zpusob === 'hned') {
        // Trial: START hned, první platba po trialu 599 Kč. DB srovnal sync.
        return res.status(200).json({ ok: true, zmeneno: true, naplanovano: false, tier: 'START', od: vysledek.od });
      }
      return res.status(200).json({ ok: true, naplanovano: true, tier: 'ON_CLUB', od: vysledek.od });
    } catch (err) {
      console.error('[subscription/change-tier] downgrade:', err?.message || err, { user_id: user.id });
      return res.status(502).json({ error: HLASKA_STRIPE });
    }
  };
}

export default vytvorHandler();
