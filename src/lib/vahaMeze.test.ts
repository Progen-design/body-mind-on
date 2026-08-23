// Meze vahy sdilene mezi api/quick-weight.js a modalem.
// Kdyz se rozejdou, uzivatel dostane jinou hlasku podle toho, kde ho co
// zastavi — nebo posle hodnotu, kterou server odmitne az 400.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CHYBA_VAHY, MAX_VAHA_KG, MIN_VAHA_KG, overVahu } from '../../lib/vahaMeze.js';

test('hranice jsou včetně krajních hodnot', () => {
  assert.equal(overVahu(MIN_VAHA_KG).ok, true);
  assert.equal(overVahu(MAX_VAHA_KG).ok, true);
  assert.equal(overVahu(MIN_VAHA_KG - 0.1).ok, false);
  assert.equal(overVahu(MAX_VAHA_KG + 0.1).ok, false);
});

test('desetinná čárka i tečka projdou stejně', () => {
  // Ceska klavesnice dava carku; bez prevodu by Number('82,5') bylo NaN.
  assert.deepEqual(overVahu('82,5'), { ok: true, kg: 82.5 });
  assert.deepEqual(overVahu('82.5'), { ok: true, kg: 82.5 });
});

test('nesmysly neprojdou', () => {
  for (const vstup of ['', '   ', 'abc', null, undefined, NaN, Infinity, {}, []]) {
    const v = overVahu(vstup as never);
    assert.equal(v.ok, false, `${JSON.stringify(vstup)} proslo`);
    assert.equal((v as { chyba: string }).chyba, CHYBA_VAHY);
  }
});

test('hláška nese obě meze, ať se nerozejde s textem v UI', () => {
  assert.match(CHYBA_VAHY, new RegExp(String(MIN_VAHA_KG)));
  assert.match(CHYBA_VAHY, new RegExp(String(MAX_VAHA_KG)));
});

test('api/quick-weight.js bere meze ze sdíleného modulu, nemá je natvrdo', () => {
  // Regrese: driv byly 30 a 300 zapsane primo v handleru a klient o nich
  // nevedel.
  const handler = fs.readFileSync(new URL('../../api/quick-weight.js', import.meta.url), 'utf8');

  assert.match(handler, /from '\.\.\/lib\/vahaMeze\.js'/, 'handler neimportuje sdilene meze');
  assert.equal(
    /weight_kg\s*<\s*30|weight_kg\s*>\s*300/.test(handler),
    false,
    'v handleru zustaly meze natvrdo'
  );
});
