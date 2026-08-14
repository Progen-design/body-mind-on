/**
 * DATUMOVÉ POMŮCKY PROFILU.
 *
 * Vytaženo z pages/profil.js (refaktor 13. 8. 2026), dosud bez testu. Stojí
 * na nich týdenní mřížka i kalendář, takže chyba o jeden den se projeví jako
 * „trénink v jiný den, než ve kterém byl“.
 *
 * Všechno je LOKÁLNÍ ČAS, ne UTC — proto se holá data parsují s polednem.
 * Testy to hlídají přes datum na hraně měsíce a přes přechod z neděle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDate,
  formatShortDate,
  getLocalDateStr,
  getMondayOfWeek,
  dateStrAddDays,
  getWeekDays,
  formatWeekRange,
  getEventsByDate,
  WEEKDAY_LABELS,
} from '../profileDates.js';

test('prázdné datum je pomlčka, ne „Invalid Date“', () => {
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(''), '—');
  assert.equal(formatShortDate(null), '—');
  assert.equal(formatShortDate('nesmysl'), '—');
});

test('holé YYYY-MM-DD se nesmí posunout o den', () => {
  // Kdyby se parsovalo o půlnoci UTC, v Praze by to byl předchozí den.
  assert.match(formatShortDate('2026-08-13'), /13\./);
  assert.match(formatDate('2026-08-13T10:00:00Z'), /13\./);
});

test('getLocalDateStr vrací lokální den, ne UTC', () => {
  // 23:30 lokálně je pořád tentýž den, i když v UTC už je zítra.
  const pozdeVecer = new Date(2026, 7, 13, 23, 30, 0);
  assert.equal(getLocalDateStr(pozdeVecer), '2026-08-13');

  const brzyRano = new Date(2026, 7, 13, 0, 15, 0);
  assert.equal(getLocalDateStr(brzyRano), '2026-08-13');

  // Jednociferný měsíc i den se doplní nulou.
  assert.equal(getLocalDateStr(new Date(2026, 0, 5)), '2026-01-05');
});

test('týden začíná pondělím — i když je neděle', () => {
  // Neděle 16. 8. 2026 patří do týdne od pondělí 10. 8.
  const nedele = new Date(2026, 7, 16, 12, 0, 0);
  assert.equal(getLocalDateStr(getMondayOfWeek(nedele)), '2026-08-10');

  // Pondělí je samo sobě začátkem týdne.
  const pondeli = new Date(2026, 7, 10, 12, 0, 0);
  assert.equal(getLocalDateStr(getMondayOfWeek(pondeli)), '2026-08-10');

  const streda = new Date(2026, 7, 12, 12, 0, 0);
  assert.equal(getLocalDateStr(getMondayOfWeek(streda)), '2026-08-10');
});

test('posun o dny přejde přes konec měsíce i roku', () => {
  assert.equal(dateStrAddDays('2026-08-30', 3), '2026-09-02');
  assert.equal(dateStrAddDays('2026-12-30', 3), '2027-01-02');
  assert.equal(dateStrAddDays('2026-08-13', -1), '2026-08-12');
  // Přestupný rok.
  assert.equal(dateStrAddDays('2028-02-28', 1), '2028-02-29');
});

test('týdenní mřížka má 7 dní a právě jedno „dnes“', () => {
  const pondeliDnes = getLocalDateStr(getMondayOfWeek(new Date()));
  const dny = getWeekDays(pondeliDnes);

  assert.equal(dny.length, 7);
  assert.equal(dny.length, WEEKDAY_LABELS.length, 'popisky a dny se musí shodovat');
  assert.equal(dny.filter((d) => d.isToday).length, 1, 'dnešek je právě jeden');
  assert.equal(dny[0].dateKey, pondeliDnes);

  // Minulý týden nemá „dnes“ vůbec.
  const minuly = getWeekDays(dateStrAddDays(pondeliDnes, -7));
  assert.equal(minuly.filter((d) => d.isToday).length, 0);
});

test('rozsah týdne je od pondělí do neděle', () => {
  const rozsah = formatWeekRange('2026-08-10');
  assert.match(rozsah, /10\./);
  assert.match(rozsah, /16\./);
  assert.match(rozsah, /–/);
});

test('události se seskupí podle lokálního dne', () => {
  const udalosti = [
    { start: '2026-08-13T08:00:00', title: 'ráno' },
    { start: '2026-08-13T18:00:00', title: 'večer' },
    { start: '2026-08-14T09:00:00', title: 'zítra' },
    { start: null, title: 'bez data' },
    { start: 'nesmysl', title: 'rozbité' },
  ];

  const podleDne = getEventsByDate(udalosti);
  assert.equal(podleDne['2026-08-13'].length, 2);
  assert.equal(podleDne['2026-08-14'].length, 1);
  // Události bez data ani s rozbitým datem nesmí vyrobit klíč.
  assert.equal(Object.keys(podleDne).length, 2);

  assert.deepEqual(getEventsByDate(null), {});
  assert.deepEqual(getEventsByDate([]), {});
});
