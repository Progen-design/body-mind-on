/**
 * Vzory testovacích účtů — regresní test k selhání úklidu ze 14. 8. 2026.
 *
 * `admin:delete-smoketest-users` hledal jen `smoketest+*@bodyandmindon.cz`,
 * zatímco smoke test zakládá `info+bm-smoke-…` a `bm-smoke-…@example.com`.
 * Skript proto skončil s „Nic ke smazání" a 41 testovacích účtů zůstalo
 * v produkci. Úklid, který tiše nic neudělá, vypadá jako úspěch — proto se
 * vzory testují proti TVARŮM, KTERÉ GENERÁTORY OPRAVDU VYRÁBĚJÍ.
 *
 * Druhý směr je nebezpečnější: co se sem omylem přidá, to se smaže. Reálné
 * e-maily se proto testují taky.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isTestAccountEmail } from '../testAccountEmails.js';

/**
 * Přesné tvary ze `scripts/`. Timestampy jsou skutečné z běhů 9.–14. 8. 2026.
 * Klíč je vždy skript, který ten tvar vyrábí — až se generátor změní, tady se
 * to má změnit s ním.
 */
const VYRABI_NASE_SKRIPTY = [
  // smoke-test-critical-path.mjs — proti produkci, maticový režim
  ['info+bm-smoke-bez-diety-1786698162078@bodyandmindon.cz', 'smoke matrix / prod'],
  ['info+bm-smoke-lactose-free-1786362025929@bodyandmindon.cz', 'smoke matrix / prod'],
  // smoke-test-critical-path.mjs — jednoprofilový režim proti produkci
  ['info+bm-smoke-1786297627115@bodyandmindon.cz', 'smoke single / prod'],
  // smoke-test-critical-path.mjs — lokálně (bez SMOKE_TEST_RECIPIENT)
  ['bm-smoke-1786369614630@example.com', 'smoke single / local'],
  ['bm-smoke-gluten-free-1786352285768@example.com', 'smoke matrix / local'],
  // SMOKE_TEST_RECIPIENT na cizí doméně
  ['tester+bm-smoke-veget-1786352270739@seznam.cz', 'smoke / vlastní příjemce'],
  // verify-paid-path.mjs
  ['info+bm-paid-1786698876900@bodyandmindon.cz', 'paid path'],
  ['bm-paid-1786698876900@example.com', 'paid path / local'],
  // e2e-stripe-subscription-test.mjs
  ['stripe.e2e@test.invalid', 'stripe e2e'],
  // historické
  ['smoketest+neco@bodyandmindon.cz', 'historický tvar'],
];

/**
 * Tohle se smazat NESMÍ. `janprikopa@gmail.com` je vlastník účtu, zbytek jsou
 * tvary, které se testovacím jen podobají.
 */
const NESMI_SE_SMAZAT = [
  ['janprikopa@gmail.com', 'vlastník'],
  ['ondra.novak18@gmail.com', 'reálný uživatel'],
  ['info@bodyandmindon.cz', 'firemní schránka bez aliasu'],
  ['info+neco@bodyandmindon.cz', 'ručně založený alias — DB hlídka ho bere, mazání ne'],
  ['info+beta-kohorta1@bodyandmindon.cz', 'beta pozvánka může být živá'],
  ['info+stripe-preview-123@bodyandmindon.cz', 'má vlastní úklidový skript'],
  ['bm-smokehouse@bodyandmindon.cz', 'jen se podobá — chybí pomlčka za bm-smoke'],
  ['neco@bodyandmindontest.cz', 'cizí doména'],
  ['', 'prázdný vstup'],
];

test('vzory chytí každý tvar, který naše skripty vyrábějí', () => {
  for (const [email, zdroj] of VYRABI_NASE_SKRIPTY) {
    assert.equal(
      isTestAccountEmail(email),
      true,
      `„${email}“ vyrábí ${zdroj} — úklid ho musí najít`
    );
  }
});

test('reálné a jen podobné e-maily se nesmažou', () => {
  for (const [email, proc] of NESMI_SE_SMAZAT) {
    assert.equal(
      isTestAccountEmail(email),
      false,
      `„${email}“ se mazat nesmí (${proc})`
    );
  }
});

test('množina je užší než je_testovaci_email() v DB', () => {
  // DB funkce bere jakýkoli `info+…@bodyandmindon.cz`; mazání ne. Kdyby se to
  // srovnalo, přišel by člověk o ručně založený alias.
  assert.equal(isTestAccountEmail('info+cokoliv@bodyandmindon.cz'), false);
  assert.equal(isTestAccountEmail('info+bm-smoke-1@bodyandmindon.cz'), true);
});

test('velikost písmen a mezery nerozhodují', () => {
  assert.equal(isTestAccountEmail('  INFO+BM-SMOKE-1786@BodyAndMindOn.cz  '), true);
  assert.equal(isTestAccountEmail(null), false);
  assert.equal(isTestAccountEmail(undefined), false);
});
