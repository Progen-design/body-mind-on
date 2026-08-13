#!/usr/bin/env node
/**
 * OVĚŘENÍ CELÉ PLACENÉ CESTY — od registrace ke druhému plánu.
 *
 *   registrace → trial → checkout → platba kartou → webhook
 *   → membership status='active' → weekly-plan-producer → weekly_plan_update
 *   → DRUHÝ PLÁN
 *
 * Tenhle řetěz nikdy celý neproběhl: 10. 8. 2026 mělo 43 členství status
 * 'trial', nula z nich `stripe_customer_id`, a `stripe_events` bylo prázdné —
 * Stripe s naším webhookem nikdy nemluvil.
 *
 * JAK SE PLATÍ. Výchozí cesta je Stripe API (zákazník + pm_card_visa +
 * subscription), protože hostovaná Checkout stránka je Stripe UI — běží
 * v iframech, mění se a její selhání o našem kódu nic neříká. Podrobnosti
 * a dvě nutné odchylky jsou u kroku 4.
 *
 * ČEHO SE API CESTA NEDOTKNE: propojení uživatele se Stripe zákazníkem, které
 * v produkci dělá `checkout.session.completed`. Na to je `--browser`.
 *
 * CO SKRIPT ZODPOVÍ HNED V KROKU 3. Jestli je v produkci nastavené
 * `STRIPE_PRICE_START_MONTHLY`. Zvenčí to jinak zjistit nejde: endpoint
 * kontrolu dělá až za autentizací, takže na to je potřeba reálný token.
 *
 * SPUŠTĚNÍ
 *   npm run verify:paid-path                 celý řetěz proti produkci
 *   npm run verify:paid-path -- --checkout-only   zastaví po kroku 3
 *   npm run verify:paid-path -- --keep       neuklidí testovací data
 *   npm run verify:paid-path -- --browser    platba přes hostovaný Checkout (Playwright)
 *   npm run verify:paid-path -- --headed     to samé, ale s viditelným prohlížečem
 *
 * STOPA: vznikne reálný uživatel v produkční DB, reálný plán, odejde e-mail
 * a v testovacím Stripu vznikne zákazník + subscription. Stejná stopa jako
 * `npm run smoke-test:matrix`, plus Stripe. Úklid na konci to zase smaže.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

import { loadLocalEnv } from './audit-utils.mjs';
import { canRenewPlanForMembership } from '../lib/planRenewalRules.js';
import { trialDaysForCheckout, isTrialEligible } from '../lib/trialEligibility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadLocalEnv();

const ARGS = new Set(process.argv.slice(2));
const CHECKOUT_ONLY = ARGS.has('--checkout-only');
const KEEP = ARGS.has('--keep');
const HEADED = ARGS.has('--headed');
// Výchozí platební cesta je Stripe API; prohlížeč jen na vyžádání.
const BROWSER = ARGS.has('--browser') || ARGS.has('--headed');
const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');

const TEST_CARD = { number: '4242424242424242', exp: '12 / 34', cvc: '123', zip: '11000' };
const TIMEOUT = { register: 120_000, webhook: 120_000, plan: 180_000 };

let failed = 0;
const kroky = [];
/** Zapsali jsme stripe_customer_id sami místo checkout.session.completed? */
let simulovanoPropojeni = false;
/** Posunuli jsme platnost plánu, aby producent viděl konec týdne? */
let simulovanoUkonceniTydne = false;

