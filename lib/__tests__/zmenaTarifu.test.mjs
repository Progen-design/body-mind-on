/**
 * PŘECHOD START ↔ ON CLUB U BĚŽÍCÍHO PŘEDPLATNÉHO.
 *
 * /api/subscription/change-tier s atrapou Stripe (LIVE klíče se nikdy
 * nevolají) a webhook customer.subscription.updated prošlý celý — podepsaná
 * událost, atrapa Supabase — aby bylo vidět, co se zapíše do memberships.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import Stripe from 'stripe';

process.env.STRIPE_SECRET_KEY = 'sk_test_atrapa';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_atrapa';
process.env.STRIPE_PRICE_START_MONTHLY = 'price_start';
process.env.STRIPE_PRICE_ON_CLUB_MONTHLY = 'price_club';

const { vytvorHandler, HLASKA_BEZ_SOUHLASU, HLASKA_ON_CLUB_VYPNUTY } = await import('../../api/subscription/change-tier.js');
const { datumProrace, parametryUpgradu, smerZmeny } = await import('../zmenaTarifu.js');
const { membershipStateFromSubscription, default: webhook } = await import('../../api/webhooks/stripe.js');
const { nastavSupabaseServerProTesty } = await import('../supabaseServer.js');
const { isAccessAllowed } = await import('../membershipHelpers.js');
const { canRenewPlanForMembership } = await import('../planRenewalRules.js');

const DEN = 86_400;
const TED = Date.parse('2026-09-25T10:00:30Z');
const TED_S = Math.floor(TED / 1000);

function predplatne({ cena = 'price_start', status = 'active', trialEnd = null, schedule = null } = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status,
    trial_end: trialEnd,
    schedule,
    metadata: { user_id: 'user-1', expected_tier: cena === 'price_club' ? 'ON_CLUB' : 'START' },
    items: { data: [{ id: 'si_1', price: { id: cena }, current_period_start: TED_S - 10 * DEN, current_period_end: TED_S + 20 * DEN }] },
  };
}

/** Atrapa Stripe. `sub` se po update přepne na novou cenu (jako skutečný Stripe). */
function atrapaStripe({ sub = predplatne(), chybaUpdate = null, amountDue = 60000, schedule = null, fazeTrialEnd = null } = {}) {
  const z = { update: [], klice: [], preview: [], schedCreate: [], schedUpdate: [], release: [] };
  let aktualni = sub;
  let sched = schedule;
  const klient = {
    subscriptions: {
      async retrieve() { return aktualni; },
      async update(id, p, opt) {
        z.update.push(p); z.klice.push(opt?.idempotencyKey);
        if (chybaUpdate) throw chybaUpdate;
        aktualni = { ...aktualni, metadata: p.metadata, items: { data: [{ ...aktualni.items.data[0], price: { id: p.items[0].price } }] } };
        return aktualni;
      },
    },
    invoices: {
      async createPreview(p) { z.preview.push(p); return { amount_due: aktualni.status === 'trialing' ? 0 : amountDue }; },
      async list() { return { data: [{ id: 'in_1', status: 'paid', amount_paid: 59900, status_transitions: { paid_at: TED_S - 3 * DEN } }] }; },
    },
    subscriptionSchedules: {
      async create(p) {
        z.schedCreate.push(p);
        sched = { id: 'sub_sched_1', phases: [{ start_date: TED_S - 10 * DEN, end_date: TED_S + 20 * DEN, items: [{ price: 'price_club' }], ...(fazeTrialEnd ? { trial_end: fazeTrialEnd } : {}) }] };
        aktualni = { ...aktualni, schedule: sched.id };
        return sched;
      },
      async retrieve() { return sched; },
      async update(id, p) {
        z.schedUpdate.push(p);
        sched = { ...sched, phases: p.phases.map((f, i) => ({ ...f, start_date: f.start_date ?? p.phases[i - 1]?.end_date, items: f.items })) };
        return sched;
      },
      async release(id) { z.release.push(id); sched = null; aktualni = { ...aktualni, schedule: null }; return {}; },
    },
  };
  return { z, klient, stav: () => aktualni };
}

