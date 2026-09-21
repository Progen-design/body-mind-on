import test from 'node:test';
import assert from 'node:assert/strict';
import { vokativ, prvniSlovo, urciOsloveni } from './vokativ.ts';

const MUZI: [string, string][] = [
  ['Honza', 'Honzo'],
  ['Jan', 'Jane'],
  ['Petr', 'Petře'],
  ['Pavel', 'Pavle'],
  ['Karel', 'Karle'],
  ['Michal', 'Michale'],
  ['Marek', 'Marku'],
  ['Radek', 'Radku'],
  ['Zdeněk', 'Zdeňku'],
  ['Tomáš', 'Tomáši'],
  ['Lukáš', 'Lukáši'],
  ['Ondřej', 'Ondřeji'],
  ['Matěj', 'Matěji'],
  ['Jindřich', 'Jindřichu'],
  ['Vojtěch', 'Vojtěchu'],
  ['Martin', 'Martine'],
  ['David', 'Davide'],
  ['Filip', 'Filipe'],
  ['Jakub', 'Jakube'],
  ['Patrik', 'Patriku'],
  ['Miroslav', 'Miroslave'],
  ['Vladimír', 'Vladimíre'],
  ['Viktor', 'Viktore'],
  ['Jiří', 'Jiří'],
  ['Kuba', 'Kubo'],
  ['Daniel', 'Danieli'],
];

const ZENY: [string, string][] = [
  ['Jana', 'Jano'],
  ['Petra', 'Petro'],
  ['Lucie', 'Lucie'],
  ['Marie', 'Marie'],
  ['Eva', 'Evo'],
  ['Kateřina', 'Kateřino'],
  ['Tereza', 'Terezo'],
  ['Lenka', 'Lenko'],
  ['Veronika', 'Veroniko'],
  ['Klára', 'Kláro'],
  ['Alice', 'Alice'],
  ['Ester', 'Ester'],
  ['Dagmar', 'Dagmar'],
];

test('běžná mužská jména dostanou správný 5. pád', () => {
  for (const [ze, na] of MUZI) assert.equal(vokativ(ze), na, `${ze} → ${na}`);
});

test('běžná ženská jména dostanou správný 5. pád', () => {
  for (const [ze, na] of ZENY) assert.equal(vokativ(ze), na, `${ze} → ${na}`);
});

test('testovaných jmen je aspoň pětadvacet', () => {
  assert.ok(MUZI.length + ZENY.length >= 25);
});

test('velikost písmen na vstupu nevadí', () => {
  assert.equal(vokativ('honza'), 'Honzo');
  assert.equal(vokativ('PETR'), 'Petře');
  assert.equal(vokativ('  Jana '), 'Jano');
});

test('když si funkce není jistá, vrací null — radši pozdrav bez jména', () => {
  for (const nejiste of ['Denis', 'Alex', 'Felix', 'Julia', 'Sofia', 'Michael', 'X', '', '   ', 'Jan2', 'O\'Brien', 'Anna-Marie', null, undefined]) {
    assert.equal(vokativ(nejiste as string), null, `${String(nejiste)} má dát null`);
  }
});

test('prvniSlovo bere jen křestní jméno', () => {
  assert.equal(prvniSlovo('Jan Novák'), 'Jan');
  assert.equal(prvniSlovo('  Petra   Nováková '), 'Petra');
  assert.equal(prvniSlovo(''), null);
  assert.equal(prvniSlovo(null), null);
});

test('oslovení: vlastní tvar má přednost, pak vokativ, pak nic', () => {
  assert.equal(urciOsloveni('Honzíku', 'Jan Novák'), 'Honzíku');
  assert.equal(urciOsloveni('', 'Jan Novák'), 'Jane');
  assert.equal(urciOsloveni(null, 'Petr'), 'Petře');
  assert.equal(urciOsloveni('   ', 'Denis'), null);
  assert.equal(urciOsloveni(null, null), null);
});