function krok(nazev) {
  console.log(`\n── ${nazev} ${'─'.repeat(Math.max(0, 62 - nazev.length))}`);
}
function ok(msg) {
  console.log(`   OK    ${msg}`);
  kroky.push({ ok: true, msg });
}
function fail(msg) {
  console.log(`   FAIL  ${msg}`);
  kroky.push({ ok: false, msg });
  failed += 1;
}
function info(msg) {
  console.log(`         ${msg}`);
}
/** Zastaví celý běh — dál nemá smysl pokračovat. */
function stop(msg) {
  fail(msg);
  souhrn();
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function souhrn() {
  console.log(`\n${'═'.repeat(66)}`);
  for (const k of kroky) console.log(`${k.ok ? 'OK  ' : 'FAIL'}  ${k.msg}`);
  console.log(`${'═'.repeat(66)}`);
  // Bez tohohle by se zelený běh dal přečíst jako „otestováno všechno“.
  if (simulovanoPropojeni || simulovanoUkonceniTydne) {
    console.log('\nSIMULOVANÉ KROKY (zbytek řetězu je skutečný):');
    if (simulovanoPropojeni) {
      console.log('  • stripe_customer_id zapsán skriptem — v produkci ho doplní');
      console.log('    checkout.session.completed; tu část ověří jen --browser');
    }
    if (simulovanoUkonceniTydne) {
      console.log('  • valid_until plánu posunut na dnešek, aby producent viděl');
      console.log('    konec týdne — jinak by se čekalo 7 dní');
    }
  }
  console.log(failed ? `\n${failed}× FAIL\n` : '\nCelý řetěz prošel.\n');
}

async function stripeApi(path, { method = 'GET', body = null } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body: new URLSearchParams(body).toString() } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${path}: ${json?.error?.message || res.status}`);
  return json;
}

// ── 0. PREFLIGHT ────────────────────────────────────────────────────────────
krok('0. Preflight');

const db = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) stop('Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false } });
})();

const stripeKey = String(process.env.STRIPE_SECRET_KEY || '');
if (!stripeKey) stop('Chybí STRIPE_SECRET_KEY.');
if (stripeKey.startsWith('sk_live_')) {
  // Skript zakládá zákazníky a subscription. V ostrém režimu to znamená
  // skutečné peníze — proto radši nic než „jen test“.
  stop('STRIPE_SECRET_KEY je OSTRÝ (sk_live_). Tenhle skript se v ostrém režimu nespouští.');
}
ok(`Stripe režim: testovací (${stripeKey.slice(0, 8)}…)`);
info(`BASE_URL: ${BASE_URL}`);

if (!process.env.CRON_SECRET) fail('Chybí CRON_SECRET — krok 7 (producent) se nedá spustit.');
else ok('CRON_SECRET je k dispozici');

{
  const hooks = await stripeApi('webhook_endpoints?limit=20');
  const nas = (hooks.data || []).filter((w) => String(w.url || '').includes('/api/webhooks/stripe'));
  if (!nas.length) stop('Ve Stripu není webhook endpoint na /api/webhooks/stripe — webhook nikdy nedorazí.');
  const enabled = nas.filter((w) => w.status === 'enabled');
  if (!enabled.length) stop('Webhook endpoint existuje, ale není enabled.');
  const ev = enabled[0].enabled_events || [];
  ok(`Webhook endpoint: ${enabled[0].url}`);
  if (!ev.includes('checkout.session.completed')) {
    stop('Webhook neposlouchá checkout.session.completed — bez toho se membership nikdy nespáruje se Stripe zákazníkem.');
  }
  info(`události: ${ev.join(', ')}`);
}

// ── 1. REGISTRACE ───────────────────────────────────────────────────────────
krok('1. Registrace testovacího uživatele');

const stamp = Date.now();
const email = `info+bm-paid-${stamp}@bodyandmindon.cz`;
const password = `Paid-${stamp}-Aa!`;

const payloadZaklad = JSON.parse(readFileSync(join(__dirname, 'smoke-test-payload.json'), 'utf8'));
const regRes = await fetch(`${BASE_URL}/api/body-metrics`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...payloadZaklad, email, password, program: 'START' }),
  signal: AbortSignal.timeout(TIMEOUT.register),
});
const regJson = await regRes.json().catch(() => ({}));
if (!regRes.ok) stop(`Registrace selhala: HTTP ${regRes.status} ${regJson?.error || ''}`);
ok(`Registrace prošla (HTTP ${regRes.status}), e-mail ${email}`);

const { data: authUsers } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
const userId = (authUsers?.users || []).find((u) => u.email === email)?.id;
if (!userId) stop('Uživatel se v auth nenašel — registrace ho nevytvořila.');
info(`user_id: ${userId}`);

async function nactiClenstvi() {
  const { data } = await db.from('memberships')
    .select('tier, status, trial_ends_at, stripe_customer_id, stripe_subscription_id')
    .eq('user_id', userId).maybeSingle();
  return data;
}

const clenstvi0 = await nactiClenstvi();
if (!clenstvi0) stop('Registrace nevytvořila členství.');
if (clenstvi0.tier !== 'START' || clenstvi0.status !== 'trial') {
  fail(`Členství má tier=${clenstvi0.tier} status=${clenstvi0.status}, čekáno START/trial`);
} else {
  ok(`Členství: START / trial, trial do ${String(clenstvi0.trial_ends_at).slice(0, 16)}`);
}

const { count: planyPred } = await db.from('ai_generated_plans')
  .select('id', { count: 'exact', head: true }).eq('user_id', userId);
if (planyPred === 1) ok('Vznikl první plán (initial_plan)');
else fail(`Po registraci je plánů ${planyPred}, čekán 1`);

// Brána musí druhý plán ZAMÍTNOUT, dokud se nezaplatí. Kdyby ho pustila,
// nula druhých plánů v produkci by neměla vysvětlení.
{
  const verdikt = canRenewPlanForMembership(clenstvi0);
  if (verdikt.allowed) fail(`Brána pouští druhý plán už v trialu (${verdikt.reason}) — to je proti návrhu`);
  else ok(`Brána druhý plán zamítá: ${verdikt.reason}`);
}

// Registrace zapisuje trial_ends_at, takže nárok na dalších 7 dní zdarma
// od Stripu uživatel NEMÁ a checkout jde rovnou na placené.
{
  const eligible = isTrialEligible(clenstvi0);
  const dny = trialDaysForCheckout('START', clenstvi0);
  if (eligible || dny) {
    info(`POZOR: uživatel má nárok na Stripe trial (${dny} dní) — subscription bude 'trialing' a membership zůstane 'trial'.`);
  } else {
    ok('Bez nároku na Stripe trial → subscription bude hned active');
  }
}

// ── 2. PŘIHLÁŠENÍ ───────────────────────────────────────────────────────────
krok('2. Přihlášení (reálný uživatelský token)');

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
const accessToken = signIn?.session?.access_token;
if (!accessToken) stop(`Přihlášení selhalo: ${signInErr?.message || 'bez tokenu'}`);
ok('Token získán');

// ── 3. CHECKOUT — ROZHODUJE O PRODUKČNÍ PROMĚNNÉ ────────────────────────────
krok('3. POST /api/stripe/create-checkout-session');

const coRes = await fetch(`${BASE_URL}/api/stripe/create-checkout-session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ tier: 'START' }),
  signal: AbortSignal.timeout(60_000),
});
const coJson = await coRes.json().catch(() => ({}));

