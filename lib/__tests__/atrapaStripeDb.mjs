/**
 * Sdílené atrapy pro testy synchronizace se Stripe (stripeSync, stripeReconcile).
 * Stripe v produkci běží na LIVE klíčích — tyhle testy nikdy nevolají síť.
 */

export const DEN = 86_400;
export const TED_S = Math.floor(Date.parse('2026-09-25T10:00:00Z') / 1000);
export const iso = (s) => new Date(s * 1000).toISOString();

/** Stripe subscription v tvaru API basil (období na items.data[0]). */
export function stripeSub({
  id = 'sub_1', user = 'user-1', cena = 'price_start', castka = 59900, status = 'active',
  trialEnd = null, cancelAtPeriodEnd = false, cancelAt = null, voucher = null, customer = 'cus_1',
  expected = undefined, start = TED_S - 10 * DEN,
} = {}) {
  return {
    id,
    customer,
    status,
    start_date: start,
    trial_end: trialEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: cancelAt,
    metadata: {
      ...(user ? { user_id: user } : {}),
      ...(expected !== undefined ? (expected ? { expected_tier: expected } : {}) : { expected_tier: cena === 'price_club' ? 'ON_CLUB' : 'START' }),
      ...(voucher ? { voucher_code: voucher } : {}),
    },
    items: {
      data: [{
        id: 'si_1',
        price: { id: cena, unit_amount: castka, recurring: { interval: 'month' } },
        current_period_start: TED_S - 10 * DEN,
        current_period_end: TED_S + 20 * DEN,
      }],
    },
  };
}

/** Atrapa Stripe: retrieve z mapy, list stránkovaně (po `strana`). */
export function atrapaStripe(subs = [], { strana = 100 } = {}) {
  const mapa = new Map(subs.map((s) => [s.id, s]));
  const volani = { retrieve: [], list: [] };
  return {
    volani,
    mapa,
    subscriptions: {
      async retrieve(id, opt) {
        volani.retrieve.push({ id, opt });
        const s = mapa.get(id);
        if (!s) throw Object.assign(new Error(`No such subscription: '${id}'`), { code: 'resource_missing', statusCode: 404 });
        return s;
      },
      async list(p) {
        volani.list.push(p);
        const vse = [...mapa.values()];
        const od = p.starting_after ? vse.findIndex((s) => s.id === p.starting_after) + 1 : 0;
        const data = vse.slice(od, od + Math.min(p.limit, strana));
        return { data, has_more: od + data.length < vse.length };
      },
    },
  };
}

/**
 * Atrapa DB (tabulky v paměti) se stejným rozhraním jako vychoziDb
 * v lib/stripeSync.js a lib/stripeReconcile.js.
 */
export function atrapaDb({ memberships = [], subscriptions = [], vouchers = [] } = {}) {
  const t = {
    memberships: memberships.map((r) => ({ ...r })),
    subscriptions: subscriptions.map((r) => ({ ...r })),
    vouchers: vouchers.map((r) => ({ ...r })),
    log: [],
  };
  const zapisy = [];
  const db = {
    t,
    zapisy,
    async subscriptionRadek(subId) { return t.subscriptions.find((r) => r.stripe_subscription_id === subId) || null; },
    async upsertSubscription(radek) {
      zapisy.push({ tabulka: 'subscriptions', radek });
      const i = t.subscriptions.findIndex((r) => r.stripe_subscription_id === radek.stripe_subscription_id);
      if (i >= 0) t.subscriptions[i] = { ...t.subscriptions[i], ...radek }; else t.subscriptions.push({ ...radek });
      return null;
    },
    async membershipPodleSubscription(subId) { return t.memberships.find((r) => r.stripe_subscription_id === subId) || null; },
    async membershipPodleZakaznika(c) { return c ? t.memberships.find((r) => r.stripe_customer_id === c) || null : null; },
    async membershipUzivatele(u) { return t.memberships.find((r) => r.user_id === u) || null; },
    async upsertMembership(radek) {
      zapisy.push({ tabulka: 'memberships', radek });
      const i = t.memberships.findIndex((r) => r.user_id === radek.user_id);
      if (i >= 0) t.memberships[i] = { ...t.memberships[i], ...radek }; else t.memberships.push({ ...radek });
      return null;
    },
    async voucher(code) { return t.vouchers.find((v) => v.code === code) || null; },
    async nastavVoucherSubscription(code, subId) {
      zapisy.push({ tabulka: 'vouchers', code, subId });
      const v = t.vouchers.find((x) => x.code === code && !x.stripe_subscription_id);
      if (v) v.stripe_subscription_id = subId;
      return null;
    },
    // rekonciliace
    async dbSubscriptionIds() {
      return [...t.memberships, ...t.subscriptions].map((r) => r.stripe_subscription_id).filter(Boolean);
    },
    async uplatnenePoukazy() { return t.vouchers.filter((v) => v.redeemed_by); },
    async zapisLog(radky) { t.log.push(...radky); return null; },
  };
  return db;
}
