/**
 * FRONTA GENERÁTORU: co je vadná objednávka a co jen výpadek.
 *
 * 17. 8. 2026 vrátil OpenAI `429 credit_balance_exhausted` a fronta si tím
 * naskládala 70 položek ve stavu `failed`. Ani jedna z nich nebyla vadná —
 * jen se v tu chvíli nedalo pracovat. `failed` znamená „tuhle poptávku už
 * nezkoušej“, takže se takhle zahodilo 70 děr v katalogu, které by příští
 * běh bez problému doplnil.
 *
 * Druhá polovina té samé chyby: `posledni_chyba` se plnila textem
 * „nic nezapsáno“, což o příčině neříká nic. Informace o vyčerpaném kreditu
 * kvůli tomu ležela dva dny neviditelná.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { jeInfrastrukturniChyba, popisChybyBehu } from '../plan/chybyGeneratoru.js';

test('výpadky infrastruktury se poznají podle HTTP kódu', () => {
  for (const status of [401, 403, 429, 500, 502, 503]) {
    assert.equal(jeInfrastrukturniChyba({ status }), true, `HTTP ${status}`);
  }
});

test('vyčerpaný kredit je infrastruktura, ne vadná objednávka', () => {
  assert.equal(jeInfrastrukturniChyba({ code: 'insufficient_quota' }), true);
  assert.equal(jeInfrastrukturniChyba({ message: 'credit_balance_exhausted' }), true);
  assert.equal(jeInfrastrukturniChyba({ message: 'Rate limit reached for gpt-4o' }), true);
});

test('síťové pády taky', () => {
  for (const m of ['ECONNRESET', 'ETIMEDOUT', 'socket hang up', 'fetch failed', 'timeout of 30000ms']) {
    assert.equal(jeInfrastrukturniChyba({ message: m }), true, m);
  }
});

test('vadná odpověď modelu infrastruktura NENÍ — ta má skončit jako failed', () => {
  assert.equal(jeInfrastrukturniChyba({ status: 400, message: 'invalid schema' }), false);
  assert.equal(jeInfrastrukturniChyba({ message: 'recept obsahuje zakázanou surovinu' }), false);
  assert.equal(jeInfrastrukturniChyba(null), false);
  assert.equal(jeInfrastrukturniChyba(undefined), false);
});

test('popis chyby vždycky nese příčinu, nikdy jen „nic nezapsáno“', () => {
  const s = popisChybyBehu({ code: 'insufficient_quota', message: 'You exceeded your quota' }, []);
  assert.match(s, /insufficient_quota/, 'kód musí v textu zůstat');
  assert.match(s, /volání modelu selhalo/);
});

test('bez výjimky se popíšou nedohledané suroviny', () => {
  assert.equal(popisChybyBehu(null, ['tempeh', 'quinoa']), 'tempeh, quinoa');
});

test('ani prázdný vstup nesmí dát prázdný text', () => {
  const s = popisChybyBehu(null, []);
  assert.ok(s.length > 0, 'prázdná příčina = nedohledatelná příčina');
  assert.match(s, /validac/i);
});

test('popis se ořízne, aby nepřetekl sloupec', () => {
  const dlouhy = popisChybyBehu({ message: 'x'.repeat(1000) }, []);
  assert.ok(dlouhy.length <= 350, `délka ${dlouhy.length}`);
});
