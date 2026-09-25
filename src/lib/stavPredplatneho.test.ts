/**
 * Odvozený stav předplatného — po Checkoutu v trialu už žádné „Odemknout".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  maNastavenePredplatne,
  odvodStavPredplatneho,
  popisClenstvi,
  textNastavenehoPredplatneho,
} from './stavPredplatneho.ts';
import { naProfil } from '../data/adaptery.ts';

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---------------------------------------------------------------- 4 případy

test('trial bez předplatného → trial_bez_karty (prodávat)', () => {
  assert.equal(odvodStavPredplatneho('trial', false), 'trial_bez_karty');
  assert.equal(maNastavenePredplatne('trial_bez_karty'), false);
});

test('trial s nastaveným předplatným (po Checkoutu) → trial_s_kartou (už neprodávat)', () => {
  assert.equal(odvodStavPredplatneho('trial', true), 'trial_s_kartou');
  assert.equal(maNastavenePredplatne('trial_s_kartou'), true);
});

test('active → active', () => {
  assert.equal(odvodStavPredplatneho('active', true), 'active');
  assert.equal(maNastavenePredplatne('active'), true);
});

test('canceled / past_due / pending_payment / expired zůstávají, neznámý → neznamy', () => {
  assert.equal(odvodStavPredplatneho('canceled', true), 'canceled');
  assert.equal(odvodStavPredplatneho('past_due', true), 'past_due');
  assert.equal(odvodStavPredplatneho('pending_payment', false), 'pending_payment');
  assert.equal(odvodStavPredplatneho('expired', false), 'expired');
  assert.equal(odvodStavPredplatneho('nesmysl', false), 'neznamy');
  assert.equal(odvodStavPredplatneho(null, false), 'neznamy');
  assert.equal(maNastavenePredplatne('canceled'), false);
});

// ---------------------------------------------------------------- texty

test('popis členství: „START · předplatné aktivní od {datum}" místo „zkušební období"', () => {
  assert.equal(popisClenstvi('START', 'trial_s_kartou', '2026-09-25T09:30:00Z'), 'START · předplatné aktivní od 25. 9. 2026');
  assert.equal(popisClenstvi('START', 'active', '2026-09-25T09:30:00Z'), 'START · předplatné aktivní od 25. 9. 2026');
  assert.equal(popisClenstvi('START', 'trial_bez_karty', '2026-09-20T09:30:00Z'), 'START · zkušební období');
  assert.equal(popisClenstvi('START', 'trial_s_kartou', null), 'START · předplatné aktivní');
});

test('po upgradu v trialu věta mluví o ON CLUBU a jeho ceně', () => {
  assert.equal(
    textNastavenehoPredplatneho('2026-10-02', 'ON Club'),
    'Předplatné ON CLUB je nastavené. První platba 1\u00a0499 Kč proběhne 2. 10. 2026. Do té doby máš plný přístup.',
  );
});

test('klidná věta s datem a částkou první platby', () => {
  assert.equal(
    textNastavenehoPredplatneho('2026-10-02'),
    'Předplatné START je nastavené. První platba 599 Kč proběhne 2. 10. 2026. Do té doby máš plný přístup.',
  );
});

// ---------------------------------------------------------------- adaptér

const odpoved = (extra: Record<string, unknown>) => ({
  program: 'START',
  membershipStatus: 'trial',
  membershipSince: '2026-09-25T09:30:00Z',
  trial: { konci: '2026-10-02', dny_do_konce: 7 },
  user: { name: 'Jan', email: 'jan@example.cz' },
  body_metrics: [],
  ...extra,
});

test('adaptér: trial po Checkoutu je AKTIVNÍ bez odpočtu, s datem první platby', () => {
  const p = naProfil(odpoved({ ma_predplatne: true }) as never);
  assert.equal(p.stavPredplatneho, 'trial_s_kartou');
  assert.equal(p.status, 'AKTIVNÍ');
  assert.equal(p.trialDniDoKonce, null, 'odpočet „končí za N dní" se neukazuje');
  assert.equal(p.trialKonci, '2026-10-02');
  assert.equal(p.clenemOd, '2026-09-25T09:30:00Z');
});

test('adaptér: trial bez předplatného zůstává TRIAL s odpočtem', () => {
  const p = naProfil(odpoved({ ma_predplatne: false }) as never);
  assert.equal(p.stavPredplatneho, 'trial_bez_karty');
  assert.equal(p.status, 'TRIAL');
  assert.equal(p.trialDniDoKonce, 7);
});

// ---------------------------------------------------------------- napojení UI

test('pruh na Dnes: u trial_s_kartou klidná věta a žádné „Odemknout"', () => {
  const pruh = cti('../components/TrialCountdownStrip.tsx');
  const vetev = pruh.slice(pruh.indexOf("if (stavPredplatneho === 'trial_s_kartou')"), pruh.indexOf('if (!zamceno) return null;'));
  assert.ok(vetev.length > 0, 'větev pro trial_s_kartou chybí');
  assert.match(vetev, /textNastavenehoPredplatneho\(trialKonci, plan, predplatne\)/);
  assert.doesNotMatch(vetev, /Odemknout|<button/);
  assert.match(cti('../components/DnesObrazovka.tsx'), /stavPredplatneho=\{profile\.stavPredplatneho\}/);
});

test('Účet a předplatné: START se s nastaveným předplatným nenabízí, zrušení zůstává', () => {
  const ucet = cti('../components/UcetASpravaSection.tsx');
  assert.match(ucet, /\{plan\?\.zamceno && !predplatneNastavene && \(/);
  assert.match(ucet, /<ZmenaTarifu aktivni=\{predplatneNastavene\}/);
  assert.match(ucet, /popisClenstvi\(profile\.membershipPlan, profile\.stavPredplatneho, profile\.clenemOd, profile\.predplatne \?\? null\)/);
  assert.match(ucet, /Zrušit předplatné/);
  const nabidka = cti('../components/PredplatneNabidka.tsx');
  assert.match(nabidka, /!\(bezStartu && t === 'START'\)/);
});

test('návrat z Checkoutu: jednorázový toast a parametr pryč z URL', () => {
  const app = cti('../App.tsx');
  assert.match(app, /parametry\.get\('checkout'\) !== 'success'/);
  assert.match(app, /'Hotovo — karta uložená, předplatné běží\.'/);
  assert.match(app, /url\.searchParams\.delete\('checkout'\)/);
  assert.match(app, /checkoutToastUkazan\.current = true/);
});
