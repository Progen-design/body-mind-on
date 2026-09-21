import test from 'node:test';
import assert from 'node:assert/strict';
import { jeUvitaciDen, uvitaniZavreno, zavriUvitani, ukazUvitaciKartu, KLIC_UVITANI } from './uvitani.ts';

function pamet() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const rozbite = {
  getItem: () => {
    throw new Error('blokováno');
  },
  setItem: () => {
    throw new Error('blokováno');
  },
};

test('uvítací karta jen den 1 a 2', () => {
  assert.equal(jeUvitaciDen(1), true);
  assert.equal(jeUvitaciDen(2), true);
  assert.equal(jeUvitaciDen(3), false);
  assert.equal(jeUvitaciDen(0), false);
  assert.equal(jeUvitaciDen(null), false);
});

test('po zavření se už neukáže a pamatuje si to', () => {
  const u = pamet();
  assert.equal(ukazUvitaciKartu(1, u), true);
  zavriUvitani(u);
  assert.equal(u.getItem(KLIC_UVITANI), '1');
  assert.equal(uvitaniZavreno(u), true);
  assert.equal(ukazUvitaciKartu(1, u), false);
});

test('po dni 2 se neukáže ani nezavřená', () => {
  assert.equal(ukazUvitaciKartu(3, pamet()), false);
});

test('rozbité nebo chybějící úložiště nic nerozbije', () => {
  assert.equal(uvitaniZavreno(rozbite), false);
  assert.doesNotThrow(() => zavriUvitani(rozbite));
  assert.equal(ukazUvitaciKartu(1, rozbite), true);
  assert.equal(ukazUvitaciKartu(1, null), true);
  assert.doesNotThrow(() => zavriUvitani(null));
});
