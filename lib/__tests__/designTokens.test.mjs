/**
 * Vizuální tokeny profilu (návrh v2) — hlídá se to, co může tiše lhát.
 *
 * Třídy samotné testovat nemá smysl, ale dvě věci ano: že se barevné odlišení
 * typů jídla nerozpadlo (nese informaci, ne dekoraci) a že podíly maker dají
 * dohromady přesně 100 % — jinak v pruhu vznikne mezera nebo přetečení.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAKRO, akcentJidla, podilyMaker } from '../profile/designTokens.js';

test('typ jídla se pozná anglicky i česky', () => {
  assert.equal(akcentJidla('breakfast').akcent, akcentJidla('Snídaně').akcent);
  assert.equal(akcentJidla('lunch').akcent, akcentJidla('Oběd').akcent);
  assert.equal(akcentJidla('snack').akcent, akcentJidla('Svačina').akcent);
  assert.equal(akcentJidla('dinner').akcent, akcentJidla('Večeře').akcent);
});

test('každý typ jídla má vlastní barvu', () => {
  const barvy = ['breakfast', 'lunch', 'snack', 'dinner'].map((t) => akcentJidla(t).akcent);
  assert.equal(new Set(barvy).size, 4, 'dva typy sdílejí barvu, odlišení pak nefunguje');
});

test('neznámý typ dostane neutrální akcent, ne pád', () => {
  for (const v of [null, undefined, '', 'nesmysl']) {
    assert.ok(akcentJidla(v).akcent, String(v));
  }
});

test('podíly maker dávají přesně 100 %', () => {
  const vzorky = [
    { protein_g: 42, carbs_g: 68, fat_g: 12 },
    { protein_g: 58, carbs_g: 85, fat_g: 18 },
    { protein_g: 7, carbs_g: 3, fat_g: 1 },
    { protein_g: 33, carbs_g: 33, fat_g: 33 },
  ];
  for (const v of vzorky) {
    const p = podilyMaker(v);
    const soucet = p.bilkoviny + p.sacharidy + p.tuky;
    assert.equal(soucet, 100, `${JSON.stringify(v)} → ${soucet} %`);
  }
});

test('podíly se počítají z energie, ne z gramů', () => {
  // 10 g tuku (90 kcal) váží víc než 10 g bílkovin (40 kcal).
  const p = podilyMaker({ protein_g: 10, carbs_g: 0, fat_g: 10 });
  assert.ok(p.tuky > p.bilkoviny, 'tuk má 9 kcal/g, bílkovina 4');
});

test('jídlo bez maker pruh nekreslí', () => {
  assert.equal(podilyMaker({}), null);
  assert.equal(podilyMaker({ protein_g: 0, carbs_g: 0, fat_g: 0 }), null);
  assert.equal(podilyMaker(null), null);
  assert.equal(podilyMaker({ protein_g: null, carbs_g: undefined, fat_g: '' }), null);
});

test('barvy maker jsou jedny pro čipy i pruh', () => {
  for (const k of ['bilkoviny', 'sacharidy', 'tuky']) {
    assert.ok(MAKRO[k].trida.includes(MAKRO[k].barva), `${k}: třída a barva se rozešly`);
  }
});
