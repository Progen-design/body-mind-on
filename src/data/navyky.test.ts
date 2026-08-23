// Návyky: výchozí stav ze serveru a hranice dne.
// Server (api/habits.js) přijímá jen dnešek v Europe/Prague — cokoli jiného
// odmítne se 400. Klient proto musí počítat dnešek stejně.
import test from 'node:test';
import assert from 'node:assert/strict';

import { dnesekPraha, dnesniNavyky, naNavyky } from './adaptery.ts';

const UCTY = [
  { habit_id: 'hydration', is_positive: true, sort_order: 1 },
  { habit_id: 'quality_sleep', is_positive: true, sort_order: 0 },
  { habit_id: 'alcohol', is_positive: false, sort_order: 0 }
];

test('dnešek se počítá v Europe/Prague, ne v UTC', () => {
  const dnes = dnesekPraha();
  assert.match(dnes, /^\d{4}-\d{2}-\d{2}$/);

  const vPraze = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  assert.equal(dnes, vPraze, 'klient a server by se rozesli o pulnoci UTC');
});

test('splněné návyky se berou jen z dneška', () => {
  const dnes = dnesekPraha();
  const hotove = dnesniNavyky(
    [
      { log_date: dnes, habit_id: 'hydration', completed: true },
      { log_date: '2026-01-01', habit_id: 'quality_sleep', completed: true }
    ],
    dnes
  );

  assert.deepEqual([...hotove], ['hydration']);
});

test('nesplněný záznam se nepočítá jako splněný', () => {
  const dnes = dnesekPraha();
  const hotove = dnesniNavyky(
    [
      { log_date: dnes, habit_id: 'hydration', completed: false },
      { log_date: dnes, habit_id: 'quality_sleep' }
    ],
    dnes
  );

  assert.equal(hotove.size, 0, 'completed !== true se nesmi brat jako splneno');
});

test('časová značka v log_date se ořízne na datum', () => {
  const dnes = dnesekPraha();
  const hotove = dnesniNavyky([{ log_date: `${dnes}T21:15:00Z`, habit_id: 'hydration', completed: true }], dnes);
  assert.deepEqual([...hotove], ['hydration']);
});

test('naNavyky přebírá stav ze serveru a řadí podle sort_order', () => {
  const dnes = dnesekPraha();
  const navyky = naNavyky(UCTY, dnesniNavyky([{ log_date: dnes, habit_id: 'hydration', completed: true }], dnes));

  assert.deepEqual(navyky.map(n => n.id), ['quality_sleep', 'hydration'], 'poradi podle sort_order');
  assert.deepEqual(navyky.map(n => n.completed), [false, true]);
});

test('zlozvyky se mezi návyky nemíchají', () => {
  assert.equal(naNavyky(UCTY).some(n => n.id === 'alcohol'), false);
});

test('bez dat ze serveru není nic splněno', () => {
  const navyky = naNavyky(UCTY);
  assert.equal(navyky.every(n => n.completed === false), true);
});

test('série se nikam nevrací', () => {
  // habit_logs zadnou serii nenese; driv se streakDays dopocitavaly
  // v prohlizeci z niceho.
  const navyk = naNavyky(UCTY)[0] as Record<string, unknown>;
  assert.equal('streakDays' in navyk, false, 'streakDays se vratily do tvaru navyku');
});

test('prázdný ani chybějící vstup nespadne', () => {
  assert.deepEqual(naNavyky(), []);
  assert.equal(dnesniNavyky(undefined).size, 0);
  assert.equal(dnesniNavyky([]).size, 0);
});
