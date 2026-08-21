import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableAccounts,
  defaultAccount,
  defaultAccountId,
  findAccount,
  resolveAccount
} from './accounts.ts';

test('výchozí profil je Jan a odpovídá defaultAccountId', () => {
  assert.equal(defaultAccount.id, defaultAccountId);
  assert.match(defaultAccount.name, /Jan/);
});

test('známé id vrátí svůj účet', () => {
  for (const ucet of availableAccounts) {
    assert.equal(resolveAccount(ucet.id).id, ucet.id);
  }
});

test('id "jan-prikopa" vede na Jana, ne na chybu', () => {
  assert.equal(resolveAccount('jan-prikopa').id, defaultAccountId);
  assert.equal(resolveAccount('JAN-PRIKOPA').id, defaultAccountId);
});

test('neplatná a prázdná id spadnou na výchozí profil místo pádu', () => {
  const nesmysly: unknown[] = [null, undefined, '', '   ', 'acc-neexistuje', 42, {}, []];

  for (const vstup of nesmysly) {
    const ucet = resolveAccount(vstup as string);
    assert.equal(ucet.id, defaultAccountId, `spatny fallback pro ${JSON.stringify(vstup)}`);
    assert.ok(ucet.name && ucet.avatarUrl, 'vraceny profil neni kompletni');
  }
});

test('findAccount na rozdíl od resolveAccount přizná, že účet nezná', () => {
  // Odhlaseni potrebuje rozlisit "neznamy ucet" od "zadny ucet".
  assert.equal(findAccount('acc-neexistuje'), null);
  assert.equal(findAccount(null), null);
  assert.equal(findAccount('jan-prikopa')?.id, defaultAccountId);
});

test('účty mají unikátní id — jinak by se míchala uložená data', () => {
  const ids = availableAccounts.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
});