if (coRes.status === 200 && coJson?.url) {
  ok('Checkout session vznikla → produkční STRIPE_PRICE_START_MONTHLY JE nastavené');
  info(coJson.url.slice(0, 72) + '…');
} else {
  const zprava = String(coJson?.error || '');
  console.log(`   FAIL  Checkout selhal: HTTP ${coRes.status} — ${zprava || '(bez zprávy)'}`);
  kroky.push({ ok: false, msg: `Checkout HTTP ${coRes.status}: ${zprava}` });
  failed += 1;
  if (/produkt nejsou nakonfigurovány/i.test(zprava)) {
    console.log('\n   >>> ODPOVĚĎ: v produkci CHYBÍ STRIPE_PRICE_START_MONTHLY.');
    console.log('   >>> Nastav price_1Tsq2DPTu5plCL9PhNU0S7hL (START, 599 Kč/měsíc) a spusť znovu.');
  } else if (/Platby nejsou nakonfigurovány/i.test(zprava)) {
    console.log('\n   >>> ODPOVĚĎ: v produkci chybí STRIPE_SECRET_KEY.');
  }
  if (!KEEP) await uklid();
  souhrn();
  process.exit(1);
}

if (CHECKOUT_ONLY) {
  info('--checkout-only: zastavuji před platbou.');
  if (!KEEP) await uklid();
  souhrn();
  process.exit(failed ? 1 : 0);
}

