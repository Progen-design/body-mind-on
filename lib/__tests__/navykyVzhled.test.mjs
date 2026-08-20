/**
 * Mřížka návyků — barvy nesou význam, ne dekoraci.
 *
 * Při přebarvení profilu do návrhu v2 (srpen 2026) se nesmělo ztratit, že
 * zelená znamená „splněno“, červená „zlozvyk splněn“ (což je špatná zpráva)
 * a dnešek má vlastní zvýraznění. Chování mřížky — zpětné dny, dnešek, budoucí
 * dny — zůstává beze změny; testuje se jen to, že se významy nepřehodily.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getHabitGridCellStyle } from '../profile/navykyVzhled.js';

const zaklad = { cellWidth: 28 };
const styl = (p) => getHabitGridCellStyle({ ...zaklad, ...p });

test('splněný zdravý návyk je zelený', () => {
  const s = styl({ completed: true, isPast: true });
  assert.match(s.color, /39ff14/i, 'zelená ze systému návrhu');
  assert.match(String(s.boxShadow), /57, 255, 20/, 'a svítí');
});

test('splněný zlozvyk zůstává červený — splnit ho není úspěch', () => {
  const s = styl({ completed: true, isNegative: true, isPast: true });
  assert.match(String(s.background), /dc2626|b91c1c/i);
  assert.doesNotMatch(String(s.color), /39ff14/i, 'zlozvyk se nesmí tvářit jako úspěch');
});

test('dnešek má vlastní zvýraznění a je to azurová z návrhu', () => {
  const s = styl({ completed: false, isToday: true });
  assert.match(String(s.background) + String(s.boxShadow), /0, 242, 254/, 'akcent v2');
});

test('nesplněný den v minulosti není zelený ani červený', () => {
  const s = styl({ completed: false, isPast: true });
  assert.doesNotMatch(String(s.color || ''), /39ff14/i);
  assert.doesNotMatch(String(s.background || ''), /dc2626/i);
});

test('budoucí den se nedá odškrtnout', () => {
  const s = styl({ completed: false, isFuture: true, readOnly: true });
  assert.equal(s.pointerEvents, 'none');
});

test('splněno a dnešek zároveň — vyhrává splněno', () => {
  const s = styl({ completed: true, isToday: true });
  assert.match(String(s.color), /39ff14/i, 'stav splnění je důležitější než „je dnes“');
});
