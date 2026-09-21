import test from 'node:test';
import assert from 'node:assert/strict';
import { vypocitejVahovyPokrok } from './vahovyPokrok.ts';

test('hubnutí — cíl je pod výchozí váhou', () => {
  const vysledek = vypocitejVahovyPokrok([{ weight: 90 }, { weight: 85 }], 80);
  assert.equal(vysledek.aktualniKg, 85);
  assert.equal(vysledek.cilKg, 80);
  assert.equal(vysledek.zbyvaKg, 5);
  assert.equal(vysledek.smer, 'hubnuti');
  assert.equal(vysledek.podilPokroku, 0.5); // (90-85)/(90-80)
});

test('nabírání — cíl je nad výchozí váhou, vzorec funguje i obráceně', () => {
  const vysledek = vypocitejVahovyPokrok([{ weight: 60 }, { weight: 65 }], 70);
  assert.equal(vysledek.aktualniKg, 65);
  assert.equal(vysledek.zbyvaKg, 5);
  assert.equal(vysledek.smer, 'nabirani');
  assert.equal(vysledek.podilPokroku, 0.5); // (60-65)/(60-70)
});

test('méně než 2 záznamy — pruh se nekreslí, čísla ano', () => {
  const vysledek = vypocitejVahovyPokrok([{ weight: 85 }], 80);
  assert.equal(vysledek.aktualniKg, 85);
  assert.equal(vysledek.cilKg, 80);
  assert.equal(vysledek.zbyvaKg, 5);
  assert.equal(vysledek.podilPokroku, null);
});

test('žádný záznam — nic se nedopočítává', () => {
  const vysledek = vypocitejVahovyPokrok([], 80);
  assert.equal(vysledek.aktualniKg, null);
  assert.equal(vysledek.podilPokroku, null);
});

test('chybějící cíl — pruh se nekreslí, i když jsou aspoň 2 záznamy', () => {
  const vysledek = vypocitejVahovyPokrok([{ weight: 90 }, { weight: 85 }], null);
  assert.equal(vysledek.aktualniKg, 85);
  assert.equal(vysledek.cilKg, null);
  assert.equal(vysledek.zbyvaKg, null);
  assert.equal(vysledek.smer, null);
  assert.equal(vysledek.podilPokroku, null);
});

test('cíl 0 se počítá jako nenastavený (preferences.targetWeightKg výchozí)', () => {
  const vysledek = vypocitejVahovyPokrok([{ weight: 90 }, { weight: 85 }], 0);
  assert.equal(vysledek.cilKg, null);
  assert.equal(vysledek.podilPokroku, null);
});

test('pokrok je oříznutý na 0..1, i když se váha vzdaluje nebo cíl přestřelí', () => {
  const prestrelil = vypocitejVahovyPokrok([{ weight: 90 }, { weight: 78 }], 80);
  assert.equal(prestrelil.podilPokroku, 1);

  const vzdaluje = vypocitejVahovyPokrok([{ weight: 90 }, { weight: 95 }], 80);
  assert.equal(vzdaluje.podilPokroku, 0);
});

test('start rovný cíli — beze dělení nulou', () => {
  const uzTam = vypocitejVahovyPokrok([{ weight: 80 }, { weight: 80 }], 80);
  assert.equal(uzTam.podilPokroku, 1);
  assert.equal(uzTam.smer, null);

  const odbocil = vypocitejVahovyPokrok([{ weight: 80 }, { weight: 82 }], 80);
  assert.equal(odbocil.podilPokroku, null);
});