function sestav({ stripe, onClub = true, clenstvi = { status: 'active', tier: 'START', stripe_subscription_id: 'sub_1' } } = {}) {
  const emaily = [];
  const handler = vytvorHandler({
    overUzivatele: async () => ({ id: 'user-1', email: 'jan@seznam.cz' }),
    nactiClenstvi: async () => clenstvi,
    stripe: () => stripe.klient,
    posliEmail: async (to, obsah) => { emaily.push({ to, obsah }); return { ok: true }; },
    now: () => TED,
    onClubVProdeji: () => onClub,
  });
  return { handler, emaily };
}

async function zavolej(handler, method = 'POST', body = {}) {
  const res = { stav: null, telo: null };
  res.status = (s) => { res.stav = s; return res; };
  res.json = (t) => { res.telo = t; return res; };
  const puvodni = [console.info, console.error];
  console.info = () => {}; console.error = () => {};
  try {
    await handler({ method, headers: { authorization: 'Bearer t' }, body }, res);
  } finally {
    [console.info, console.error] = puvodni;
  }
  return res;
}

// ---------------------------------------------------------------- čisté funkce

test('směr změny: START→ON_CLUB upgrade, zpět downgrade, VIP nepodporováno', () => {
  assert.equal(smerZmeny('START', 'ON_CLUB'), 'upgrade');
  assert.equal(smerZmeny('ON_CLUB', 'START'), 'downgrade');
  assert.equal(smerZmeny('ON_CLUB', 'ON_CLUB'), 'beze_zmeny');
  assert.equal(smerZmeny('START', 'VIP'), null);
});

test('parametry upgradu: cena položky items[0], always_invoice, metadata ON_CLUB, v trialu BEZ trial_end', () => {
  const sub = predplatne({ status: 'trialing', trialEnd: TED_S + 4 * DEN });
  const p = parametryUpgradu(sub, 'price_club', TED);
  assert.deepEqual(p.items, [{ id: 'si_1', price: 'price_club' }]);
  assert.equal(p.proration_behavior, 'always_invoice');
  assert.equal(p.payment_behavior, 'error_if_incomplete');
  assert.equal(p.metadata.expected_tier, 'ON_CLUB');
  assert.equal(p.metadata.user_id, 'user-1', 'ostatní metadata zůstanou');
  assert.ok(!('trial_end' in p), 'trial běží dál');
  assert.equal(p.proration_date % 60, 0, 'zaokrouhleno na minutu (dvojklik = stejný klíč)');
  assert.equal(datumProrace(sub, Date.parse('2020-01-01')), TED_S - 10 * DEN, 'nikdy před začátkem období');
});

// ---------------------------------------------------------------- upgrade

test('upgrade: 403 když prodej ON CLUBU vypnutý, Stripe se nic nemění', async () => {
  const stripe = atrapaStripe();
  const res = await zavolej(sestav({ stripe, onClub: false }).handler, 'POST', { tier: 'ON_CLUB', souhlas: true });
  assert.equal(res.stav, 403);
  assert.equal(res.telo.error, HLASKA_ON_CLUB_VYPNUTY);
  assert.equal(stripe.z.update.length, 0);
});

test('upgrade: 400 bez souhlasu s obchodními podmínkami', async () => {
  const stripe = atrapaStripe();
  const res = await zavolej(sestav({ stripe }).handler, 'POST', { tier: 'ON_CLUB' });
  assert.equal(res.stav, 400);
  assert.equal(res.telo.error, HLASKA_BEZ_SOUHLASU);
  assert.equal(stripe.z.update.length, 0);
});

