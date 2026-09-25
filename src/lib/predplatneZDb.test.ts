/**
 * Texty předplatného ze zrcadla Stripe (public.subscriptions), ne z konstant.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { popisClenstvi, textNastavenehoPredplatneho, type PredplatneUi } from './stavPredplatneho.ts';
import { naProfil } from '../data/adaptery.ts';

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const zaklad: PredplatneUi = { plan: 'START', cena_kc: 599, stav: 'trialing', trial_do: '2026-10-02T10:00:00Z', dalsi_platba: '2026-10-02T10:00:00Z', konci_k: null, poukaz: false };

test('trial s kartou: cena a datum první platby ze subscriptions — i jiná cena než 599', () => {
  assert.equal(
    textNastavenehoPredplatneho('2026-09-30', 'START', { ...zaklad, cena_kc: 499 }),
    'Předplatné START je nastavené. První platba 499 Kč proběhne 2. 10. 2026. Do té doby máš plný přístup.',
  );
});

test('poukaz: „zdarma do D (poukaz)"', () => {
  const p = { ...zaklad, trial_do: '2026-10-25T10:00:00Z', dalsi_platba: '2026-10-25T10:00:00Z', poukaz: true };
  assert.equal(textNastavenehoPredplatneho(null, 'START', p), 'Předplatné START je nastavené — zdarma do 25. 10. 2026 (poukaz). Pak 599 Kč měsíčně.');
  assert.equal(popisClenstvi('START', 'trial_s_kartou', '2026-09-25', p), 'START · zdarma do 25. 10. 2026 (poukaz)');
});

test('aktivní: „předplatné aktivní · další platba N Kč D" ze subscriptions', () => {
  const p = { ...zaklad, plan: 'ON_CLUB', cena_kc: 1499, stav: 'active', trial_do: null, dalsi_platba: '2026-10-15T10:00:00Z' };
  assert.equal(popisClenstvi('ON Club', 'active', '2026-09-01', p), 'ON Club · předplatné aktivní · další platba 1 499 Kč 15. 10. 2026');
});

test('zrušeno ke konci období: „Předplatné končí D"', () => {
  const p = { ...zaklad, stav: 'active', trial_do: null, dalsi_platba: null, konci_k: '2026-10-15T10:00:00Z' };
  assert.equal(popisClenstvi('START', 'active', null, p), 'START · předplatné končí 15. 10. 2026');
  assert.equal(textNastavenehoPredplatneho(null, 'START', p), 'Předplatné START končí 15. 10. 2026. Do té doby máš plný přístup.');
});

test('bez zrcadla (před backfillem) zůstávají dosavadní texty', () => {
  assert.equal(popisClenstvi('START', 'active', '2026-09-25T09:30:00Z', null), 'START · předplatné aktivní od 25. 9. 2026');
  assert.match(textNastavenehoPredplatneho('2026-10-02', 'START', null), /První platba 599 Kč proběhne 2\. 10\. 2026/);
});

test('adaptér předá predplatne z /api/profile do profilu', () => {
  const p = naProfil({ program: 'START', membershipStatus: 'trial', ma_predplatne: true, predplatne: zaklad, user: { name: 'Jan', email: 'j@x.cz' }, body_metrics: [] } as never);
  assert.deepEqual(p.predplatne, zaklad);
});

test('Účet a předplatné: při zrušení ke konci období „Předplatné končí D" + „Obnovit předplatné" (cancel obnovit:true)', () => {
  const ucet = cti('../components/UcetASpravaSection.tsx');
  assert.match(ucet, /Date\.parse\(String\(profile\.predplatne\?\.konci_k \|\| ''\)\)/);
  assert.match(ucet, /\{konciK && zruseniStav\?\.text !== 'Předplatné je zase aktivní\.' \? \(/);
  assert.match(ucet, /Předplatné končí \{konciK\}/);
  assert.match(ucet, /onClick=\{\(\) => zrusitPredplatne\(true\)\}[\s\S]{0,300}Obnovit předplatné/);
  assert.match(ucet, /textNastavenehoPredplatneho\(profile\.trialKonci, profile\.membershipPlan, profile\.predplatne \?\? null\)/);
});
