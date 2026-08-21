/**
 * Brány importu cviků.
 *
 * Testuje se jen pripravRadek() a klicZNazvu() — čistá část, která rozhoduje,
 * co se do katalogu vůbec pokusí zapsat. Zbytek běhu sahá na databázi a hlídá
 * ho trigger enforce_exercise_registry_rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pripravRadek, klicZNazvu } from '../exerciseImportRun.js';

const CVIK = {
  id: 'Barbell_Squat',
  name: 'Barbell Squat',
  equipment: 'barbell',
  category: 'strength',
  primaryMuscles: ['quadriceps'],
  level: 'beginner',
  mechanic: 'compound',
  images: ['Barbell_Squat/0.jpg', 'Barbell_Squat/1.jpg'],
};

test('platný cvik projde a namapuje se do našeho slovníku', () => {
  const { radek, duvod } = pripravRadek(CVIK);
  assert.equal(duvod, undefined);
  assert.equal(radek.canonical_key, 'barbell_squat');
  assert.equal(radek.display_name_cs, 'Dřepy s velkou činkou');
  assert.equal(radek.equipment_class, 'barbell');
  assert.equal(radek.primary_muscle, 'quads');
  assert.equal(radek.external_source, 'free-exercise-db');
  assert.ok(radek.image_url.startsWith('https://'), 'médium musí být absolutní URL');
});

test('neznámé vybavení neprojde', () => {
  // „other“ a „foam roll“ nejde porovnat s tím, co uživatel doma má.
  const { duvod } = pripravRadek({ ...CVIK, equipment: 'foam roll' });
  assert.match(duvod, /nezname_vybaveni/);
});

test('protahování není hlavní cvik tréninku', () => {
  const { duvod } = pripravRadek({ ...CVIK, category: 'stretching' });
  assert.match(duvod, /kategorie/);
});

test('cvik bez média neprojde', () => {
  const { duvod } = pripravRadek({ ...CVIK, images: [] });
  assert.equal(duvod, 'bez_media');
});

test('nepřeložitelný název neprojde', () => {
  const { duvod } = pripravRadek({ ...CVIK, name: 'Zercher Kroc Carry' });
  assert.equal(duvod, 'nazev_neprelozitelny');
});

test('nezmapovaná partie neprojde', () => {
  const { duvod } = pripravRadek({ ...CVIK, primaryMuscles: ['neck'] });
  assert.match(duvod, /nezmapovana_partie/);
});

test('kanonický klíč vyhoví regexu v databázové bráně', () => {
  // Brána v migraci 20260803210000 vyžaduje ^[a-z0-9_]{3,64}$.
  for (const n of ['Barbell Squat', '3/4 Sit-Up', 'Bent-Over Two-Arm Long Bar Row', 'Cable Crossover']) {
    const k = klicZNazvu(n);
    assert.match(k, /^[a-z0-9_]{1,64}$/, `„${n}“ dalo klíč „${k}“`);
    assert.ok(!k.endsWith('_'), `klíč „${k}“ nesmí končit podtržítkem`);
  }
});
