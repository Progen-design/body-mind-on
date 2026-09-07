/**
 * docs/DALSI_KROK.md 9.7 — SEDM DNÍ ZDARMA MUSÍ BÝT OPRAVDU SEDM.
 *
 * PROČ TENHLE TEST EXISTUJE
 * Plán se vyrábí při registraci s `valid_from` = den registrace, ale odemyká
 * se až checkoutem. Kdo odemkne třetí den, dostal ze slíbených sedmi dní
 * reálně čtyři; účet, který se registroval 3. 8. 2026 a zaplatil 13. 8.,
 * odemykal plán, který už čtyři dny neplatil.
 *
 * `supabaseServer` se nedá podvrhnout přes import (stejně jako
 * v stripeSkipAlert.test.mjs), takže se testuje tvar zdrojáku.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');
const webhook = readFileSync(join(KOREN, 'api', 'webhooks', 'stripe.js'), 'utf8');

test('překotvení existuje a posouvá okno o přesně 7 dní', () => {
  const i = webhook.indexOf('async function prekotviPrvniPlanNaOdemceni');
  assert.ok(i > 0, 'funkce prekotviPrvniPlanNaOdemceni se nenašla');
  const telo = webhook.slice(i, i + 2600);

  assert.match(telo, /addCalendarDaysIsoPrague\(dnes, 6\)/,
    'valid_until = valid_from + 6, tedy sedm dní včetně prvního');
  assert.match(telo, /valid_from: dnes/, 'plán začíná dnem odemčení');
  assert.match(telo, /\.order\('valid_from', \{ ascending: true \}\)/,
    'bere se NEJSTARŠÍ plán — ten z registrace');
});

test('nepřegenerovává, jen posouvá okno', () => {
  const i = webhook.indexOf('async function prekotviPrvniPlanNaOdemceni');
  const telo = webhook.slice(i, i + 2600);

  // Do plánu se smí sáhnout jen na datumy a updated_at. Kdyby sem někdo
  // přidal generování, vyměnilo by to uživateli jídelníček, na který se už
  // mohl dívat v e-mailu.
  assert.equal(/structured_plan_json|meal_plan|plan_html|generatePlan|orchestr/i.test(telo), false,
    'obsah plánu se nesmí přegenerovat — je to posun okna, nic víc');
});

test('nesahá na plán, na kterém už uživatel něco odškrtal', () => {
  const i = webhook.indexOf('async function prekotviPrvniPlanNaOdemceni');
  const telo = webhook.slice(i, i + 2600);

  assert.match(telo, /daily_activity_completions/,
    'dokončení se musí zkontrolovat před posunem');
  assert.match(telo, /\(count \?\? 0\) > 0/, 'a při nenulovém počtu se nic neposouvá');
});

test('registrace a odemčení týž den → nic se neděje', () => {
  const i = webhook.indexOf('async function prekotviPrvniPlanNaOdemceni');
  const telo = webhook.slice(i, i + 2600);

  assert.match(telo, /od >= dnes/,
    'plán, který už začíná dnes nebo později, se neposouvá (dnes většina účtů)');
  assert.match(telo, /!prvni\.is_active/, 'neaktivní plán se neposouvá');
});

test('volá se při odemčení, NE při trialing → active o týden později', () => {
  assert.match(webhook, /membershipStatus === 'active' \|\| membershipStatus === 'trial'\)\s*\{\s*await prekotviPrvniPlanNaOdemceni/,
    'checkout větev: platí pro trial i active');

  // V subscription.updated větvi (trialing → active) se volat NESMÍ, jinak by
  // se plán posunul podruhé, týden po odemčení.
  const iSub = webhook.indexOf("case 'customer.subscription.updated'");
  assert.ok(iSub > 0);
  assert.equal(webhook.slice(iSub).includes('prekotviPrvniPlanNaOdemceni'), false,
    'v subscription.updated se překotvení volat nesmí');
});

test('selhání se nepropíše do odpovědi webhooku — Stripe čeká na 200', () => {
  const i = webhook.indexOf('async function prekotviPrvniPlanNaOdemceni');
  const telo = webhook.slice(i, i + 2600);
  assert.match(telo, /catch \(e\)/, 'celé tělo je v try/catch');
  assert.equal(/throw\s+(e|err)\s*;/.test(telo.slice(telo.indexOf('catch (e)'))), false,
    'chyba se jen zaloguje, nesmí vybublat ven');
});
