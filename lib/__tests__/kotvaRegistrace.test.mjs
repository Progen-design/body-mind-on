/**
 * docs/DALSI_KROK.md 9.6 — PLÁN BĚŽÍ 7 DNÍ OD REGISTRACE, KOTVA PŘEŽIJE VÝPADEK.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 13. 8. 2026: producent po třídenním výpadku doběhl ve čtvrtek a doběhové
 * pravidlo `max(valid_until + 1, dnešek)` vzalo dnešek. Tím se kotva cyklu
 * PŘEPSALA NATRVALO — každý další týden ji poctivě posouval čtvrtek→středa
 * a nic ji nikdy nevrátilo. Rozhodnutí Honzy 7. 9. 2026: cyklus je vždy
 * `registrace + 7k` („pokud se registruji ve středu, tak to není pondělí").
 *
 * `computeTargetFrom` je čistá funkce — testuje se chováním.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeTargetFrom, jeDobehovyPripad } from '../weeklyPlanProducer.js';
import { weekdayIndexJsFromPragueIso } from '../czechCalendar.js';

// Účet ze zadání: registrace pondělí 3. 8. 2026 (pražský čas).
const REGISTRACE_PO = '2026-08-03';

test('plán běží → valid_until + 1, kotva se nepoužije', () => {
  // Dnešek uprostřed platnosti: nový plán navazuje dnem po konci starého.
  const cil = computeTargetFrom('2026-08-16', '2026-08-13', REGISTRACE_PO);
  assert.equal(cil, '2026-08-17');
  assert.equal(jeDobehovyPripad('2026-08-16', '2026-08-13'), false);

  // I bez kotvy stejně — v téhle větvi nesmí kotva hrát žádnou roli.
  assert.equal(computeTargetFrom('2026-08-16', '2026-08-13'), '2026-08-17');
});

test('producent zaspal o 3 dny → pondělí, ne čtvrtek (přesně případ z 13. 8.)', () => {
  // Registrace pondělí, plán skončil v neděli 9. 8., producent doběhl až ve
  // čtvrtek 13. 8. Staré pravidlo vzalo čtvrtek a kotva se rozjela napořád.
  // Tenhle test je celý smysl bodu 9.6 — kdyby padl, rozjede se znovu.
  const cil = computeTargetFrom('2026-08-09', '2026-08-13', REGISTRACE_PO);
  assert.equal(cil, '2026-08-10', 'začátek cyklu, ve kterém je dnešek — pondělí 10. 8.');
  assert.notEqual(cil, '2026-08-13', 'dnešek (čtvrtek) je přesně to, co kotvu rozbilo');
  assert.equal(weekdayIndexJsFromPragueIso(cil), 1, 'výsledek musí být pondělí');
});

test('registrace ve středu → cyklus středa–úterý, výpadek vrací na středu', () => {
  const REGISTRACE_ST = '2026-08-05';
  // Cyklus 5.–11. 8. skončil v úterý, producent doběhl až v pátek 14. 8.
  const cil = computeTargetFrom('2026-08-11', '2026-08-14', REGISTRACE_ST);
  assert.equal(cil, '2026-08-12', 'začátek běžícího cyklu: středa 12. 8.');
  assert.equal(weekdayIndexJsFromPragueIso(cil), 3, 'středa — pondělí se nesmí objevit nikde');

  // Kontrola celé mřížky: žádný start cyklu středečního uživatele není pondělí.
  for (const dnes of ['2026-08-13', '2026-08-20', '2026-09-04']) {
    const start = computeTargetFrom('2026-08-11', dnes, REGISTRACE_ST);
    assert.equal(weekdayIndexJsFromPragueIso(start), 3, `${dnes}: cyklus musí začínat ve středu`);
  }
});

test('výpadek delší než týden → cyklus obsahující dnešek, zmeškané se negenerují', () => {
  // Plán skončil v neděli 9. 8., dnešek úterý 25. 8. — zmeškané cykly
  // 10.–16. a 17.–23. se přeskočí, bere se běžící 24.–30.
  const cil = computeTargetFrom('2026-08-09', '2026-08-25', REGISTRACE_PO);
  assert.equal(cil, '2026-08-24', 'začátek cyklu, ve kterém je dnešek');
  assert.notEqual(cil, '2026-08-10', 'první zmeškaný cyklus se negeneruje');
  assert.notEqual(cil, '2026-08-17', 'druhý zmeškaný cyklus taky ne');
});

test('chybí registrace → doběh se chová jako dosud (od dneška)', () => {
  for (const kotva of [null, undefined, '', 'neni-datum']) {
    const cil = computeTargetFrom('2026-08-09', '2026-08-13', kotva);
    assert.equal(cil, '2026-08-13', `kotva ${JSON.stringify(kotva)}: bez mřížky platí staré pravidlo`);
  }
  // Dvouargumentové volání (starší volající) — beze změny chování.
  assert.equal(computeTargetFrom('2026-08-09', '2026-08-13'), '2026-08-13');
  assert.equal(computeTargetFrom(null, '2026-08-13'), '2026-08-13', 'bez plánu se dál začíná dneškem');
});

test('kotva jako timestamptz z body_metrics.created_at se čte v pražském kalendáři', () => {
  // Registrace 3. 8. v 06:32 UTC = pondělí 3. 8. v Praze.
  const cil = computeTargetFrom('2026-08-09', '2026-08-13', '2026-08-03T06:32:00Z');
  assert.equal(cil, '2026-08-10');

  // 23:30 UTC je v pražském létě už DALŠÍ den (01:30) — mřížka pak jede od
  // úterý 4. 8. a začátek cyklu je 11. 8., ne 10. 8. Přesně kvůli tomuhle se
  // timestamptz nesmí říznout na prvních 10 znaků.
  const cilPresPulnoc = computeTargetFrom('2026-08-09', '2026-08-13', '2026-08-03T23:30:00Z');
  assert.equal(cilPresPulnoc, '2026-08-11');
});

test('bezešvý doběh: valid_until + 1 = dnešek dá totéž přes obě větve', () => {
  // Plán skončil v neděli, producent běží hned v pondělí — mřížka i navázání
  // říkají totéž. Kdyby ne, je rozbitá mřížka nebo navazování.
  const cil = computeTargetFrom('2026-08-09', '2026-08-10', REGISTRACE_PO);
  assert.equal(cil, '2026-08-10');
  assert.equal(jeDobehovyPripad('2026-08-09', '2026-08-10'), true, 'rovnost je doběh, ne běžící plán');
});
