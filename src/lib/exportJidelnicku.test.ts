/**
 * Export &amp; Tisk jídelníčku — čistá logika (postup přípravy, součet kcal).
 * Naměřené chyby: viz komentáře u jednotlivých funkcí v exportJidelnicku.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { postupProJidlo, soucetKcalPlanu } from './exportJidelnicku.ts';
import type { MealItem } from '../types.ts';

function jidlo(over: Partial<MealItem> = {}): MealItem {
  return {
    id: 'm1',
    type: 'Oběd',
    time: '12:00',
    title: 'Kuře s rýží',
    calories: 500,
    protein: 40,
    carbs: 50,
    fat: 10,
    completed: false,
    ingredients: ['kuřecí prsa', 'rýže'],
    ...over,
  };
}

test('jídlo bez recipe nedá žádnou sekci postupu', () => {
  assert.equal(postupProJidlo(jidlo()), null);
  assert.equal(postupProJidlo(jidlo({ recipe: undefined })), null);
});

test('jídlo s instructions dá tolik kroků, kolik jich je', () => {
  const m = jidlo({ recipe: { instructions: ['Osol maso.', 'Opeč maso.', 'Podávej.'], prepTimeMin: 15 } });
  const postup = postupProJidlo(m);
  assert.ok(postup);
  assert.equal(postup!.kroky.length, 3);
  assert.deepEqual(postup!.kroky, ['Osol maso.', 'Opeč maso.', 'Podávej.']);
});

test('prázdné a whitespace kroky se zahodí, počítá se jen skutečný obsah', () => {
  const m = jidlo({ recipe: { instructions: ['Osol maso.', '', '   ', 'Podávej.'], prepTimeMin: null } });
  const postup = postupProJidlo(m);
  assert.ok(postup);
  assert.deepEqual(postup!.kroky, ['Osol maso.', 'Podávej.']);
});

test('recipe s prázdným (nebo jen prázdnými kroky) polem instructions nedá žádnou sekci — ne prázdný seznam', () => {
  assert.equal(postupProJidlo(jidlo({ recipe: { instructions: [], prepTimeMin: 10 } })), null);
  assert.equal(postupProJidlo(jidlo({ recipe: { instructions: ['', '   '], prepTimeMin: 10 } })), null);
});

test('prepTimeMin null se vrátí jako null (řádek s časem se v dokumentu neukáže)', () => {
  const postup = postupProJidlo(jidlo({ recipe: { instructions: ['Krok jedna.'], prepTimeMin: null } }));
  assert.ok(postup);
  assert.equal(postup!.prepTimeMin, null);
});

test('prepTimeMin číslo (i 0) se předá beze změny', () => {
  assert.equal(postupProJidlo(jidlo({ recipe: { instructions: ['Krok.'], prepTimeMin: 25 } }))!.prepTimeMin, 25);
  assert.equal(postupProJidlo(jidlo({ recipe: { instructions: ['Krok.'], prepTimeMin: 0 } }))!.prepTimeMin, 0);
});

test('součet kcal z meals sedí — celý plán, ne jen snězené', () => {
  const meals = [
    jidlo({ id: 'a', calories: 450, completed: true }),
    jidlo({ id: 'b', calories: 620, completed: false }),
    jidlo({ id: 'c', calories: 780, completed: false }),
    jidlo({ id: 'd', calories: 782, completed: true }),
  ];
  // Naměřený případ z hlášení: součet dole má dát 2 632, ne 0 (jen dvě
  // jídla byla odškrtnutá jako snězená — stará logika by vrátila 1 232).
  assert.equal(soucetKcalPlanu(meals), 2632);
});

test('prázdný plán dá 0, ne NaN', () => {
  assert.equal(soucetKcalPlanu([]), 0);
});
