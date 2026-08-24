// SEZNAM DIET MA JEDINOU AUTORITU: lib/dietOptions.js.
//
// PROC TENHLE TEST EXISTUJE. `DIETA` ve volby.ts byla psana rucne a o poli
// `enabled` nevedela. S autoritou se shodovala nahodou. Jakmile by se dieta
// na serveru vypnula, registrace by ji dal nabizela a server ji odmitl az pri
// odeslani — tedy po vyplneni vsech peti kroku, s chybou na konci formulare.
//
// Odvozeni tu chybu odstranilo. Tenhle test je POJISTKA, ne oprava: selze,
// kdyz se ty dva seznamy zase rozejdou.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DIETA } from './volby.ts';
import { DIET_OPTIONS, isDietTypeSupported } from '../../../lib/dietOptions.js';

/** Nabidka bez uvodni prazdne volby — ta neni dieta. */
const NABIZENE = DIETA.filter((v) => v.value !== '');

test('nabidka obsahuje presne povolene diety z autority', () => {
  const zNabidky = NABIZENE.map((v) => v.value).sort();
  const zAutority = DIET_OPTIONS.filter((o) => o.enabled).map((o) => o.value).sort();

  assert.deepEqual(zNabidky, zAutority, 'volby.ts a lib/dietOptions.js se rozesly');
});

test('zadna nabizena dieta neni takova, kterou server odmitne', () => {
  // Tohle je ta chyba, ktera se projevila az na konci formulare.
  for (const volba of NABIZENE) {
    assert.equal(
      isDietTypeSupported(volba.value),
      true,
      `registrace nabizi "${volba.value}", ale server ji odmita`,
    );
  }
});

test('vypnuta dieta se v nabidce neobjevi', () => {
  const vypnute = DIET_OPTIONS.filter((o) => !o.enabled).map((o) => o.value);

  // Dnes vegan a paleo. Kdyby seznam vypnutych byl prazdny, test nic nehlida
  // a ma o tom rict, ne tise projit.
  assert.ok(vypnute.length > 0, 'zadna dieta neni vypnuta — zkontroluj, jestli test jeste dava smysl');

  for (const value of vypnute) {
    assert.equal(
      NABIZENE.some((v) => v.value === value),
      false,
      `vypnuta dieta "${value}" se nabizi v registraci`,
    );
  }
});

test('prazdna volba zustava a znamena zadnou preferenci', () => {
  const prvni = DIETA[0];
  assert.equal(prvni.value, '', 'prazdna volba musi byt prvni');
  assert.equal(isDietTypeSupported(''), true, 'server prazdnou hodnotu propousti');
});

test('kazda volba ma popisek pro cloveka', () => {
  for (const volba of DIETA) {
    assert.ok(volba.label.trim().length > 0, `volba "${volba.value}" nema popisek`);
  }
});

test('popisek se od autority lisi jen tam, kde to formular potrebuje', () => {
  // `other` ma pod vyberem volny text, na ktery popisek odkazuje. Kazda dalsi
  // odchylka je nejspis preklep pri rucni uprave.
  const odchylky = NABIZENE.filter((v) => {
    const zAutority = DIET_OPTIONS.find((o) => o.value === v.value);
    return zAutority && zAutority.label !== v.label;
  }).map((v) => v.value);

  assert.deepEqual(odchylky, ['other'], `necekana odchylka popisku: ${odchylky.join(', ')}`);
});
