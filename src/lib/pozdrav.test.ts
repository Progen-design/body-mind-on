import test from 'node:test';
import assert from 'node:assert/strict';
import { pozdrav } from './pozdrav.ts';

test('ráno do 10:00', () => {
  assert.equal(pozdrav(new Date('2026-09-21T06:30:00Z'), null), 'Dobré ráno.'); // 08:30 Praha (CEST)
});

test('den do 17:00', () => {
  assert.equal(pozdrav(new Date('2026-09-21T10:00:00Z'), null), 'Dobrý den.'); // 12:00 Praha
});

test('večer od 17:00', () => {
  assert.equal(pozdrav(new Date('2026-09-21T16:00:00Z'), null), 'Dobrý večer.'); // 18:00 Praha
});

test('s vyplněným oslovením se jméno připojí v 5. pádu, bez tečky', () => {
  assert.equal(pozdrav(new Date('2026-09-21T16:00:00Z'), 'Honzo'), 'Dobrý večer, Honzo');
});

// JÁDRO POŽADAVKU: automatické skloňování chybuje u příjmení, cizích a
// zdrobnělých jmen — „Dobrý večer, Jan“ (1. pád) je česky špatně. Dokud
// oslovení není vyplněné, jméno se nesmí objevit VŮBEC, žádnou formou.
test('bez oslovení nikdy neobsahuje křestní jméno', () => {
  for (const [ted, ocekavano] of [
    [new Date('2026-09-21T06:30:00Z'), 'Dobré ráno.'],
    [new Date('2026-09-21T10:00:00Z'), 'Dobrý den.'],
    [new Date('2026-09-21T16:00:00Z'), 'Dobrý večer.'],
  ] as const) {
    for (const prazdne of [null, undefined, '', '   ']) {
      const vysledek = pozdrav(ted, prazdne);
      assert.equal(vysledek, ocekavano);
      assert.ok(!vysledek.includes(','), `pozdrav bez oslovení nesmí mít čárku: "${vysledek}"`);
    }
  }
});