test('upgrade aktivního STARTu: výměna ceny, doúčtování hned, potvrzení smlouvy e-mailem', async () => {
  const stripe = atrapaStripe();
  const { handler, emaily } = sestav({ stripe });
  const res = await zavolej(handler, 'POST', { tier: 'ON_CLUB', souhlas: true });
  assert.equal(res.stav, 200);
  assert.equal(res.telo.zmeneno, true);
  assert.deepEqual(stripe.z.update[0].items, [{ id: 'si_1', price: 'price_club' }]);
  assert.equal(stripe.z.update[0].proration_behavior, 'always_invoice');
  assert.match(stripe.z.klice[0], /^upgrade-sub_1-price_start-\d+$/);
  assert.equal(emaily.length, 1);
  const { subject, text } = emaily[0].obsah;
  assert.equal(subject, 'Předplatné ON CLUB je aktivní');
  assert.match(text, /Tarif: ON CLUB/);
  assert.match(text, /Cena: 1\s499 Kč měsíčně/);
  assert.match(text, /Další platba: 15\. 10\. 2026/);
  assert.match(text, /Jak odstoupit do 14 dnů: do 6\. 10\. 2026/);
  assert.match(text, /doplatek za zbytek období proběhl/);
});

test('upgrade v trialu: trial_end se nepošle, trial běží dál, e-mail to říká', async () => {
  const stripe = atrapaStripe({ sub: predplatne({ status: 'trialing', trialEnd: TED_S + 4 * DEN }) });
  const { handler, emaily } = sestav({ stripe, clenstvi: { status: 'trial', tier: 'START', stripe_subscription_id: 'sub_1' } });
  const res = await zavolej(handler, 'POST', { tier: 'ON_CLUB', souhlas: true });
  assert.equal(res.stav, 200);
  assert.ok(!('trial_end' in stripe.z.update[0]));
  assert.equal(res.telo.trial_do, new Date((TED_S + 4 * DEN) * 1000).toISOString());
  assert.match(emaily[0].obsah.text, /Zkušební období běží dál, první platba už bude za ON CLUB/);
  assert.match(emaily[0].obsah.text, /Další platba: 29\. 9\. 2026/);
});

test('dvojklik: druhý POST vidí cenu ON CLUBU a nic nemění', async () => {
  const stripe = atrapaStripe();
  const { handler, emaily } = sestav({ stripe });
  await zavolej(handler, 'POST', { tier: 'ON_CLUB', souhlas: true });
  const druhy = await zavolej(handler, 'POST', { tier: 'ON_CLUB', souhlas: true });
  assert.equal(druhy.stav, 200);
  assert.equal(druhy.telo.zmeneno, false);
  assert.equal(stripe.z.update.length, 1);
  assert.equal(emaily.length, 1);
});

test('souběžný dvojklik: oba requesty nesou stejný idempotency key (Stripe provede jednou)', async () => {
  const stripe = atrapaStripe();
  const { handler } = sestav({ stripe });
  // Oba přečtou START dřív, než první update doběhne.
  const puvodniUpdate = stripe.klient.subscriptions.update;
  let pustit;
  const brana = new Promise((r) => { pustit = r; });
  stripe.klient.subscriptions.update = async (...a) => { await brana; return puvodniUpdate(...a); };
  const oba = Promise.all([zavolej(handler, 'POST', { tier: 'ON_CLUB', souhlas: true }), zavolej(handler, 'POST', { tier: 'ON_CLUB', souhlas: true })]);
  await new Promise((r) => setTimeout(r, 20));
  pustit();
  await oba;
  assert.equal(stripe.z.klice.length, 2);
  assert.equal(stripe.z.klice[0], stripe.z.klice[1]);
});

test('zamítnutá karta při doplatku → 402, tarif beze změny', async () => {
  const chyba = Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError', code: 'card_declined', statusCode: 402 });
  const stripe = atrapaStripe({ chybaUpdate: chyba });
  const { handler, emaily } = sestav({ stripe });
  const res = await zavolej(handler, 'POST', { tier: 'ON_CLUB', souhlas: true });
  assert.equal(res.stav, 402);
  assert.equal(stripe.stav().items.data[0].price.id, 'price_start');
  assert.equal(emaily.length, 0);
});

