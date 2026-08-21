/**
 * Karty tělesného vývoje z nového návrhu — logika pod vzhledem.
 *
 * Návrh přišel s napevno zadrátovanými hodnotami (104,6 kg / 11,6 % / 88,9 kg)
 * a bez jakéhokoli ošetření chybějících dat. Testy hlídají to, co by se při
 * přepisu vzhledu ztratilo nejsnáz: že prázdné měření není nula, že se trend
 * hodnotí podle veličiny a že graf nevznikne z dvou teček.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_BODU_GRAFU,
  bodyGrafuVahy,
  celkovaZmena,
  formatMetrikaCs,
  smerTrendu,
} from '../profile/telesneMetriky.js';

test('číslo se formátuje česky, s desetinnou čárkou', () => {
  assert.equal(formatMetrikaCs(82.44), '82,4');
  assert.equal(formatMetrikaCs(19), '19,0');
  assert.equal(formatMetrikaCs(24.05, 1), '24,1');
});

test('chybějící měření není nula', () => {
  for (const v of [null, undefined, '', 'nesmysl', NaN]) {
    assert.equal(formatMetrikaCs(v), null, `${String(v)} se nesmí zobrazit jako číslo`);
  }
});

test('naměřená nula se zobrazit SMÍ — je to údaj', () => {
  assert.equal(formatMetrikaCs(0), '0,0');
});

test('trend hodnotí směr podle veličiny, ne podle znaménka', () => {
  // Váha a tuk: dolů je dobře.
  assert.equal(smerTrendu(-1.2, 'klesa'), 'dobre');
  assert.equal(smerTrendu(1.2, 'klesa'), 'spatne');
  // Svalová hmota: nahoru je dobře.
  assert.equal(smerTrendu(1.2, 'roste'), 'dobre');
  assert.equal(smerTrendu(-1.2, 'roste'), 'spatne');
});

test('beze změny se nic neoslavuje a bez dat se nehodnotí', () => {
  assert.equal(smerTrendu(0, 'klesa'), 'neutralni');
  for (const v of [null, undefined, '', 'x']) assert.equal(smerTrendu(v), null);
});

test('graf se řadí od nejstaršího — API vrací opačně', () => {
  const body = bodyGrafuVahy([
    { measured_at: '2026-08-10T08:00:00Z', weight_kg: 79 },
    { measured_at: '2026-08-01T08:00:00Z', weight_kg: 81 },
    { measured_at: '2026-08-05T08:00:00Z', weight_kg: 80 },
  ]);
  assert.deepEqual(body.map((b) => b.vaha), [81, 80, 79], 'obrácené pořadí by otočilo trend');
});

test('měření bez váhy se do grafu nekreslí', () => {
  const body = bodyGrafuVahy([
    { measured_at: '2026-08-01T08:00:00Z', weight_kg: 81 },
    { measured_at: '2026-08-03T08:00:00Z', weight_kg: null },
    { measured_at: '2026-08-05T08:00:00Z', weight_kg: 80 },
  ]);
  assert.equal(body.length, 2, 'mezeru v datech nelze spojit čarou');
});

test('prázdná i chybějící historie projde bez pádu', () => {
  assert.deepEqual(bodyGrafuVahy([]), []);
  assert.deepEqual(bodyGrafuVahy(null), []);
  assert.deepEqual(bodyGrafuVahy(undefined), []);
});

test('na graf jsou potřeba aspoň tři body', () => {
  assert.equal(MIN_BODU_GRAFU, 3, 'dvě tečky nejsou trend');
});

test('celková změna se počítá z prvního a posledního bodu', () => {
  assert.equal(celkovaZmena([{ vaha: 81 }, { vaha: 80 }, { vaha: 79 }]), -2);
  assert.equal(celkovaZmena([{ vaha: 79 }]), null, 'z jednoho bodu změna neexistuje');
  assert.equal(celkovaZmena([]), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Časové rozsahy grafu (1M / 3M / 6M / 1R).
//
// Návrh v3 měl přepínač jen jako ozdobu — `selectedRange` se nikde nepoužil.
// Testy proto tlačí na to, že filtruje doopravdy a že se rozsah bez dat
// zakáže, místo aby ukázal prázdný graf.

import {
  ROZSAHY_GRAFU,
  VYCHOZI_ROZSAH,
  dostupneRozsahy,
  filtrujRozsah,
  pocatecniRozsah,
} from '../profile/telesneMetriky.js';

const TED = new Date('2026-08-20T12:00:00Z').getTime();
const denZpet = (n) => TED - n * 86400000;
const bod = (dnuZpet, vaha) => ({ datum: 'x', cas: denZpet(dnuZpet), vaha });

test('rozsahy jsou čtyři a od nejkratšího', () => {
  assert.deepEqual(ROZSAHY_GRAFU.map((r) => r.id), ['1M', '3M', '6M', '1R']);
  assert.deepEqual(ROZSAHY_GRAFU.map((r) => r.mesicu), [1, 3, 6, 12]);
});

test('filtr opravdu ořízne data podle okna', () => {
  const body = [bod(400, 80), bod(150, 81), bod(60, 82), bod(10, 83)];
  assert.equal(filtrujRozsah(body, '1M', TED).length, 1, 'poslední měsíc');
  assert.equal(filtrujRozsah(body, '3M', TED).length, 2);
  assert.equal(filtrujRozsah(body, '6M', TED).length, 3);
  // 400 dní je víc než rok — do ročního okna už měření nespadá.
  assert.equal(filtrujRozsah(body, '1R', TED).length, 3);
});

test('neznámý rozsah data neořízne', () => {
  const body = [bod(400, 80), bod(10, 83)];
  assert.equal(filtrujRozsah(body, 'nesmysl', TED).length, 2);
});

test('rozsah bez tří měření se zakáže', () => {
  // Dvě měření za poslední měsíc, zbytek starší půl roku.
  const body = [bod(200, 80), bod(190, 80.5), bod(180, 81), bod(10, 83), bod(5, 83.2)];
  const d = dostupneRozsahy(body, TED);
  assert.equal(d['1M'], false, 'dvě tečky nejsou trend');
  assert.equal(d['3M'], false);
  assert.equal(d['6M'], true);
  assert.equal(d['1R'], true);
});

test('reálný účet: 23 měření za měsíc → všechny rozsahy dostupné', () => {
  const body = Array.from({ length: 23 }, (_, i) => bod(i, 104 + i * 0.02));
  const d = dostupneRozsahy(body, TED);
  assert.deepEqual(Object.values(d), [true, true, true, true]);
});

test('graf se otevře na 3M, když tam data jsou', () => {
  const body = Array.from({ length: 10 }, (_, i) => bod(i * 5, 80 + i * 0.1));
  assert.equal(pocatecniRozsah(body, TED), VYCHOZI_ROZSAH);
});

test('bez dat ve 3M se otevře nejbližší širší okno, kde data jsou', () => {
  // 200 dní zpět je mimo půlrok, takže 6M má jen dva body → padá se na 1R.
  assert.equal(pocatecniRozsah([bod(200, 80), bod(150, 81), bod(120, 82)], TED), '1R');
  // Když se do půlroku vejdou tři, vyhraje 6M.
  assert.equal(pocatecniRozsah([bod(170, 80), bod(150, 81), bod(120, 82)], TED), '6M');
});

test('když ani rok nestačí, graf se nekreslí vůbec', () => {
  assert.equal(pocatecniRozsah([bod(5, 80), bod(3, 80.2)], TED), null);
  assert.equal(pocatecniRozsah([], TED), null);
});

test('body z historie nesou čas, ne jen popisek osy', () => {
  const body = bodyGrafuVahy([{ measured_at: '2026-08-01T08:00:00Z', weight_kg: 80 }]);
  assert.ok(Number.isFinite(body[0].cas), 'bez `cas` by filtr nefungoval');
  assert.equal(body[0].datum, '1. 8.');
});
