import test from 'node:test';
import assert from 'node:assert/strict';

/** Minimální náhrada localStorage — testy běží v Node, kde window neexistuje. */
class FakeStorage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const storage = new FakeStorage();
(globalThis as { window?: unknown }).window = { localStorage: storage };

// Import az po nastaveni window — modul si ho cte az za behu, ale poradi drzime jiste.
const { STORAGE_PREFIX, storageKey, readStored, writeStored, removeStored, clearAllStored } =
  await import('./useLocalStorage.ts');

test('klíče dostanou prefix aplikace', () => {
  assert.equal(storageKey('meals'), `${STORAGE_PREFIX}meals`);
});

test('zápis a čtení projdou celým kolem', () => {
  writeStored('profil', { name: 'Jan', vaha: 104.6 });
  assert.deepEqual(readStored('profil', null), { name: 'Jan', vaha: 104.6 });
});

test('chybějící klíč vrátí výchozí hodnotu', () => {
  assert.equal(readStored('neexistuje', 'vychozi'), 'vychozi');
});

test('poškozený JSON shodí aplikaci — vrátí se výchozí hodnota', () => {
  storage.setItem(storageKey('rozbite'), '{ tohle není JSON');
  assert.equal(readStored('rozbite', 'zaloha'), 'zaloha');
});

test('uložené null se nepovažuje za chybějící klíč', () => {
  // Odhlaseni uklada null jako platnou hodnotu; nesmi se prepsat vychozim uctem.
  writeStored('session', null);
  assert.equal(readStored('session', { ucet: 'acc-jan' }), null);
});

test('removeStored maže jen svůj klíč', () => {
  writeStored('a', 1);
  writeStored('b', 2);
  removeStored('a');

  assert.equal(readStored('a', 'pryc'), 'pryc');
  assert.equal(readStored('b', null), 2);
});

test('clearAllStored nesahá na cizí klíče v localStorage', () => {
  writeStored('nase', 'data');
  storage.setItem('jina-aplikace:klic', 'nesahat');

  clearAllStored();

  assert.equal(readStored('nase', 'pryc'), 'pryc');
  assert.equal(storage.getItem('jina-aplikace:klic'), 'nesahat');
});
