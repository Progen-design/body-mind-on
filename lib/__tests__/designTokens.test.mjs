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

// ─────────────────────────────────────────────────────────────────────────────
// Neonová varianta (návrh v3). Přidaná vedle tlumené, ne místo ní.

import {
  AMBIENTNI_KRUHY,
  AMBIENTNI_OBAL,
  IKONA_DOBRE,
  IKONA_SPATNE,
  KARTA,
  KARTA_NEON,
  KARTA_NEON_JEMNA,
  NEON,
  PREPINAC_AKTIVNI,
} from '../profile/designTokens.js';

test('neon je přidaný, ne místo tlumené varianty', () => {
  assert.ok(KARTA.length > 0, 'základní karta musí zůstat');
  assert.ok(!KARTA.includes('00f2fe'), 'tlumená karta se nesmí rozsvítit');
  assert.ok(KARTA_NEON.startsWith(KARTA), 'neon staví na základní kartě');
});

test('neonové barvy jsou dvě a mají význam', () => {
  assert.equal(NEON.azurova, '#00f2fe');
  assert.equal(NEON.limetka, '#39ff14');
  assert.ok(KARTA_NEON.includes(NEON.azurova.slice(1)), 'aktivní prvek je azurový');
  assert.ok(IKONA_DOBRE.includes(NEON.limetka.slice(1)), 'dobrý trend je limetkový');
});

test('jemná varianta svítí až při najetí', () => {
  assert.ok(KARTA_NEON_JEMNA.includes('hover:'), 'v klidu má zůstat tlumená');
  assert.ok(!/(?<!hover:)border-\[#00f2fe\]/.test(KARTA_NEON_JEMNA.replace(/hover:[^\s]+/g, '')),
    'bez najetí nesmí mít azurový rám');
});

test('dobrý a špatný trend se barevně nepletou', () => {
  assert.notEqual(IKONA_DOBRE, IKONA_SPATNE);
  assert.ok(!IKONA_SPATNE.includes('39ff14'), 'zhoršení se nesmí tvářit zeleně');
});

test('aktivní přepínač je azurový a svítí', () => {
  assert.ok(PREPINAC_AKTIVNI.includes('00f2fe'));
  assert.ok(PREPINAC_AKTIVNI.includes('shadow-'));
});

test('ambientní pozadí nesmí brát kliknutí ani překrýt obsah', () => {
  assert.ok(AMBIENTNI_OBAL.includes('pointer-events-none'), 'dekorace nesmí krást kliknutí');
  assert.ok(AMBIENTNI_OBAL.includes('z-0'), 'musí zůstat pod obsahem');
  assert.ok(AMBIENTNI_OBAL.includes('fixed'));
});

test('ambientní kruhy jsou tři a jsou rozostřené', () => {
  assert.equal(AMBIENTNI_KRUHY.length, 3);
  for (const k of AMBIENTNI_KRUHY) {
    assert.match(k, /blur-\[1[24]0px\]/, `kruh bez rozostření: ${k.slice(0, 40)}`);
    assert.match(k, /rounded-full/);
  }
});

test('ambientní pozadí je jen náznak, ne plocha barvy', () => {
  // Krytí nad ~10 % by přebilo text nad ním.
  for (const k of AMBIENTNI_KRUHY) {
    const kryti = k.match(/\/(\d+)\b/g) || [];
    for (const c of kryti) {
      const n = Number(c.slice(1));
      assert.ok(n <= 10, `příliš syté krytí ${c} v: ${k.slice(0, 40)}`);
    }
  }
});
