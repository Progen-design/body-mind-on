// Meze výšky sdílené mezi lib/updateHeightCm.js a modalem (PreferencesModal.tsx).
// Kdyz se rozejdou, uzivatel dostane jinou hlasku podle toho, kde ho co
// zastavi — nebo posle hodnotu, kterou server odmitne az 400.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CHYBA_VYSKY, MAX_VYSKA_CM, MIN_VYSKA_CM, overVysku } from '../../lib/vyskaMeze.js';

test('hranice jsou včetně krajních hodnot', () => {
  assert.equal(overVysku(MIN_VYSKA_CM).ok, true);
  assert.equal(overVysku(MAX_VYSKA_CM).ok, true);
  assert.equal(overVysku(MIN_VYSKA_CM - 1).ok, false);
  assert.equal(overVysku(MAX_VYSKA_CM + 1).ok, false);
});

test('desetinná čárka i tečka projdou stejně', () => {
  assert.deepEqual(overVysku('182,5'), { ok: true, cm: 182.5 });
  assert.deepEqual(overVysku('182.5'), { ok: true, cm: 182.5 });
});

test('nesmysly neprojdou', () => {
  for (const vstup of ['', '   ', 'abc', null, undefined, NaN, Infinity, {}, []]) {
    const v = overVysku(vstup as never);
    assert.equal(v.ok, false, `${JSON.stringify(vstup)} proslo`);
    assert.equal((v as { chyba: string }).chyba, CHYBA_VYSKY);
  }
});

test('hláška nese obě meze, ať se nerozejde s textem v UI', () => {
  assert.match(CHYBA_VYSKY, new RegExp(String(MIN_VYSKA_CM)));
  assert.match(CHYBA_VYSKY, new RegExp(String(MAX_VYSKA_CM)));
});

test('PreferencesModal.tsx bere meze ze sdíleného modulu, nemá je natvrdo', () => {
  const modal = fs.readFileSync(new URL('../components/PreferencesModal.tsx', import.meta.url), 'utf8');

  assert.match(modal, /from '\.\.\/\.\.\/lib\/vyskaMeze\.js'/, 'modal neimportuje sdilene meze');
  assert.equal(
    /height_cm\s*[<>]=?\s*\d/.test(modal),
    false,
    'v modalu zustaly meze vysky natvrdo'
  );
});

test('api/profile-settings.js a api/profile-body-data.js berou meze ze stejného modulu', () => {
  for (const soubor of ['../../api/profile-settings.js', '../../api/profile-body-data.js']) {
    const handler = fs.readFileSync(new URL(soubor, import.meta.url), 'utf8');
    assert.match(
      handler,
      /from '\.\.\/lib\/updateHeightCm\.js'/,
      `${soubor} nejde přes updateHeightCm.js (a tedy ani přes lib/vyskaMeze.js)`
    );
  }
});
