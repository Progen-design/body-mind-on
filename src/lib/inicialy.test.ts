/**
 * Iniciály jako náhrada za chybějící profilovou fotku.
 *
 * PROČ. V hlavičce profilu svítil alt text „Jan Přikopa" místo obrázku.
 * `avatarUrl` je prázdný řetězec a `<img src="">` prohlížeč vykreslí jako
 * rozbitý obrázek. Změřeno v produkci 25. 8. 2026: avatar nemá ani jeden
 * ze čtyř účtů, takže to viděl každý uživatel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { inicialy } from './inicialy.ts';

test('ze jmena a prijmeni vzniknou dve pismena', () => {
  assert.equal(inicialy('Jan Přikopa'), 'JP');
});

test('diakritika se zachova a zvetsi spravne', () => {
  // `toLocaleUpperCase('cs-CZ')`, ne prosty toUpperCase.
  assert.equal(inicialy('čeněk žák'), 'ČŽ');
  assert.equal(inicialy('šárka Ř.'), 'ŠŘ');
});

test('jmeno odvozene z e-mailu se rozdeli po teckach', () => {
  // Ucet bez jmena dostane v AuthContext.naUcet cast e-mailu pred zavinacem.
  // Bez deleni na teckach by z "jan.prikopa" byla jedina iniciala.
  assert.equal(inicialy('jan.prikopa'), 'JP');
  assert.equal(inicialy('jan_novak'), 'JN');
});

test('jednoslovne jmeno da jedno pismeno', () => {
  // Druhe neni z ceho vzit a vymyslet si ho by bylo horsi nez kratsi zkratka.
  assert.equal(inicialy('Jan'), 'J');
});

test('u vice slov se bere prvni a POSLEDNI', () => {
  assert.equal(inicialy('jan van der berg'), 'JB');
  assert.equal(inicialy('Anna-Marie Nováková'), 'AN');
});

test('nikdy nevrati vic nez dve pismena', () => {
  assert.equal(inicialy('a b c d e f').length, 2);
});

test('prazdne a nesmyslne jmeno da prazdny retezec', () => {
  // Funkce si nic nevymysli — neutralni nahradu si zvoli komponenta.
  assert.equal(inicialy(''), '');
  assert.equal(inicialy('   '), '');
  assert.equal(inicialy(null), '');
  assert.equal(inicialy(undefined), '');
  assert.equal(inicialy('123'), '');
  assert.equal(inicialy('... ---'), '');
});

test('cislice a emoji se za inicialu nepovazuji', () => {
  assert.equal(inicialy('42 Novák'), 'N');
  assert.equal(inicialy('🙂 Jan Novák'), 'JN');
});

test('prebytecne mezery nevadi', () => {
  assert.equal(inicialy('  Jan   Přikopa  '), 'JP');
});
