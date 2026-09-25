/**
 * STRIPE = JEDINÝ ZDROJ PRAVDY PRO VŠE PLACENÉ. DB JE JEHO ZRCADLO.
 *
 * syncSubscription(stripe, subscriptionId) si subscription VŽDY načte čerstvě
 * ze Stripe (payload webhooku může být starší než aktuální stav) a zapíše:
 *
 *   public.subscriptions  — upsert podle stripe_subscription_id: tarif z mapy
 *                           cen, skutečná cena (unit_amount), období z
 *                           items.data[0] (API basil), trial, zrušení, poukaz
 *   public.memberships    — tier, status, trial_ends_at, Stripe ID
 *                           (membershipStateFromSubscription — stejná pravidla
 *                           jako dřív ve webhooku, jen z jednoho místa)
 *   public.vouchers       — stripe_subscription_id u kódu z metadata.voucher_code
 *                           (jen když redeemed_by sedí na uživatele, jinak alert)
 *
 * Neznámá cena (mimo env mapu START/ON_CLUB) se nezahazuje: řádek v
 * subscriptions s plan_name 'UNKNOWN', membership tier zůstane, alert.
 *
 * Volají ho webhook, change-tier, cancel, withdraw a denní rekonciliace
 * (lib/stripeReconcile.js). Nikdo jiný stav předplatného do DB nezapisuje.
 *
 * Idempotentní: zapisuje jen to, co se opravdu změnilo, a vrací rozdíly.
 * started_at se bere ze Stripe (sub.start_date), ne „teď" — opakovaný sync
 * tedy nic nemění.
 */
import { supabaseServer } from './supabaseServer.js';
import { resolveTierFromStripeSubscription, tiersMatch } from './stripeTierMapping.js';
import { membershipStateFromSubscription } from './stripeSubscriptionStatus.js';
import { sendSystemHealthAlertEmail } from './mail.js';

const iso = (sekundy) => (Number.isFinite(sekundy) && sekundy > 0 ? new Date(sekundy * 1000).toISOString() : null);
const idZ = (x) => (typeof x === 'string' ? x : x?.id || null);

/** Porovnání hodnot pro diff — časy v ms, zbytek přes String. */
function stejne(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const ta = typeof a === 'string' ? Date.parse(a) : NaN;
  const tb = typeof b === 'string' ? Date.parse(b) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb) && /\d{4}-\d{2}-\d{2}T/.test(a) && /\d{4}-\d{2}-\d{2}T/.test(b)) return ta === tb;
  return String(a) === String(b);
}

/** Rozdíl `novy` proti `stary` jen v klíčích `novy`. { pole: { z, na } } */
function rozdil(stary, novy) {
  const out = {};
  for (const [k, v] of Object.entries(novy)) {
    if (!stejne(stary?.[k] ?? null, v ?? null)) out[k] = { z: stary?.[k] ?? null, na: v ?? null };
  }
  return out;
}

/**
 * Řádek public.subscriptions ze Stripe subscription. Čistá funkce.
 * @returns {{ radek: object, tier: string|null }}
 */
export function radekSubscriptions(sub, userId, env = process.env) {
  const polozka = sub?.items?.data?.[0] || {};
  const cena = polozka.price || {};
  const tier = resolveTierFromStripeSubscription(sub, env);
  const castka = Number(cena.unit_amount ?? cena.unit_amount_decimal);
  return {
    tier,
    radek: {
      stripe_subscription_id: sub.id,
      stripe_customer_id: idZ(sub.customer),
      user_id: userId || null,
      plan_name: tier || 'UNKNOWN',
      stripe_price_id: cena.id || null,
      price_czk: Number.isFinite(castka) ? Math.round(castka / 100) : null,
      billing_cycle: cena.recurring?.interval || null,
      status: sub.status || null,
      current_period_start: iso(polozka.current_period_start ?? sub.current_period_start),
      current_period_end: iso(polozka.current_period_end ?? sub.current_period_end),
      cancel_at_period_end: sub.cancel_at_period_end === true,
      cancel_at: iso(sub.cancel_at),
      trial_end: iso(sub.trial_end),
      voucher_code: sub.metadata?.voucher_code || null,
    },
  };
}

