/**
 * PRAVIDLA OBNOVY PLÁNU — jeden zdroj pravdy pro bránu, producenta i profil.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 10. 8. 2026 mělo 43 členství status 'trial' a nikdo neměl druhý plán. Nula
 * druhých plánů byla SPRÁVNĚ — `canRenewPlanForMembership()` dává STARTu
 * v trialu jen `initial_plan`. Jenže profil si expiraci počítal sám
 * (`trialEndsAt < now`), takže totéž pravidlo existovalo na dvou místech.
 * Rozejít se mohla při první změně tarifů a uživateli bychom slíbili plán,
 * který mu producent nikdy nezaloží.
 *
 * Test proto hlídá dvě věci:
 *   1. samotná pravidla (kdo dostane následný plán a kdo ne),
 *   2. že profil ani UI si je neopisují.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  canRenewPlanForMembership,
  isExpired,
  isPlanTask,
  shouldShowTrialPlanScopeNote,
} from '../planRenewalRules.js';
import { isTrialEligible, trialDaysForCheckout, TRIAL_PERIOD_DAYS } from '../trialEligibility.js';

const KOREN = join(import.meta.dirname, '..', '..');
const VCERA = new Date(Date.now() - 86400000).toISOString();
const ZITRA = new Date(Date.now() + 86400000).toISOString();

test('START v běžícím trialu dostane jen první plán', () => {
  const v = canRenewPlanForMembership({ tier: 'START', status: 'trial', trial_ends_at: ZITRA });
  assert.equal(v.allowed, false);
  assert.equal(v.reason, 'start_trial_allows_initial_plan_only');
  assert.equal(v.trialEnded, false);
});

test('START po vypršení trialu potřebuje předplatné', () => {
  const v = canRenewPlanForMembership({ tier: 'START', status: 'trial', trial_ends_at: VCERA });
  assert.equal(v.allowed, false);
  assert.equal(v.reason, 'start_trial_expired_upgrade_required');
  assert.equal(v.trialEnded, true);
});

test('START s active dostane týdenní plán — i když trial dávno vypršel', () => {
  // Tohle je ta jediná cesta k druhému plánu a webhook ji otevírá tím, že
  // nastaví status='active'.
  const v = canRenewPlanForMembership({ tier: 'START', status: 'active', trial_ends_at: VCERA });
  assert.equal(v.allowed, true);
  assert.equal(v.reason, 'start_active');
});

test('nezaplacené a prodlené členství plán nedostane', () => {
  for (const status of ['pending_payment', 'past_due']) {
    const v = canRenewPlanForMembership({ tier: 'START', status, trial_ends_at: ZITRA });
    assert.equal(v.allowed, false, status);
  }
  assert.equal(
    canRenewPlanForMembership({ tier: 'ON_CLUB', status: 'canceled' }).reason,
    'paid_membership_inactive'
  );
  assert.equal(
    canRenewPlanForMembership(null).reason,
    'missing_membership_for_plan_task'
  );
});

test('placené tarify se neřídí trialem', () => {
  for (const tier of ['ON_CLUB', 'VIP']) {
    assert.equal(canRenewPlanForMembership({ tier, status: 'active' }).allowed, true, tier);
    // Vypršelý trial u placeného tarifu nesmí přístup vzít.
    const v = canRenewPlanForMembership({ tier, status: 'active', trial_ends_at: VCERA });
    assert.equal(v.allowed, true, `${tier} s vypršelým trialem`);
    assert.equal(v.trialEnded, true, 'trialEnded se hlásí, ale nerozhoduje');
  }
});

test('isExpired nespadne na nesmyslech', () => {
  assert.equal(isExpired(null), false);
  assert.equal(isExpired(''), false);
  assert.equal(isExpired('nesmysl'), false);
  assert.equal(isExpired(VCERA), true);
  assert.equal(isExpired(ZITRA), false);
});

test('isPlanTask pozná plánovací úlohy', () => {
  assert.equal(isPlanTask('trainer', 'cokoli'), true);
  assert.equal(isPlanTask('jiny', 'weekly_plan_update'), true);
  assert.equal(isPlanTask('jiny', 'initial_plan'), true);
  assert.equal(isPlanTask('jiny', 'send_email'), false);
});

test('nota o rozsahu trialu se zobrazí jen v běžícím trialu', () => {
  // Stav, který v UI chyběl: 41 ze 43 členství bylo přesně tady.
  assert.equal(
    shouldShowTrialPlanScopeNote({ plan_renewal: { reason: 'start_trial_allows_initial_plan_only' } }),
    true
  );
  // Po expiraci jede paywall, ne tahle nota.
  assert.equal(
    shouldShowTrialPlanScopeNote({ plan_renewal: { reason: 'start_trial_expired_upgrade_required' } }),
    false
  );
  // Platícímu se nic neříká.
  assert.equal(shouldShowTrialPlanScopeNote({ plan_renewal: { reason: 'start_active' } }), false);
  assert.equal(shouldShowTrialPlanScopeNote(null), false);
  assert.equal(shouldShowTrialPlanScopeNote({}), false);
});

test('predikát pro notu stojí na plan_renewal.reason z brány', () => {
  // Kdyby si o zobrazení rozhodovala komponenta porovnáním datumů, je to opět
  // dvě místa nad týmiž daty. Rozhoduje `reason` z brány.
  const pravidla = readFileSync(join(KOREN, 'lib', 'planRenewalRules.js'), 'utf8');
  assert.match(pravidla, /plan_renewal\?\.reason/, 'predikát musí stát na plan_renewal.reason');
});

// PROMPT_UKLID.md (2026-09-17) — `_legacy-next/components/TrialPlanScopeNote.js`
// byla jediná komponenta v celém repu, která `shouldShowTrialPlanScopeNote`
// vůbec volala (ověřeno greppem přes src/, api/, lib/ mimo _legacy-next a testy).
// `api/profile.js` dál posílá `plan_renewal` v odpovědi (viz test níž), ale
// žádný soubor v `src/` ho nečte a notu „v trialu dostaneš jen první plán"
// nikde nezobrazuje — `src/components/TrialPaywallCard.tsx` řeší jen VYPRŠELÝ
// trial (paywall), ne běžící trial. Gap se nevymýšlí, jen se pinuje a hlásí
// v reportu k PROMPT_UKLID.md — až frontend stranu někdo dopíše do src/,
// tenhle test spadne a je potřeba ho přepsat na kontrolu toho místa.
//
// 25. 9. 2026: src/ plan_renewal čte — JEN adaptér (src/data/adaptery.ts),
// a jen `trial_ended` pro zamčený plán po trialu (profile.planPozastaveny →
// PlanPozastavenyKarta). Nota o rozsahu BĚŽÍCÍHO trialu pořád nikde není.
test('plan_renewal čte v src/ jen adaptér (trial_ended → pozastavený plán); nota o rozsahu trialu pořád chybí', () => {
  const zdroj = readFileSync(join(KOREN, 'api', 'profile.js'), 'utf8');
  assert.match(zdroj, /plan_renewal:\s*\{/, 'api/profile.js pořád posílá plan_renewal — backend strana žije');

  const srcDir = join(KOREN, 'src');
  const soubory = [];
  (function projdi(d) {
    for (const jmeno of readdirSync(d)) {
      const p = join(d, jmeno);
      if (statSync(p).isDirectory()) projdi(p);
      else if (/\.(tsx?|jsx?)$/.test(jmeno) && !/\.test\./.test(jmeno)) soubory.push(p);
    }
  })(srcDir);

  const cteDoPlanRenewal = soubory
    .filter((p) => /plan_renewal/.test(readFileSync(p, 'utf8')))
    .map((p) => p.slice(srcDir.length + 1).replace(/\\/g, '/'));

  assert.deepEqual(cteDoPlanRenewal, ['data/adaptery.ts'], 'plan_renewal smí číst jen adaptér');
  const adapter = readFileSync(join(srcDir, 'data', 'adaptery.ts'), 'utf8');
  assert.match(adapter, /jePlanPozastaveny\(stavPredplatneho, odpoved\.plan_renewal\?\.trial_ended === true\)/);
  assert.ok(
    soubory.every((p) => !/shouldShowTrialPlanScopeNote|TrialPlanScopeNote/.test(readFileSync(p, 'utf8'))),
    'nota o rozsahu trialu se v src/ objevila — přepiš test na kontrolu té komponenty'
  );
});

test('/api/profile posílá verdikt brány a nepočítá expiraci sám', () => {
  const zdroj = readFileSync(join(KOREN, 'api', 'profile.js'), 'utf8');

  assert.match(zdroj, /canRenewPlanForMembership\(/, 'profil musí volat bránu');
  assert.match(zdroj, /plan_renewal:\s*\{/, 'odpověď musí nést plan_renewal');
  assert.match(
    zdroj,
    /const isTrialExpired = program === 'START' && planRenewal\.trialEnded/,
    'isTrialExpired se musí odvozovat z verdiktu brány, ne z porovnání datumů'
  );
  assert.equal(
    /isTrialExpired\s*=\s*program === 'START' && trialEndsAt && new Date\(trialEndsAt\) < now/.test(zdroj),
    false,
    'v profilu zůstalo vlastní počítání expirace'
  );
});

test('nárok na Stripe trial: registrovaný uživatel ho už nemá', () => {
  // Registrace vždycky zapíše trial_ends_at, takže checkout jde rovnou na
  // placené a subscription je hned 'active'. Kdyby to přestalo platit,
  // subscription bude 'trialing', membership zůstane 'trial' a druhý plán
  // nepřijde o dalších 7 dní — což by verify:paid-path udělalo nezakončitelným.
  assert.equal(isTrialEligible({ status: 'trial', trial_ends_at: ZITRA }), false);
  assert.equal(trialDaysForCheckout('START', { status: 'trial', trial_ends_at: ZITRA }), undefined);

  // Úplně nový člověk bez členství nárok má.
  assert.equal(isTrialEligible(null), true);
  assert.equal(trialDaysForCheckout('START', null), TRIAL_PERIOD_DAYS);

  // Trial je jen pro START.
  assert.equal(trialDaysForCheckout('ON_CLUB', null), undefined);
});
