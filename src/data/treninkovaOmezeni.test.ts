import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHIPY_POHYBOVYCH_VZORU,
  chipyNaPatterny,
  patternyNaChipy,
  sestavTreninkoveOmezeni,
  textZbyvajicichCviku,
} from './treninkovaOmezeni.ts';

test('sedm chipů přesně podle zadání kroku 3, ve stejném pořadí', () => {
  assert.deepEqual(
    CHIPY_POHYBOVYCH_VZORU.map((c) => c.label),
    [
      'Dřepy a výpady',
      'Mrtvý tah a předklony',
      'Skoky a doskoky',
      'Tlaky nad hlavu',
      'Kliky a tlaky',
      'Cviky vleže na zemi',
      'Běh a poskoky',
    ]
  );
});

test('"Dřepy a výpady" pokrývá squat i lunge', () => {
  assert.deepEqual(chipyNaPatterny(['drepy_vypady']), ['squat', 'lunge']);
});

test('"Cviky vleže na zemi" mapuje na virtuální vzor floor, ne na žádný z jedenácti', () => {
  assert.deepEqual(chipyNaPatterny(['vlezeVleze']), ['floor']);
});

test('víc chipů se sloučí bez duplicit', () => {
  const patterny = chipyNaPatterny(['drepy_vypady', 'mrtvy_tah_predklony', 'skoky_doskoky']);
  assert.deepEqual(new Set(patterny), new Set(['squat', 'lunge', 'hinge', 'plyo']));
});

test('neznámé/prázdné id chipu nespadne, prostě nic nepřidá', () => {
  assert.deepEqual(chipyNaPatterny([]), []);
  assert.deepEqual(chipyNaPatterny(['neexistujici_chip']), []);
});

test('patternyNaChipy je opačný směr k chipyNaPatterny (předvyplnění)', () => {
  assert.deepEqual(patternyNaChipy(['hinge']), ['mrtvy_tah_predklony']);
  assert.deepEqual(new Set(patternyNaChipy(['squat'])), new Set(['drepy_vypady']));
});

test('sestavTreninkoveOmezeni bere už přeložené vzory (výstup chipyNaPatterny), ne chipy', () => {
  const vysledek = sestavTreninkoveOmezeni(
    chipyNaPatterny(['drepy_vypady']),
    ['shoulders', 'shoulders'],
    'onboarding'
  );
  assert.deepEqual(vysledek.patterns, ['squat', 'lunge']);
  assert.deepEqual(vysledek.muscles, ['shoulders']);
  assert.deepEqual(vysledek.exercise_keys, []);
  assert.deepEqual(vysledek.contraindications, []);
  assert.equal(vysledek.source, 'onboarding');
  assert.ok(!Number.isNaN(Date.parse(vysledek.updated_at)));
});

test('sestavTreninkoveOmezeni dedupluje vzory i partie', () => {
  const vysledek = sestavTreninkoveOmezeni(['squat', 'squat', 'hinge'], ['glutes', 'glutes'], 'profile');
  assert.deepEqual(vysledek.patterns, ['squat', 'hinge']);
  assert.deepEqual(vysledek.muscles, ['glutes']);
});

test('textZbyvajicichCviku skloňuje a volitelně přidá partii', () => {
  assert.equal(textZbyvajicichCviku(1, null), 'Zbývá 1 cvik.');
  assert.equal(textZbyvajicichCviku(3, null), 'Zbývá 3 cviky.');
  assert.equal(textZbyvajicichCviku(14, null), 'Zbývá 14 cviků.');
  assert.equal(textZbyvajicichCviku(14, 2), 'Zbývá 14 cviků, na vybranou partii 2.');
  assert.equal(textZbyvajicichCviku(0, 0), 'Zbývá 0 cviků, na vybranou partii 0.');
});