// ---------------------------------------------------------------- náhled

test('náhled upgradu: aktivní → dnes doplatek z createPreview, dál 1 499; trial → dnes 0 a datum', async () => {
  const aktivni = atrapaStripe({ amountDue: 60012 });
  const a = await zavolej(sestav({ stripe: aktivni }).handler, 'GET');
  assert.deepEqual(a.telo, { muze_menit: true, tier: 'START', cil: 'ON_CLUB', dnes_kc: 600, dal_kc: 1499, od: null });
  assert.equal(aktivni.z.preview[0].subscription, 'sub_1');
  assert.deepEqual(aktivni.z.preview[0].subscription_details.items, [{ id: 'si_1', price: 'price_club' }]);
  assert.equal(aktivni.z.preview[0].subscription_details.proration_behavior, 'always_invoice');
  assert.equal(aktivni.z.update.length, 0, 'náhled nic nemění');

  const trial = atrapaStripe({ sub: predplatne({ status: 'trialing', trialEnd: TED_S + 4 * DEN }) });
  const t = await zavolej(sestav({ stripe: trial }).handler, 'GET');
  assert.equal(t.telo.dnes_kc, 0);
  assert.equal(t.telo.od, new Date((TED_S + 4 * DEN) * 1000).toISOString());
});

test('náhled s vypnutým prodejem ON CLUBU: nic se nenabízí', async () => {
  const stripe = atrapaStripe();
  const res = await zavolej(sestav({ stripe, onClub: false }).handler, 'GET');
  assert.deepEqual(res.telo, { muze_menit: false, tier: 'START' });
  assert.equal(stripe.z.preview.length, 0);
});

// ---------------------------------------------------------------- downgrade

test('downgrade ON CLUB → START: schedule, START až od konce období, bez prorace a vratky', async () => {
  const stripe = atrapaStripe({ sub: predplatne({ cena: 'price_club' }) });
  const { handler, emaily } = sestav({ stripe, clenstvi: { status: 'active', tier: 'ON_CLUB', stripe_subscription_id: 'sub_1' } });
  const res = await zavolej(handler, 'POST', { tier: 'START' });
  assert.equal(res.stav, 200);
  assert.equal(res.telo.naplanovano, true);
  assert.equal(res.telo.od, new Date((TED_S + 20 * DEN) * 1000).toISOString());
  assert.deepEqual(stripe.z.schedCreate[0], { from_subscription: 'sub_1' });
  const u = stripe.z.schedUpdate[0];
  assert.equal(u.end_behavior, 'release');
  assert.equal(u.proration_behavior, 'none');
  assert.deepEqual(u.phases[0].items, [{ price: 'price_club', quantity: 1 }]);
  assert.equal(u.phases[0].end_date, TED_S + 20 * DEN, 'ON CLUB do konce zaplaceného období');
  assert.equal(u.phases[0].metadata.expected_tier, 'ON_CLUB');
  assert.deepEqual(u.phases[1].items, [{ price: 'price_start', quantity: 1 }]);
  assert.equal(u.phases[1].metadata.expected_tier, 'START');
  assert.equal(stripe.z.update.length, 0, 'subscription se hned nemění');
  assert.equal(emaily.length, 0);

  // GET ukáže naplánovanou změnu, druhý POST nic nezdvojí, DELETE ji zruší
  const g = await zavolej(handler, 'GET');
  assert.equal(g.telo.naplanovano, true);
  assert.equal(g.telo.od, res.telo.od);
  await zavolej(handler, 'POST', { tier: 'START' });
  assert.equal(stripe.z.schedUpdate.length, 1);
  const d = await zavolej(handler, 'DELETE');
  assert.equal(d.telo.zruseno, true);
  assert.deepEqual(stripe.z.release, ['sub_sched_1']);
  assert.equal((await zavolej(handler, 'GET')).telo.naplanovano, false);
});

