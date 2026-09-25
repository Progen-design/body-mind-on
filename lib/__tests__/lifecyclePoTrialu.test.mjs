/**
 * Lifecycle e-maily po konci trialu + varianta „zítra strhneme" s kartou.
 *
 * Všechno je za flagem LIFECYCLE_TRIAL_ENDED_ENABLED — s vypnutým flagem se
 * chování nesmí změnit ani o čárku (trial bez karty po konci nedostane nic,
 * trial s kartou dostane dosavadní trial_ends_tomorrow).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { eligibleTriggers, isTrialEndedEmailEnabled, pickNextLifecycleEmail } from '../lifecycleEmailRules.js';
import { getLifecycleEmailContent, LIFECYCLE_COPY_KEYS, PROFIL_PREDPLATNE } from '../lifecycleEmailCopy.js';
import { LIFECYCLE_TRIGGERS } from '../lifecycleEmailConstants.js';

const NOW = new Date('2026-09-25T10:00:00Z');
const DEN = 86_400_000;
const pred = (d) => new Date(NOW.getTime() - d * DEN).toISOString();
const za = (d) => new Date(NOW.getTime() + d * DEN).toISOString();

const ZAP = { now: NOW, trialEndedEnabled: true };
const VYP = { now: NOW, trialEndedEnabled: false };

const bezKarty = (konecPred) => ({ status: 'trial', tier: 'START', started_at: pred(konecPred + 7), trial_ends_at: pred(konecPred), stripe_subscription_id: null });
const sKartou = (konecZa) => ({ status: 'trial', tier: 'START', started_at: pred(7 - konecZa), trial_ends_at: za(konecZa), stripe_subscription_id: 'sub_1' });

test('flag: bez proměnné vypnuto, jen „true" zapne', () => {
  assert.equal(isTrialEndedEmailEnabled({}), false);
  assert.equal(isTrialEndedEmailEnabled({ LIFECYCLE_TRIAL_ENDED_ENABLED: '1' }), false);
  assert.equal(isTrialEndedEmailEnabled({ LIFECYCLE_TRIAL_ENDED_ENABLED: 'TRUE ' }), true);
});

test('trial_ended: den po konci trialu bez karty → pošle se (flag zap)', () => {
  const akce = pickNextLifecycleEmail(bezKarty(0.1), { ...ZAP, alreadySent: ['trial_ends_tomorrow'], lastSentAt: pred(1.1) });
  assert.equal(akce?.triggerKey, 'trial_ended');
});

test('trial_ended: s vypnutým flagem nic', () => {
  assert.deepEqual(eligibleTriggers(bezKarty(1), VYP), []);
});

test('trial_ended: kdo dal kartu (subscription), nedostane nic', () => {
  const m = { ...bezKarty(1), stripe_subscription_id: 'sub_1' };
  assert.deepEqual(eligibleTriggers(m, ZAP), []);
});

test('trial_ended: víc než 14 dní po konci už ne; jiný stav než trial taky ne', () => {
  assert.deepEqual(eligibleTriggers(bezKarty(15), ZAP), []);
  assert.deepEqual(eligibleTriggers(bezKarty(13.9), ZAP), ['trial_ended']);
  assert.deepEqual(eligibleTriggers({ ...bezKarty(1), status: 'active' }, ZAP), []);
  assert.deepEqual(eligibleTriggers({ ...bezKarty(1), status: 'canceled' }, ZAP), []);
});

test('trial_ended se pošle jen jednou', () => {
  assert.deepEqual(eligibleTriggers(bezKarty(1), { ...ZAP, alreadySent: ['trial_ended'] }), []);
});

test('winback: 3 dny po konci a jen když odešel trial_ended', () => {
  assert.deepEqual(eligibleTriggers(bezKarty(3), { ...ZAP, alreadySent: [] }), ['trial_ended'], 'bez trial_ended žádný winback');
  assert.deepEqual(eligibleTriggers(bezKarty(2.9), { ...ZAP, alreadySent: ['trial_ended'] }), [], 'před 3. dnem ne');
  const akce = pickNextLifecycleEmail(bezKarty(3), { ...ZAP, alreadySent: ['trial_ended'], lastSentAt: pred(2.9) });
  assert.equal(akce?.triggerKey, 'trial_winback_d3');
  assert.deepEqual(eligibleTriggers(bezKarty(5), { ...ZAP, alreadySent: ['trial_ended', 'trial_winback_d3'] }), [], 'poslední e-mail');
});

test('winback: trial_ended jen ve frontě (neodeslaný) nestačí', () => {
  assert.deepEqual(eligibleTriggers(bezKarty(4), { ...ZAP, alreadySent: ['trial_ended'], sentKeys: [] }), []);
  assert.deepEqual(eligibleTriggers(bezKarty(4), { ...ZAP, alreadySent: ['trial_ended'], sentKeys: ['trial_ended'] }), ['trial_winback_d3']);
});

test('winback respektuje 24h odstup', () => {
  assert.equal(pickNextLifecycleEmail(bezKarty(3), { ...ZAP, alreadySent: ['trial_ended'], lastSentAt: pred(0.5) }), null);
});

test('zítra končí: s kartou (flag zap) → varianta _card, bez karty → původní', () => {
  assert.deepEqual(eligibleTriggers(sKartou(0.5), { ...ZAP, alreadySent: ['trial_welcome', 'trial_day3', 'trial_day5'] }), ['trial_ends_tomorrow_card']);
  const bez = { ...sKartou(0.5), stripe_subscription_id: null };
  assert.deepEqual(eligibleTriggers(bez, { ...ZAP, alreadySent: ['trial_welcome', 'trial_day3', 'trial_day5'] }), ['trial_ends_tomorrow']);
  assert.deepEqual(eligibleTriggers(sKartou(0.5), { ...VYP, alreadySent: ['trial_welcome', 'trial_day3', 'trial_day5'] }), ['trial_ends_tomorrow'], 'flag vyp = beze změny');
});

test('zítra končí: varianta s kartou přebije odstup a nepřijde podruhé', () => {
  const akce = pickNextLifecycleEmail(sKartou(0.5), { ...ZAP, alreadySent: ['trial_welcome', 'trial_day3'], lastSentAt: pred(0.1) });
  assert.equal(akce?.triggerKey, 'trial_ends_tomorrow_card');
  assert.deepEqual(eligibleTriggers(sKartou(0.5), { ...ZAP, alreadySent: ['trial_welcome', 'trial_day3', 'trial_day5', 'trial_ends_tomorrow'] }), []);
});

// ---------------------------------------------------------------- texty

test('každý trigger má text a CTA nových e-mailů vede na ?predplatne=1', () => {
  assert.deepEqual([...LIFECYCLE_COPY_KEYS].sort(), [...LIFECYCLE_TRIGGERS].sort());
  assert.match(PROFIL_PREDPLATNE, /\/profil\?predplatne=1$/);
  for (const k of ['trial_ended', 'trial_winback_d3', 'trial_ends_tomorrow_card']) {
    const c = getLifecycleEmailContent(k, { jmeno: 'Jan' });
    assert.ok(c.html.includes(`href="${PROFIL_PREDPLATNE}"`), k);
  }
});

test('trial_ended: předmět, oslovení v 5. pádě a klíčové věty', () => {
  const c = getLifecycleEmailContent('trial_ended', { jmeno: 'Jan Novák' });
  assert.equal(c.subject, 'Tvůj plán je pozastavený — pokračuj, kde jsi skončil');
  assert.match(c.text, /Ahoj Jane,/);
  assert.match(c.text, /tvých 7 dní zdarma skončilo\. Plán, recepty i TED jsou teď pozastavené — nic se nesmazalo\./);
  assert.match(c.text, /Odemkni START za 599 Kč měsíčně\. Zrušíš kdykoli jedním klepnutím v profilu\./);
  assert.match(c.text, /Pokračovat s plánem →/);
  assert.match(c.text, /Ondra a tým Body & Mind ON/);
  assert.doesNotMatch(c.text, /\{\{osloveni\}\}/);
});

test('bez jména začne e-mail „Ahoj,"', () => {
  assert.match(getLifecycleEmailContent('trial_winback_d3').text, /^Co ti chybělo\?\nAhoj,\n/);
});

test('winback a varianta s kartou: texty ze zadání', () => {
  const w = getLifecycleEmailContent('trial_winback_d3', { jmeno: 'Eva' });
  assert.equal(w.subject, 'Co ti chybělo?');
  assert.match(w.text, /Tohle je poslední e-mail k trialu, dál tě zahlcovat nebudeme\./);
  const k = getLifecycleEmailContent('trial_ends_tomorrow_card');
  assert.match(k.text, /Zítra ti skončí zkušební období a strhneme první platbu 599 Kč\./);
  assert.match(k.text, /Zruš předplatné v profilu ještě dnes — nic nezaplatíš\./);
  assert.match(k.text, /Spravovat předplatné →/);
});