// ── 4. PLATBA ───────────────────────────────────────────────────────────────
//
// VÝCHOZÍ CESTA JE STRIPE API, ne prohlížeč. Hostovaná Checkout stránka je
// Stripe UI, běží v iframech a mění se — 11. 8. 2026 na ní běh spadl na
// `locator.fill: Timeout 30000ms exceeded`, což o našem kódu neřeklo nic.
// Playwright zůstává za `--browser` pro případ, kdy chceme opravdu celou cestu
// včetně hostované stránky.
//
// DVĚ ODCHYLKY OD „prostě vytvoř subscription a Stripe pošle created":
//
//  1. `customer.subscription.created` NENÍ v `enabled_events` našeho endpointu
//     (jsou tam jen checkout.session.completed, customer.subscription.updated
//     a .deleted) a handler pro něj nemá case — spadl by na
//     `ignored_customer.subscription.created`. Proto se po vytvoření
//     subscription vynutí `customer.subscription.updated`, který endpoint
//     odebírá i zpracovává.
//
//  2. `metadata.user_id` webhooku k ničemu není. `resolveMembershipUserId()`
//     hledá uživatele VÝHRADNĚ přes `memberships.stripe_subscription_id`
//     nebo `stripe_customer_id`; do metadat u subscription se nedívá. Ty
//     sloupce plní jedině `checkout.session.completed`. API cesta ho
//     přeskakuje, takže musí propojení zapsat sama — jinak každý běh skončí
//     na `skipped_no_membership_match` a nic se neaktivuje.
//
// CO API CESTA NEOVĚŘUJE: krok checkout → propojení uživatele se Stripe
// zákazníkem. Ten pokrývá jedině `--browser`.
krok(BROWSER ? '4. Platba přes hostovaný Checkout (Playwright)' : '4. Platba přes Stripe API');

if (BROWSER) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    await page.goto(coJson.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await page.getByPlaceholder(/1234 1234|Číslo karty|Card number/i).first()
      .fill(TEST_CARD.number, { timeout: 30_000 });
    await page.getByPlaceholder(/MM \/ (RR|YY)/i).first().fill(TEST_CARD.exp);
    await page.getByPlaceholder(/CVC/i).first().fill(TEST_CARD.cvc);

    const zip = page.getByPlaceholder(/PSČ|ZIP|Postal/i).first();
    if (await zip.count().catch(() => 0)) await zip.fill(TEST_CARD.zip).catch(() => {});
    const jmeno = page.getByPlaceholder(/Jméno na kartě|Name on card/i).first();
    if (await jmeno.count().catch(() => 0)) await jmeno.fill('BM Test').catch(() => {});

    await page.locator('button[type="submit"]').first().click({ timeout: 30_000 });
    await page.waitForURL(/checkout=success/, { timeout: 90_000 });
    ok('Platba prošla, Stripe přesměroval na ?checkout=success');
  } catch (e) {
    fail(`Platba v prohlížeči selhala: ${e?.message?.split('\n')[0]}`);
    info('Stripe mění popisky polí — zkus --headed. Bez --browser jede API cesta.');
  } finally {
    await browser.close();
  }
} else {
  const priceId = String(process.env.STRIPE_PRICE_START_MONTHLY || '').trim();
  if (!priceId) {
    stop('Pro API cestu je potřeba lokální STRIPE_PRICE_START_MONTHLY (produkční proměnná se odsud nepřečte).');
  }

  const zakaznik = await stripeApi('customers', {
    method: 'POST',
    body: { email, 'metadata[user_id]': userId, description: 'verify:paid-path' },
  });
  ok(`Stripe zákazník ${zakaznik.id}`);

  const pm = await stripeApi('payment_methods/pm_card_visa/attach', {
    method: 'POST',
    body: { customer: zakaznik.id },
  });
  await stripeApi(`customers/${zakaznik.id}`, {
    method: 'POST',
    body: { 'invoice_settings[default_payment_method]': pm.id },
  });
  ok('Testovací karta připojena jako výchozí');

  // Krok, který v produkci dělá checkout.session.completed.
  const { error: linkErr } = await db.from('memberships')
    .update({ stripe_customer_id: zakaznik.id })
    .eq('user_id', userId);
  if (linkErr) stop(`Nepodařilo se propojit členství se Stripe zákazníkem: ${linkErr.message}`);
  simulovanoPropojeni = true;
  info('SIMULOVÁNO: stripe_customer_id zapsán ručně (jinak to dělá checkout.session.completed)');

  const sub = await stripeApi('subscriptions', {
    method: 'POST',
    body: {
      customer: zakaznik.id,
      'items[0][price]': priceId,
      default_payment_method: pm.id,
      'metadata[user_id]': userId,
      'metadata[expected_tier]': 'START',
    },
  });
  ok(`Subscription ${sub.id} (Stripe status: ${sub.status})`);

  // Vynucený `customer.subscription.updated` — `created` endpoint neodebírá.
  await stripeApi(`subscriptions/${sub.id}`, {
    method: 'POST',
    body: { 'metadata[verify_run]': String(stamp) },
  });
  ok('Vynucen customer.subscription.updated → webhook');
}

