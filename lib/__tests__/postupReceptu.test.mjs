/**
 * Výběr postupu receptu.
 *
 * Chyba, kterou to opravuje: pravidlo „skutečný postup vyhrává“ bralo i dva
 * strohé kroky („Uvař vejce natvrdo. / Podávej s pečivem a zeleninou.“),
 * takže kurátorovaná verze z knihovny se nikdy nepoužila.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { jePostupChudy, pouzitelneKroky, vyberPostup } from '../profile/postupReceptu.js';

/** Skutečná data: recipes_catalog id=466, coach_seed_v1. */
const CHUDY = ['Uvař vejce natvrdo.', 'Podávej s pečivem a zeleninou.'];
/** Skutečná data: recipes_catalog id=310, simple_start. */
const BOHATY = [
  'Dej vejce do vroucí vody a vař asi 9 minut.',
  'Vejce zchlaď ve studené vodě a oloupej.',
  'Nakrájej rajče a okurku na kousky.',
  'Rozlož vejce a zeleninu na talíř.',
  'Zakápni olejem a lehce osol.',
  'Sněz jako rychlou svačinu.',
];

test('dva kroky jsou chudý postup', () => {
  assert.equal(jePostupChudy(CHUDY), true);
  assert.equal(jePostupChudy(BOHATY), false);
});

test('prázdný a nesmyslný postup je chudý', () => {
  assert.equal(jePostupChudy([]), true);
  assert.equal(jePostupChudy(null), true);
  assert.equal(jePostupChudy(['', '  ', 'a']), true);
});

test('použitelné kroky vyhodí prázdné a útržky', () => {
  assert.deepEqual(pouzitelneKroky(['Uvař.', '', '  ', 'x', null]), ['Uvař.']);
  assert.deepEqual(pouzitelneKroky('nic'), []);
});

test('chudý uložený postup ustoupí bohatší knihovně', () => {
  const v = vyberPostup({ ulozene: CHUDY, knihovna: BOHATY });
  assert.equal(v.zdroj, 'knihovna');
  assert.equal(v.kroky.length, 6);
});

test('dostatečný uložený postup se nepřepisuje', () => {
  const v = vyberPostup({ ulozene: BOHATY, knihovna: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
  assert.equal(v.zdroj, 'ulozeny');
  assert.deepEqual(v.kroky, BOHATY);
});

test('knihovna musí být znatelně bohatší, ne o jeden krok', () => {
  // Jinak by se postup přepisoval sem a tam kvůli drobnosti.
  const v = vyberPostup({ ulozene: CHUDY, knihovna: ['Krok jedna.', 'Krok dva.', 'Krok tři.'] });
  assert.equal(v.zdroj, 'ulozeny');
});

test('bez knihovny zůstane i chudý uložený postup', () => {
  // Dva strohé kroky jsou pořád lepší než vymyšlený návod.
  const v = vyberPostup({ ulozene: CHUDY, knihovna: [], fallback: ['Připrav suroviny podle seznamu.'] });
  assert.equal(v.zdroj, 'ulozeny');
  assert.deepEqual(v.kroky, CHUDY);
});

test('bez uloženého i knihovny se sáhne na fallback', () => {
  const v = vyberPostup({ ulozene: [], knihovna: [], fallback: ['Připrav suroviny podle seznamu.'] });
  assert.equal(v.zdroj, 'fallback');
});

test('úplně prázdný vstup nespadne', () => {
  assert.deepEqual(vyberPostup(), { kroky: [], zdroj: 'fallback' });
  assert.deepEqual(vyberPostup({}), { kroky: [], zdroj: 'fallback' });
});