test('downgrade v trialu: hned výměna ceny na START bez prorace, žádný schedule, trial_end nedotčený', async () => {
  const trialEnd = TED_S + 4 * DEN;
  const stripe = atrapaStripe({ sub: predplatne({ cena: 'price_club', status: 'trialing', trialEnd }) });
  const { handler } = sestav({ stripe, clenstvi: { status: 'trial', tier: 'ON_CLUB', stripe_subscription_id: 'sub_1' } });
  const g = await zavolej(handler, 'GET');
  assert.equal(g.telo.v_trialu, true);
  const res = await zavolej(handler, 'POST', { tier: 'START' });
  assert.equal(res.stav, 200);
  assert.deepEqual(res.telo, { ok: true, zmeneno: true, naplanovano: false, tier: 'START', od: new Date(trialEnd * 1000).toISOString() });
  assert.equal(stripe.z.schedCreate.length, 0, 'žádný schedule');
  assert.equal(stripe.z.schedUpdate.length, 0);
  const u = stripe.z.update[0];
  assert.deepEqual(u.items, [{ id: 'si_1', price: 'price_start' }]);
  assert.equal(u.proration_behavior, 'none');
  assert.equal(u.metadata.expected_tier, 'START');
  assert.ok(!('trial_end' in u), 'trial se nesmí měnit');
  assert.equal(stripe.stav().trial_end, trialEnd);
  assert.equal(stripe.stav().status, 'trialing');
  // druhý klik: cena už je START → beze změny
  const druhy = await zavolej(handler, 'POST', { tier: 'START' });
  assert.equal(druhy.telo.zmeneno, false);
  assert.equal(stripe.z.update.length, 1);
});

test('downgrade mimo trial: schedule jako dosud, trial_end aktuální fáze se přenese do fáze 1', async () => {
  const stripe = atrapaStripe({ sub: predplatne({ cena: 'price_club' }), fazeTrialEnd: TED_S - 5 * DEN });
  const { handler } = sestav({ stripe, clenstvi: { status: 'active', tier: 'ON_CLUB', stripe_subscription_id: 'sub_1' } });
  const res = await zavolej(handler, 'POST', { tier: 'START' });
  assert.equal(res.telo.naplanovano, true);
  assert.equal(stripe.z.update.length, 0);
  assert.equal(stripe.z.schedUpdate[0].phases[0].trial_end, TED_S - 5 * DEN);
  // bez trial_end ve fázi se klíč vůbec nepošle
  const bez = atrapaStripe({ sub: predplatne({ cena: 'price_club' }) });
  await zavolej(sestav({ stripe: bez, clenstvi: { status: 'active', tier: 'ON_CLUB', stripe_subscription_id: 'sub_1' } }).handler, 'POST', { tier: 'START' });
  assert.ok(!('trial_end' in bez.z.schedUpdate[0].phases[0]));
});

// ---------------------------------------------------------------- webhook

test('stav z subscription: ON CLUB v trialu = trial + trial_ends_at, ne active', () => {
  const trialEnd = TED_S + 4 * DEN;
  assert.deepEqual(membershipStateFromSubscription({ status: 'trialing', trial_end: trialEnd }, 'ON_CLUB'), {
    status: 'trial', trialEndsAt: new Date(trialEnd * 1000).toISOString(),
  });
  assert.deepEqual(membershipStateFromSubscription({ status: 'active' }, 'ON_CLUB'), { status: 'active', trialEndsAt: null });
});

test('ON CLUB v trialu má přístup (i komunitu), týdenní plány jako START trial', () => {
  const m = { tier: 'ON_CLUB', status: 'trial', trial_ends_at: new Date(TED + 4 * DEN * 1000).toISOString() };
  assert.equal(isAccessAllowed(m, new Date(TED)).allowed, true);
  assert.equal(canRenewPlanForMembership(m).reason, 'start_trial_allows_initial_plan_only');
  assert.equal(isAccessAllowed({ ...m, trial_ends_at: new Date(TED - DEN * 1000).toISOString() }, new Date(TED)).allowed, false);
});

