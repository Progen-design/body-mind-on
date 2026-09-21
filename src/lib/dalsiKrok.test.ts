import test from 'node:test';
import assert from 'node:assert/strict';
import { dalsiKrok } from './dalsiKrok.ts';

const RANO = new Date('2026-09-21T06:00:00Z'); // 08:00 Praha
const VECER = new Date('2026-09-21T18:00:00Z'); // 20:00 Praha

test('větev 1 — trénink dnes a neodcvičený má přednost přede vším', () => {
  const vysledek = dalsiKrok(
    {
      maTrenink: true,
      treninkHotovy: false,
      treninkNazev: 'Trénink A',
      meals: [{ id: 'm1', type: 'Snídaně', title: 'Ovesná kaše', time: '7:30', completed: false }],
      vazilSeDnes: false,
    },
    RANO
  );
  assert.deepEqual(vysledek, { typ: 'trenink', label: 'Začít trénink Trénink A' });
});

test('zbývá jídlo, jehož čas teprve přijde — NENÍ „splněný", ukáže další jídlo bez akce', () => {
  const vysledek = dalsiKrok(
    {
      maTrenink: false,
      treninkHotovy: false,
      meals: [
        { id: 'm1', type: 'Snídaně', title: 'Ovesná kaše', time: '7:30', completed: true },
        { id: 'm2', type: 'Dopolední svačina', title: 'Jogurt', time: '10:00', completed: false }, // čas ještě nenastal (8:00)
        { id: 'm3', type: 'Oběd', title: 'Kuře s rýží', time: '12:30', completed: false },
      ],
      vazilSeDnes: true, // aby test izoloval jen chování jídel, ne větev 3
    },
    RANO // 08:00 Praha — jen snídaně má čas za sebou, ta je ale hotová
  );
  // Dřív tu bylo „Dnešek máš splněný." — v 8:00 se dvěma jídly před sebou nepravda.
  assert.deepEqual(vysledek, { typ: 'ceka', label: 'Další jídlo v 10:00: Jogurt' });
});

test('větev 2 — vybere první nezapsané jídlo, jehož čas už doopravdy nastal', () => {
  const vysledek = dalsiKrok(
    {
      maTrenink: false,
      treninkHotovy: false,
      meals: [
        { id: 'm1', type: 'Snídaně', title: 'Ovesná kaše', time: '7:30', completed: true },
        { id: 'm2', type: 'Dopolední svačina', title: 'Jogurt', time: '10:00', completed: false },
        { id: 'm3', type: 'Oběd', title: 'Kuře s rýží', time: '12:30', completed: false },
      ],
      vazilSeDnes: false,
    },
    new Date('2026-09-21T09:15:00Z') // 11:15 Praha — svačina (10:00) už nastala, oběd ne
  );
  assert.deepEqual(vysledek, { typ: 'jidlo', label: 'Zapiš dopolední svačinu — Jogurt', mealId: 'm2' });
});

test('typ jídla ve 4. pádě — „Zapiš snídani", ne „Zapiš Snídaně"', () => {
  const vysledek = dalsiKrok(
    {
      maTrenink: false,
      treninkHotovy: false,
      meals: [{ id: 'm1', type: 'Snídaně', title: 'Ovesná kaše', time: '7:30', completed: false }],
      vazilSeDnes: true,
    },
    RANO
  );
  assert.equal(vysledek.label, 'Zapiš snídani — Ovesná kaše');
});

test('ranní vážení má přednost před čekáním na další jídlo', () => {
  const vysledek = dalsiKrok(
    {
      maTrenink: false,
      treninkHotovy: false,
      meals: [{ id: 'm1', type: 'Oběd', title: 'Kuře s rýží', time: '12:30', completed: false }],
      vazilSeDnes: false,
    },
    RANO
  );
  assert.equal(vysledek.typ, 'vaha');
});

test('větev 3 — dnes ještě není vážení a je ráno', () => {
  const vysledek = dalsiKrok(
    { maTrenink: false, treninkHotovy: false, meals: [], vazilSeDnes: false },
    RANO
  );
  assert.deepEqual(vysledek, { typ: 'vaha', label: 'Zapiš dnešní váhu' });
});

test('větev 3 neplatí večer — „ráno" je stejná hranice jako u pozdravu (10:00)', () => {
  const vysledek = dalsiKrok(
    { maTrenink: false, treninkHotovy: false, meals: [], vazilSeDnes: false },
    VECER
  );
  assert.deepEqual(vysledek, { typ: 'hotovo', label: 'Dnešek máš splněný.' });
});

test('větev 4 — všechno hotovo, žádný úkol se nevymýšlí', () => {
  const vysledek = dalsiKrok(
    {
      maTrenink: true,
      treninkHotovy: true,
      treninkNazev: 'Trénink B',
      meals: [{ id: 'm1', type: 'Snídaně', title: 'Ovesná kaše', time: '7:30', completed: true }],
      vazilSeDnes: true,
    },
    VECER
  );
  assert.deepEqual(vysledek, { typ: 'hotovo', label: 'Dnešek máš splněný.' });
});

test('den bez plánu (žádný trénink, žádná jídla) nespadne a ráno pořád nabídne váhu', () => {
  const vysledek = dalsiKrok(
    { maTrenink: false, treninkHotovy: false, meals: [], vazilSeDnes: false },
    RANO
  );
  assert.deepEqual(vysledek, { typ: 'vaha', label: 'Zapiš dnešní váhu' });
});

test('den bez plánu večer, po vážení, skončí na "hotovo", ne na pádu', () => {
  const vysledek = dalsiKrok(
    { maTrenink: false, treninkHotovy: false, meals: [], vazilSeDnes: true },
    VECER
  );
  assert.deepEqual(vysledek, { typ: 'hotovo', label: 'Dnešek máš splněný.' });
});