// ── 5. WEBHOOK ──────────────────────────────────────────────────────────────
krok('5. Webhook → membership active');

let clenstvi1 = null;
{
  const doKdy = Date.now() + TIMEOUT.webhook;
  while (Date.now() < doKdy) {
    clenstvi1 = await nactiClenstvi();
    if (clenstvi1?.status === 'active') break;
    await sleep(3000);
  }

  const { count: eventu } = await db.from('stripe_events')
    .select('id', { count: 'exact', head: true });
  info(`stripe_events celkem: ${eventu ?? '—'}`);

  if (clenstvi1?.status === 'active') ok(`Membership status='active' (tier ${clenstvi1.tier})`);
  else fail(`Membership zůstal '${clenstvi1?.status}' — webhook neaktivoval členství`);

  if (clenstvi1?.stripe_customer_id) ok(`stripe_customer_id doplněn (${clenstvi1.stripe_customer_id.slice(0, 12)}…)`);
  else fail('stripe_customer_id zůstal prázdný — checkout.session.completed nedorazil nebo se nespároval');

  if (clenstvi1?.stripe_subscription_id) ok('stripe_subscription_id doplněn');
  else fail('stripe_subscription_id zůstal prázdný');
}

// ── 6. BRÁNA ────────────────────────────────────────────────────────────────
krok('6. canRenewPlanForMembership po aktivaci');
{
  const verdikt = canRenewPlanForMembership(clenstvi1);
  if (verdikt.allowed) ok(`Brána druhý plán povoluje: ${verdikt.reason}`);
  else fail(`Brána pořád zamítá: ${verdikt.reason}`);
}

// ── 7. PRODUCENT ────────────────────────────────────────────────────────────
krok('7. weekly-plan-producer → weekly_plan_update');