/** Atrapa Supabase pro webhook — zaznamená upsert do memberships. */
function atrapaSupabase() {
  const upserty = [];
  const dotaz = (tabulka) => {
    const s = { tabulka, op: 'select' };
    const b = {
      select() { return b; }, eq() { return b; }, limit() { return b; }, order() { return b; }, in() { return b; },
      gte() { return b; }, lte() { return b; }, is() { return b; }, not() { return b; }, neq() { return b; }, or() { return b; },
      insert() { s.op = 'insert'; return b; }, update() { s.op = 'update'; return b; },
      upsert(radky) { s.op = 'upsert'; upserty.push({ tabulka, radek: radky[0] }); return b; },
      maybeSingle() { s.jeden = true; return b; }, single() { s.jeden = true; return b; },
      then(ok, ko) {
        let v = { data: null, error: null };
        if (tabulka === 'memberships' && s.op === 'select') v = { data: { user_id: 'user-1' }, error: null };
        return Promise.resolve(v).then(ok, ko);
      },
    };
    return b;
  };
  return { upserty, klient: { from: dotaz, rpc: async () => ({ data: null, error: null }) } };
}

async function posliWebhook(sub, id) {
  const db = atrapaSupabase();
  nastavSupabaseServerProTesty(db.klient);
  const payload = JSON.stringify({ id, object: 'event', type: 'customer.subscription.updated', data: { object: sub } });
  const podpis = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const req = Readable.from([Buffer.from(payload)]);
  req.method = 'POST';
  req.headers = { 'stripe-signature': podpis };
  const res = { stav: null };
  res.status = (s) => { res.stav = s; return res; };
  res.json = () => res;
  const puvodni = [console.log, console.info, console.error, console.warn];
  console.log = console.info = console.error = console.warn = () => {};
  try { await webhook(req, res); } finally { [console.log, console.info, console.error, console.warn] = puvodni; }
  return { res, clenstvi: db.upserty.find((u) => u.tabulka === 'memberships')?.radek };
}
after(() => nastavSupabaseServerProTesty(null));

test('webhook: výměna ceny na ON CLUB (aktivní) → tier ON_CLUB, status active, subscription zůstane', async () => {
  const sub = { ...predplatne({ cena: 'price_club' }), metadata: { expected_tier: 'ON_CLUB' } };
  const { res, clenstvi } = await posliWebhook(sub, 'evt_up');
  assert.equal(res.stav, 200);
  assert.equal(clenstvi.tier, 'ON_CLUB');
  assert.equal(clenstvi.status, 'active');
  assert.equal(clenstvi.stripe_subscription_id, 'sub_1');
  assert.equal(clenstvi.stripe_customer_id, 'cus_1');
});

test('webhook: upgrade v trialu → tier ON_CLUB, status trial, trial_ends_at se neztratí', async () => {
  const trialEnd = TED_S + 4 * DEN;
  const sub = { ...predplatne({ cena: 'price_club', status: 'trialing', trialEnd }), metadata: { expected_tier: 'ON_CLUB' } };
  const { clenstvi } = await posliWebhook(sub, 'evt_trial');
  assert.equal(clenstvi.tier, 'ON_CLUB');
  assert.equal(clenstvi.status, 'trial');
  assert.equal(clenstvi.trial_ends_at, new Date(trialEnd * 1000).toISOString());
  assert.equal(clenstvi.stripe_subscription_id, 'sub_1');
});

test('webhook: downgrade z plánu (fáze START) → tier START, status active', async () => {
  const sub = { ...predplatne({ cena: 'price_start' }), metadata: { expected_tier: 'START' } };
  const { clenstvi } = await posliWebhook(sub, 'evt_down');
  assert.equal(clenstvi.tier, 'START');
  assert.equal(clenstvi.status, 'active');
  assert.equal(clenstvi.stripe_subscription_id, 'sub_1');
});
