/**
 * Milníky profilu.
 *
 * Opravuje dvě věci: odznaky neměly datum ani kontext, a „První trénink“
 * se ptal jen na ruční zápisy — kdo odtrénoval pět tréninků s Apple Watch,
 * měl milník nesplněný.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dnuOd, milniky } from '../profile/milniky.js';

const DNES = new Date('2026-08-21T12:00:00Z').getTime();
const najdi = (list, id) => list.find((m) => m.id === id);

test('dny od data; nečitelné datum je null, ne nula', () => {
  assert.equal(dnuOd('2026-08-14T12:00:00Z', DNES), 7);
  assert.equal(dnuOd(null, DNES), null);
  assert.equal(dnuOd('nesmysl', DNES), null);
});

test('prázdný profil: nic není splněné, ale každý milník řekne co dělat', () => {
  const m = milniky({ dnesMs: DNES });
  assert.equal(m.length, 4);
  assert.ok(m.every((x) => x.splneno === false));
  for (const id of ['plan', 'trenink', 'mereni']) {
    assert.ok(najdi(m, id).detail, `${id} nemá vysvětlení, co chybí`);
  }
});

test('„První trénink“ splní i trénink z hodinek bez jediného ručního zápisu', () => {
  const historie = [
    { cas: new Date('2026-08-20T17:00:00Z').getTime(), datum: '2026-08-20T17:00:00Z' },
    { cas: new Date('2026-08-18T06:30:00Z').getTime(), datum: '2026-08-18T06:30:00Z' },
  ];
  const t = najdi(milniky({ historie, dnesMs: DNES }), 'trenink');
  assert.equal(t.splneno, true);
  // Milník patří k PRVNÍMU tréninku, ne k poslednímu.
  assert.equal(t.datum, '2026-08-18T06:30:00Z');
  assert.equal(t.detail, null);
});

test('splněný milník nese datum', () => {
  const m = milniky({
    plan: { created_at: '2026-08-15T08:00:00Z' },
    mereni: [{ created_at: '2026-08-16T07:00:00Z' }, { created_at: '2026-08-10T07:00:00Z' }],
    dnesMs: DNES,
  });
  assert.equal(najdi(m, 'plan').datum, '2026-08-15T08:00:00Z');
  // Nejstarší měření, ne první v poli.
  assert.equal(najdi(m, 'mereni').datum, '2026-08-10T07:00:00Z');
});

test('týden s námi: splní se sedmým dnem a řekne kolik dní', () => {
  const splneno = najdi(milniky({ registrovanOd: '2026-08-14T12:00:00Z', dnesMs: DNES }), 'tyden');
  assert.equal(splneno.splneno, true);
  assert.match(splneno.detail, /7 dní od registrace/);

  const jeste = najdi(milniky({ registrovanOd: '2026-08-19T12:00:00Z', dnesMs: DNES }), 'tyden');
  assert.equal(jeste.splneno, false);
  assert.match(jeste.detail, /Ještě 5 dní/);
});

test('bez data registrace se nic nevymýšlí', () => {
  const t = najdi(milniky({ dnesMs: DNES }), 'tyden');
  assert.equal(t.splneno, false);
  assert.equal(t.detail, null);
});

test('záznamy bez čitelného času nezvolí falešný první trénink', () => {
  const t = najdi(milniky({ historie: [{ cas: null, datum: null }], dnesMs: DNES }), 'trenink');
  assert.equal(t.splneno, false);
});