/** Výchozí DB vrstva (service role). Testy podstrčí atrapu. */
export const vychoziDb = {
  async subscriptionRadek(subId) {
    const { data } = await supabaseServer.from('subscriptions').select('*').eq('stripe_subscription_id', subId).maybeSingle();
    return data || null;
  },
  async upsertSubscription(radek) {
    const { error } = await supabaseServer.from('subscriptions')
      .upsert([{ ...radek, updated_at: new Date().toISOString() }], { onConflict: 'stripe_subscription_id' });
    return error || null;
  },
  async membershipPodleSubscription(subId) {
    const { data } = await supabaseServer.from('memberships').select('*').eq('stripe_subscription_id', subId).maybeSingle();
    return data || null;
  },
  async membershipPodleZakaznika(customerId) {
    if (!customerId) return null;
    const { data } = await supabaseServer.from('memberships').select('*').eq('stripe_customer_id', customerId).maybeSingle();
    return data || null;
  },
  async membershipUzivatele(userId) {
    const { data } = await supabaseServer.from('memberships').select('*').eq('user_id', userId).maybeSingle();
    return data || null;
  },
  async upsertMembership(radek) {
    const { error } = await supabaseServer.from('memberships')
      .upsert([{ ...radek, updated_at: new Date().toISOString() }], { onConflict: 'user_id' });
    return error || null;
  },
  async voucher(code) {
    const { data } = await supabaseServer.from('vouchers').select('code, redeemed_by, stripe_subscription_id').eq('code', code).maybeSingle();
    return data || null;
  },
  async nastavVoucherSubscription(code, subId) {
    const { error } = await supabaseServer.from('vouchers')
      .update({ stripe_subscription_id: subId, updated_at: new Date().toISOString() })
      .eq('code', code).is('stripe_subscription_id', null);
    return error || null;
  },
};

/** Výchozí alert: hned e-mail přes stávající system-health mail. */
export async function posliAlert(alerty) {
  const seznam = Array.isArray(alerty) ? alerty : [alerty];
  if (!seznam.length) return { ok: true };
  const critical = seznam.filter((a) => a.severity === 'critical').length;
  return sendSystemHealthAlertEmail({ alerts: seznam, critical, warning: seznam.length - critical });
}

/**
 * @param {any} stripe klient (stripe-node)
 * @param {string} subscriptionId
 * @param {{ db?: typeof vychoziDb, alert?: (a: object) => any, userIdHint?: string|null, env?: object }} [opts]
 *   userIdHint — kdo zaplatil (client_reference_id z Checkoutu), když metadata chybí
 * @returns {Promise<{
 *   subscriptionId: string, nenalezeno?: boolean, userId: string|null, tier: string|null,
 *   stripeStatus?: string, membershipStatus?: string|null, predtim?: { membership: object|null },
 *   zmeny: { subscriptions?: object, memberships?: object, vouchers?: object }, alerty: object[]
 * }>}
 */
