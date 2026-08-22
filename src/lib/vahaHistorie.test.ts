// Regrese k chybe zmerene 22. 8. 2026: weight_history se stavela vyhradne
// z body_metrics, takze uzivateli s funkcni vahou zustal v grafu jediny bod
// z registrace (2026-08-02) a karta "Vaha" byla tri tydny pozadu, prestoze
// body_measurements mely dnesni mereni.
import test from 'node:test';
import assert from 'node:assert/strict';

import { sestavHistoriiVah } from '../../lib/vahaHistorie.js';

test('měření z body_measurements se dostane do historie', () => {
  const historie = sestavHistoriiVah(
    [{ weight_kg: 104.2, created_at: '2026-08-02T08:00:00Z' }],
    [{ weight_kg: 103.02, measured_at: '2026-08-22T15:35:00Z', created_at: '2026-08-22T15:58:00Z' }]
  );

  assert.equal(historie.length, 2);
  assert.deepEqual(historie[historie.length - 1], { date: '2026-08-22', weight: 103.02 });
});

test('rozhoduje measured_at, ne created_at', () => {
  // Import bezel v 15:58, ale clovek se vazil v 15:35.
  const historie = sestavHistoriiVah(
    [],
    [{ weight_kg: 99, measured_at: '2026-08-21T15:35:00Z', created_at: '2026-08-21T15:58:00Z' }]
  );

  assert.deepEqual(historie, [{ date: '2026-08-21', weight: 99 }]);
});

test('den se počítá v Europe/Prague, ne v UTC', () => {
  // 23:40 UTC je uz 01:40 nasledujiciho dne v Praze (SELC). Pri UTC deleni
  // by vazeni spadlo na predchozi den.
  const vLetnimCase = sestavHistoriiVah([], [{ weight_kg: 99, measured_at: '2026-08-21T23:40:00Z' }]);
  assert.deepEqual(vLetnimCase, [{ date: '2026-08-22', weight: 99 }]);

  // V zimnim case je posun jen hodina: 23:40 UTC = 00:40 dalsiho dne.
  const vZimnimCase = sestavHistoriiVah([], [{ weight_kg: 98, measured_at: '2026-01-21T23:40:00Z' }]);
  assert.deepEqual(vZimnimCase, [{ date: '2026-01-22', weight: 98 }]);

  // Rano zadny posun nedela.
  const rano = sestavHistoriiVah([], [{ weight_kg: 97, measured_at: '2026-08-22T05:30:00Z' }]);
  assert.deepEqual(rano, [{ date: '2026-08-22', weight: 97 }]);
});

test('jeden bod na den, vyhrává pozdější měření', () => {
  const historie = sestavHistoriiVah(
    [],
    [
      { weight_kg: 100, measured_at: '2026-08-22T06:00:00Z' },
      { weight_kg: 101.5, measured_at: '2026-08-22T19:00:00Z' },
      { weight_kg: 100.8, measured_at: '2026-08-22T12:00:00Z' }
    ]
  );

  assert.deepEqual(historie, [{ date: '2026-08-22', weight: 101.5 }]);
});

test('ruční zápis a naměřená hodnota ze stejného dne se nepobijí — vyhraje pozdější', () => {
  const rano = { weight_kg: 103.02, measured_at: '2026-08-22T05:30:00Z' };
  const rucniOdpoledne = { weight_kg: 102.4, created_at: '2026-08-22T16:00:00Z' };

  assert.deepEqual(
    sestavHistoriiVah([rucniOdpoledne], [rano]),
    [{ date: '2026-08-22', weight: 102.4 }],
    'rucni zapis odpoledne ma prebit ranni vazeni'
  );

  // A opacne: kdyz se clovek zvazi az po rucnim zapisu, plati vaha.
  const rucniRano = { weight_kg: 102.4, created_at: '2026-08-22T05:00:00Z' };
  const vecer = { weight_kg: 103.02, measured_at: '2026-08-22T20:00:00Z' };

  assert.deepEqual(
    sestavHistoriiVah([rucniRano], [vecer]),
    [{ date: '2026-08-22', weight: 103.02 }]
  );
});

test('řádky bez váhy se přeskočí, ne vynulují', () => {
  // body_measurements nese i samotne obvody bez vahy.
  const historie = sestavHistoriiVah(
    [{ weight_kg: 104.2, created_at: '2026-08-02T08:00:00Z' }],
    [
      { waist_cm: 92, measured_at: '2026-08-22T10:00:00Z' },
      { weight_kg: null, measured_at: '2026-08-23T10:00:00Z' }
    ]
  );

  assert.deepEqual(historie, [{ date: '2026-08-02', weight: 104.2 }]);
});

test('výsledek je vzestupně podle data', () => {
  const historie = sestavHistoriiVah(
    [{ weight_kg: 104.2, created_at: '2026-08-02T08:00:00Z' }],
    [
      { weight_kg: 103.0, measured_at: '2026-08-22T06:00:00Z' },
      { weight_kg: 103.5, measured_at: '2026-08-10T06:00:00Z' }
    ]
  );

  assert.deepEqual(historie.map(b => b.date), ['2026-08-02', '2026-08-10', '2026-08-22']);
});

test('váha jako řetězec z databáze projde jako číslo', () => {
  const historie = sestavHistoriiVah([], [{ weight_kg: '103.02', measured_at: '2026-08-22T06:00:00Z' }]);
  assert.deepEqual(historie, [{ date: '2026-08-22', weight: 103.02 }]);
});

test('poškozená časová značka bod nepřebije ani nespadne', () => {
  const historie = sestavHistoriiVah(
    [],
    [
      { weight_kg: 100, measured_at: '2026-08-22T06:00:00Z' },
      { weight_kg: 999, measured_at: 'nesmysl' }
    ]
  );

  assert.deepEqual(historie, [{ date: '2026-08-22', weight: 100 }]);
});

test('prázdný vstup vrátí prázdnou historii', () => {
  assert.deepEqual(sestavHistoriiVah(), []);
  assert.deepEqual(sestavHistoriiVah([], []), []);
  assert.deepEqual(sestavHistoriiVah(undefined, undefined), []);
});