async function producent(dryRun) {
  const res = await fetch(`${BASE_URL}/api/cron/weekly-plan-producer${dryRun ? '?dry_run=1' : ''}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(120_000),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function ulohyUzivatele() {
  const { data } = await db.from('ai_tasks')
    .select('id, task_type, status, created_at')
    .eq('user_id', userId).eq('task_type', 'weekly_plan_update')
    .order('created_at', { ascending: false });
  return data || [];
}

{
  // NEJDŘÍV SPRÁVNÉ ODMÍTNUTÍ. Producent bere jen uživatele, jejichž aktivní
  // plán končí do WEEKLY_PRODUCER_LEAD_DAYS (= 1 den) — nebo žádný nemají.
  // Testovací uživatel dostal plán před minutou, takže kandidát být NESMÍ.
  // Kdyby byl, vyráběl by producent plány každý den znovu.
  const dry = await producent(true);
  if (dry.status !== 200) {
    fail(`dry_run: HTTP ${dry.status} ${dry.json?.error || ''}`);
  } else if ((await ulohyUzivatele()).length === 0) {
    ok('Čerstvý plán ještě nekončí → producent uživatele správně nebere');
  } else {
    fail('Producent založil úlohu, i když plán ještě platí');
  }

  // TEĎ SIMULACE KONCE TÝDNE. Bez toho by se dalo čekat 7 dní.
  const dnes = new Date().toISOString().slice(0, 10);
  const { error: posunErr } = await db.from('ai_generated_plans')
    .update({ valid_until: dnes })
    .eq('user_id', userId).eq('is_active', true);
  if (posunErr) stop(`Nepodařilo se posunout platnost plánu: ${posunErr.message}`);
  simulovanoUkonceniTydne = true;
  info(`SIMULOVÁNO: valid_until aktivního plánu posunut na ${dnes} (konec týdne)`);

  const dry2 = await producent(true);
  if (dry2.status === 200) ok(`dry_run po posunu: kandidátů ${dry2.json?.candidates_total ?? '?'}`);
  else fail(`dry_run po posunu: HTTP ${dry2.status} ${dry2.json?.error || ''}`);

  const real = await producent(false);
  if (real.status === 200) ok(`Producent proběhl (created ${real.json?.created ?? '?'})`);
  else fail(`Producent: HTTP ${real.status} ${real.json?.error || ''}`);

  const tasks = await ulohyUzivatele();
  if (tasks.length) ok(`Úloha weekly_plan_update vznikla (status ${tasks[0].status})`);
  else fail('Úloha weekly_plan_update nevznikla ani po posunu platnosti');
}

// ── 8. DRUHÝ PLÁN ───────────────────────────────────────────────────────────
krok('8. Druhý plán');
{
  const res = await fetch(`${BASE_URL}/api/ai/run-scheduler`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(TIMEOUT.plan),
  }).catch((e) => ({ status: 0, _err: e?.message }));
  info(`run-scheduler: HTTP ${res.status ?? '—'}`);

  const doKdy = Date.now() + TIMEOUT.plan;
  let plany = [];
  while (Date.now() < doKdy) {
    const { data } = await db.from('ai_generated_plans')
      .select('id, valid_from, generated_by, created_at')
      .eq('user_id', userId).order('created_at', { ascending: true });
    plany = data || [];
    if (plany.length >= 2) break;
    await sleep(5000);
  }

  if (plany.length >= 2) {
    ok(`Druhý plán vznikl (${plany.length} celkem)`);
    for (const p of plany) info(`  ${p.id.slice(0, 8)}  od ${String(p.valid_from).slice(0, 10)}  ${p.generated_by}`);
    const posledni = plany[plany.length - 1];
    if (String(posledni.valid_from) > String(plany[0].valid_from)) ok('Druhý plán má pozdější valid_from');
    else fail('Druhý plán nemá pozdější valid_from — je to duplikát téhož týdne');
  } else {
    fail(`Plánů je pořád ${plany.length} — druhý nevznikl`);
    info('Úloha může být pending; zkontroluj ai_tasks a logy scheduleru.');
  }
}

// ── 9. ÚKLID ────────────────────────────────────────────────────────────────
async function uklid() {
  krok('9. Úklid');
  try {
    const m = await nactiClenstvi();
    if (m?.stripe_subscription_id) {
      await stripeApi(`subscriptions/${m.stripe_subscription_id}`, { method: 'DELETE' });
      info('subscription zrušena');
    }
    if (m?.stripe_customer_id) {
      await stripeApi(`customers/${m.stripe_customer_id}`, { method: 'DELETE' });
      info('Stripe zákazník smazán');
    }
  } catch (e) {
    info(`Stripe úklid: ${e?.message}`);
  }
  try {
    for (const t of ['ai_tasks', 'ai_generated_plans', 'memberships', 'start_workout_progression', 'body_metrics']) {
      await db.from(t).delete().eq('user_id', userId);
    }
    // `registrations` se váže e-mailem, ne user_id — smazání auth uživatele
    // (a s ním profilu) ji tu nechá viset a hlídka `registrations_viselec`
    // pak hlásí registraci bez účtu. Čtyři takové řádky po bězích z 10.–12. 8.
    // 2026 byly přesně tohle.
    const { error: regErr } = await db.from('registrations').delete().eq('email', email);
    if (regErr) fail(`Úklid registrations selhal: ${regErr.message} (${email})`);

    await db.auth.admin.deleteUser(userId);
    ok('Testovací uživatel smazán');
  } catch (e) {
    fail(`Úklid uživatele selhal: ${e?.message} (user_id ${userId})`);
  }

  // Kontrola dopadu: úklid, který tiše nechá stopu, je horší než žádný.
  try {
    const zbytky = [];
    for (const t of ['ai_tasks', 'ai_generated_plans', 'memberships', 'start_workout_progression', 'body_metrics']) {
      const { count } = await db.from(t).select('*', { count: 'exact', head: true }).eq('user_id', userId);
      if (count) zbytky.push(`${t}=${count}`);
    }
    const { count: regZbytek } = await db.from('registrations')
      .select('*', { count: 'exact', head: true }).eq('email', email);
    if (regZbytek) zbytky.push(`registrations=${regZbytek}`);

    const { data: authPo } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if ((authPo?.users || []).some((u) => u.id === userId)) zbytky.push('auth.users=1');

    if (zbytky.length) fail(`Po úklidu zůstaly řádky: ${zbytky.join(', ')}`);
    else ok('Po úklidu nezůstala žádná stopa (včetně registrations)');
  } catch (e) {
    info(`Ověření úklidu selhalo: ${e?.message}`);
  }
}

if (KEEP) {
  krok('9. Úklid');
  info(`--keep: nechávám ${email} (user_id ${userId})`);
} else {
  await uklid();
}

souhrn();
process.exit(failed ? 1 : 0);
