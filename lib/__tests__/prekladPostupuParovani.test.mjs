/**
 * lib/prekladPostupuParovani.js
 *
 * Regrese na produkční chybu: exercise_asset_registry.id je UUID, a
 * Number(uuid) je vždy NaN. Párování dřív dělalo `Number(item.id)` a
 * zahodilo tím KAŽDOU položku z odpovědi modelu — mapa zůstala prázdná,
 * tvrdá kontrola "počet kroků 1:1" pak hlásila "model vrátil 0 kroků"
 * u všech deseti cviků v dávce, i když model odpověděl správně.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizovatIdCviku, sparujOdpovedSDavkou, krokyProRadek } from '../prekladPostupuParovani.js';

const UUID_A = '01bf633d-a8f5-479b-9a62-07caa452f380';
const UUID_B = '06b49cb4-e159-4cdf-ae78-eb63960a1d88';

test('normalizovatIdCviku: trim + lowercase, null/undefined/prázdné -> prázdný řetězec', () => {
  assert.equal(normalizovatIdCviku(`  ${UUID_A.toUpperCase()}  `), UUID_A);
  assert.equal(normalizovatIdCviku(null), '');
  assert.equal(normalizovatIdCviku(undefined), '');
  assert.equal(normalizovatIdCviku(''), '');
});

test('dávka s UUID id: mapa se naplní, párování sedí na správný řádek (ne prohozené)', () => {
  const pending = [{ id: UUID_A }, { id: UUID_B }];
  const odpoved = [
    { id: UUID_A, steps_cs: ['Sedni si.', 'Zvedni paty.'] },
    { id: UUID_B, steps_cs: ['Postav se.', 'Zvedni činku.', 'Polož ji.'] },
  ];

  const { preklady, neznamaId } = sparujOdpovedSDavkou(pending, odpoved);
  assert.equal(neznamaId.length, 0);
  assert.equal(preklady.size, 2);
  assert.deepEqual(krokyProRadek(preklady, UUID_A), ['Sedni si.', 'Zvedni paty.']);
  assert.deepEqual(krokyProRadek(preklady, UUID_B), ['Postav se.', 'Zvedni činku.', 'Polož ji.']);
});

test('model vrátí id velkými písmeny nebo s mezerou navíc -> pořád se spáruje', () => {
  const pending = [{ id: UUID_A }];
  const odpoved = [{ id: `  ${UUID_A.toUpperCase()}  `, steps_cs: ['Krok jedna.'] }];

  const { preklady, neznamaId } = sparujOdpovedSDavkou(pending, odpoved);
  assert.equal(neznamaId.length, 0);
  assert.deepEqual(krokyProRadek(preklady, UUID_A), ['Krok jedna.']);
  // Lookup taky normalizuje - sedí, i kdyby řádek nesl id s mezerou.
  assert.deepEqual(krokyProRadek(preklady, `  ${UUID_A}  `), ['Krok jedna.']);
});

test('model vrátí neznámé id -> zahodí se a zaloguje, nepřiřadí se žádnému řádku', () => {
  const pending = [{ id: UUID_A }];
  const neznameId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const odpoved = [
    { id: UUID_A, steps_cs: ['Krok jedna.'] },
    { id: neznameId, steps_cs: ['Cizí krok.'] },
  ];

  const { preklady, neznamaId } = sparujOdpovedSDavkou(pending, odpoved);
  assert.deepEqual(neznamaId, [neznameId]);
  assert.equal(preklady.size, 1, 'neznámé id nesmí založit vlastní záznam v mapě');
  assert.deepEqual(krokyProRadek(preklady, UUID_A), ['Krok jedna.']);
});

test('neznámé id se nepřiřadí "nejbližšímu" řádku, ani když je v dávce jen jeden', () => {
  // Past by byla: "jen jedno id v dávce -> přiřaď mu první/jedinou odpověď
  // bez ohledu na to, jestli id sedí". Tenhle test dokazuje, že se to
  // nestane — cizí id zůstane zahozené, řádek dostane prázdné kroky.
  const pending = [{ id: UUID_A }];
  const odpoved = [{ id: 'neco-uplne-jineho', steps_cs: ['Cizí krok.'] }];

  const { preklady, neznamaId } = sparujOdpovedSDavkou(pending, odpoved);
  assert.deepEqual(neznamaId, ['neco-uplne-jineho']);
  assert.equal(preklady.size, 0);
  assert.deepEqual(krokyProRadek(preklady, UUID_A), []);
});

test('model vrátí jiný počet kroků -> pořád se nezapisuje (regrese na tvrdou podmínku 1:1)', () => {
  const pending = [{ id: UUID_A, instructions_en: ['a', 'b', 'c'] }];
  const odpoved = [{ id: UUID_A, steps_cs: ['jen jeden krok'] }];

  const { preklady } = sparujOdpovedSDavkou(pending, odpoved);
  const kroky = krokyProRadek(preklady, UUID_A);
  // Párování nesmí "opravit" nebo skrýt nesoulad počtu — to je práce tvrdé
  // podmínky v runExerciseInstructionTranslation, ne párovací vrstvy.
  assert.notEqual(kroky.length, pending[0].instructions_en.length);
});

test('REGRESE: UUID id nesmí skončit jako "0 kroků", i pro celou dávku deseti cviků', () => {
  const pending = Array.from({ length: 10 }, (_, i) => ({
    id: `0000000${i}-a8f5-479b-9a62-07caa452f38${i}`,
    canonical_key: `cvik_${i}`,
    instructions_en: ['krok 1', 'krok 2'],
  }));
  const odpoved = pending.map((r) => ({ id: r.id, steps_cs: ['Krok jedna.', 'Krok dva.'] }));

  const { preklady, neznamaId } = sparujOdpovedSDavkou(pending, odpoved);
  assert.equal(neznamaId.length, 0);
  for (const row of pending) {
    const kroky = krokyProRadek(preklady, row.id);
    assert.equal(kroky.length, 2, `cvik ${row.canonical_key} nesmí skončit s 0 kroky`);
  }
});

test('prázdná/chybějící odpověď modelu (žádné pole exercises) nespadne, jen nic nespáruje', () => {
  assert.deepEqual(sparujOdpovedSDavkou([{ id: UUID_A }], undefined).preklady.size, 0);
  assert.deepEqual(sparujOdpovedSDavkou([{ id: UUID_A }], null).neznamaId, []);
  assert.deepEqual(sparujOdpovedSDavkou([{ id: UUID_A }], []).preklady.size, 0);
});
