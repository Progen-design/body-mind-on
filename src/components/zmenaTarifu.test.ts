/**
 * UI přechodu START ↔ ON CLUB: tlačítko místo Checkoutu, náhled ceny ze
 * serveru, souhlas s OP před upgradem, naplánovaný downgrade jde zrušit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ZMENA = cti('./ZmenaTarifu.tsx');
const UCET = cti('./UcetASpravaSection.tsx');

test('náhled i změna jdou přes /api/subscription/change-tier, ne přes Checkout', () => {
  assert.match(ZMENA, /apiFetch<Stav>\('\/api\/subscription\/change-tier', \{ method: 'GET' \}\)/);
  assert.match(ZMENA, /JSON\.stringify\(\{ tier: 'ON_CLUB', souhlas: true \}\)/);
  assert.match(ZMENA, /JSON\.stringify\(\{ tier: 'START' \}\)/);
  assert.match(ZMENA, /zavolej\(\{ method: 'DELETE' \}/);
  assert.doesNotMatch(ZMENA, /spustitCheckout|create-checkout-session/);
});

test('texty náhledu: „Dnes doplatíš X Kč, dál …/měsíc" a v trialu „Dnes 0 Kč, od <datum> …"', () => {
  assert.match(ZMENA, /return `Dnes 0 Kč, od \$\{od\} \$\{dal\}\/měsíc`;/);
  assert.match(ZMENA, /return `Dnes doplatíš \$\{kc\(s\.dnes_kc \?\? 0\)\}, dál \$\{dal\}\/měsíc`;/);
  assert.match(ZMENA, /Od \{od \?\? 'dalšího období'\} přejdeš na START \(\{kc\(stav\.dal_kc \?\? 599\)\}\/měsíc\)/);
  assert.match(ZMENA, /Zrušit změnu/);
});

test('upgrade nejde potvrdit bez zaškrtnutého souhlasu s obchodními podmínkami', () => {
  assert.match(ZMENA, /disabled=\{odesilam \|\| \(upgrade && !souhlas\)\}/);
  assert.match(ZMENA, /type="checkbox" checked=\{souhlas\}/);
  assert.match(ZMENA, /služba začne hned a při odstoupení do 14 dnů zaplatím poměrnou část/);
});

test('Účet a předplatné: u běžícího předplatného tlačítko změny, žádný Checkout na vyšší tarif', () => {
  assert.match(UCET, /<ZmenaTarifu aktivni=\{predplatneNastavene\} onZmena=\{onZmenaPredplatneho\} \/>/);
  assert.match(UCET, /\{plan\?\.zamceno && !predplatneNastavene && \(/);
  assert.match(ZMENA, /'Přejít na ON CLUB' : 'Přejít na START'/);
});
