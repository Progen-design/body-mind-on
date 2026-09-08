import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obtiznostZeUrovne, OBTIZNOST_PODLE_UROVNE, obtiznostAPostupProCvik } from '../exerciseObtiznost.js';

test('mapa level -> obtiznost: beginner/intermediate/expert', () => {
  assert.equal(obtiznostZeUrovne('beginner'), 'lehké');
  assert.equal(obtiznostZeUrovne('intermediate'), 'střední');
  assert.equal(obtiznostZeUrovne('expert'), 'těžké');
});

test('null/undefined/neznámá hodnota -> undefined (pole se v UI vynechá, ne placeholder)', () => {
  assert.equal(obtiznostZeUrovne(null), undefined);
  assert.equal(obtiznostZeUrovne(undefined), undefined);
  assert.equal(obtiznostZeUrovne(''), undefined);
  assert.equal(obtiznostZeUrovne('neco_jineho'), undefined);
});

test('mapa má přesně tři úrovně, žádnou navíc', () => {
  assert.deepEqual(Object.keys(OBTIZNOST_PODLE_UROVNE).sort(), ['beginner', 'expert', 'intermediate']);
});

test('obtiznostAPostupProCvik: plný řádek dá level, obtiznost, postup i obě varianty', () => {
  const nazevPodleKlice = new Map([
    ['chest_press', { display_name_cs: 'Chest press' }],
    ['dumbbell_press', { display_name_cs: 'Tlaky s jednoručkami' }],
  ]);
  const row = {
    level: 'intermediate',
    instructions_cs: ['Krok jedna.', 'Krok dva.'],
    easier_key: 'chest_press',
    harder_key: 'dumbbell_press',
  };
  assert.deepEqual(obtiznostAPostupProCvik(row, nazevPodleKlice), {
    level: 'intermediate',
    obtiznost: 'střední',
    instructions_cs: ['Krok jedna.', 'Krok dva.'],
    easier_key: 'chest_press',
    easier_display_name_cs: 'Chest press',
    harder_key: 'dumbbell_press',
    harder_display_name_cs: 'Tlaky s jednoručkami',
  });
});

test('obtiznostAPostupProCvik: chybějící registry řádek nevrátí vůbec žádné pole (ne placeholder)', () => {
  assert.deepEqual(obtiznostAPostupProCvik(null, new Map()), {});
  assert.deepEqual(obtiznostAPostupProCvik(undefined, new Map()), {});
});

test('obtiznostAPostupProCvik: warmup/rest/cooldown (level null) nemá level ani obtiznost, ale postup ano', () => {
  const out = obtiznostAPostupProCvik(
    { level: null, instructions_cs: ['Projdi se.'], easier_key: null, harder_key: null },
    new Map()
  );
  assert.deepEqual(out, { instructions_cs: ['Projdi se.'] });
  assert.ok(!('level' in out));
  assert.ok(!('obtiznost' in out));
});

test('obtiznostAPostupProCvik: prázdné instructions_cs se nevrací jako prázdné pole', () => {
  const out = obtiznostAPostupProCvik({ level: 'beginner', instructions_cs: [] }, new Map());
  assert.ok(!('instructions_cs' in out));
});

test('obtiznostAPostupProCvik: easier_key existuje v DB, ale bez display_name_cs -> varianta se vůbec nepropíše', () => {
  const nazevPodleKlice = new Map([['chest_press', { display_name_cs: '' }]]);
  const out = obtiznostAPostupProCvik({ level: 'intermediate', easier_key: 'chest_press' }, nazevPodleKlice);
  assert.ok(!('easier_key' in out));
  assert.ok(!('easier_display_name_cs' in out));
});

test('obtiznostAPostupProCvik: easier_key mimo dodanou mapu (druhá dávka nic nenašla) -> vynechá se', () => {
  const out = obtiznostAPostupProCvik({ level: 'intermediate', easier_key: 'neexistuje' }, new Map());
  assert.deepEqual(out, { level: 'intermediate', obtiznost: 'střední' });
});