export async function syncSubscription(stripe, subscriptionId, opts = {}) {
  const db = opts.db || vychoziDb;
  const env = opts.env || process.env;
  const alerty = [];
  const zmeny = {};
  const hlas = (severity, kod, popis, detail) => alerty.push({ severity, kod, popis, detail: `${subscriptionId}${detail ? ` · ${detail}` : ''}` });

  let sub;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
  } catch (err) {
    if (err?.code === 'resource_missing' || err?.statusCode === 404) {
      return { subscriptionId, nenalezeno: true, userId: null, tier: null, zmeny, alerty };
    }
    throw err;
  }

  // ------------------------------------------------ kdo je uživatel
  const customerId = idZ(sub.customer);
  const podleSub = await db.membershipPodleSubscription(sub.id);
  const metaUser = sub.metadata?.user_id || null;
  let userId = metaUser || opts.userIdHint || podleSub?.user_id || null;
  if (!userId) userId = (await db.membershipPodleZakaznika(customerId))?.user_id || null;
  if (!userId) hlas('critical', 'stripe_bez_uzivatele', 'Stripe subscription bez odpovídajícího uživatele (metadata.user_id / customer)', `customer ${customerId}`);

  const predtimMembership = userId ? (podleSub?.user_id === userId ? podleSub : await db.membershipUzivatele(userId)) : null;

  // ------------------------------------------------ public.subscriptions
  const { radek, tier } = radekSubscriptions(sub, userId, env);
  if (!tier) hlas('critical', 'stripe_neznama_cena', 'Cena mimo mapu START/ON_CLUB — řádek zapsán jako UNKNOWN, tier nezměněn', `price ${radek.stripe_price_id}`);
  const staraSub = await db.subscriptionRadek(sub.id);
  const zmenySub = rozdil(staraSub, radek);
  if (Object.keys(zmenySub).length) {
    const chyba = await db.upsertSubscription(radek);
    if (chyba) throw new Error(`subscriptions upsert: ${chyba.message}`);
    zmeny.subscriptions = zmenySub;
  }

  // ------------------------------------------------ public.memberships
  let membershipStatus = null;
  const expected = sub.metadata?.expected_tier || null;
  // Stará mrtvá subscription nesmí přepsat membership, který už patří jiné
  // (novější) subscription — typicky zrušené předplatné a pak nový Checkout.
  const patriJine = predtimMembership?.stripe_subscription_id && predtimMembership.stripe_subscription_id !== sub.id;
  const mrtva = ['canceled', 'incomplete_expired'].includes(String(sub.status));
  if (userId && tier && expected && !tiersMatch(expected, tier)) {
    hlas('warning', 'stripe_tier_nesedi', `metadata.expected_tier ${expected} ≠ tier z ceny ${tier} — membership nezměněno`);
  } else if (userId && tier && patriJine && mrtva) {
    // nic — membership sleduje jinou subscription
  } else if (userId && tier) {
    const stav = membershipStateFromSubscription(sub, tier);
    membershipStatus = stav.status;
    if (stav.status) {
      const novy = {
        user_id: userId,
        tier,
        status: stav.status,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
      };
      if (stav.status === 'trial') novy.trial_ends_at = stav.trialEndsAt;
      if (stav.status === 'active') novy.trial_ends_at = null;
      if ((stav.status === 'trial' || stav.status === 'active') && sub.start_date) novy.started_at = iso(sub.start_date);
      const zmenyM = rozdil(predtimMembership, novy);
      if (Object.keys(zmenyM).length) {
        const chyba = await db.upsertMembership({ ...novy, notes: `Stripe sync (${stav.status}, ${tier})` });
        if (chyba) throw new Error(`memberships upsert: ${chyba.message}`);
        zmeny.memberships = zmenyM;
      }
    }
  }

  // ------------------------------------------------ public.vouchers
  const kod = sub.metadata?.voucher_code || null;
  if (kod) {
    const voucher = await db.voucher(kod);
    if (!voucher) {
      hlas('warning', 'poukaz_neexistuje', `metadata.voucher_code ${kod} v tabulce vouchers není`);
    } else if (!userId || voucher.redeemed_by !== userId) {
      hlas('critical', 'poukaz_jiny_uzivatel', `Poukaz ${kod} uplatnil jiný uživatel, než komu patří subscription — nic nepřepsáno`, `redeemed_by ${voucher.redeemed_by} · user ${userId}`);
    } else if (voucher.stripe_subscription_id && voucher.stripe_subscription_id !== sub.id) {
      hlas('warning', 'poukaz_jina_subscription', `Poukaz ${kod} už má jinou subscription — nic nepřepsáno`, `má ${voucher.stripe_subscription_id}`);
    } else if (!voucher.stripe_subscription_id) {
      const chyba = await db.nastavVoucherSubscription(kod, sub.id);
      if (chyba) throw new Error(`vouchers update: ${chyba.message}`);
      zmeny.vouchers = { stripe_subscription_id: { z: null, na: sub.id } };
    }
  }

  if (alerty.length && opts.alert !== null) {
    try { await (opts.alert || posliAlert)(alerty); } catch (err) { console.error('[stripeSync] alert:', err?.message); }
  }

  return {
    subscriptionId: sub.id,
    userId,
    tier,
    priceId: radek.stripe_price_id,
    trialEnd: radek.trial_end,
    stripeStatus: sub.status,
    membershipStatus,
    predtim: { membership: predtimMembership },
    zmeny,
    alerty,
  };
}
