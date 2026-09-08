// Nabídka pomoci s propojením zařízení — jeden text, tři místa.
//
// Objevuje se všude, kde uživatel narazí na nepropojené zařízení. Kdyby se
// psala na každém místě zvlášť, rozešly by se verze hned při první úpravě.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const NABIDKA = cti('src/components/NabidkaPropojeni.tsx');
// Nabídka sedí v sekci zařízení, která se 9. 9. 2026 osamostatnila
// z ProfileSection do vlastní komponenty.
const ZARIZENI = cti('src/components/PropojenaZarizeniSection.tsx');
const TELO = cti('src/components/BodyCompositionSection.tsx');
const APP = cti('src/App.tsx');

test('nabídka míří na kontaktní e-mail', () => {
  assert.match(NABIDKA, /info@bodyandmindon\.cz/);
  assert.match(NABIDKA, /href=\{`mailto:\$\{KONTAKTNI_EMAIL\}/);
});

test('nabídka neuvádí cenu — ta se domlouvá podle toho, co klient chce', () => {
  assert.ok(!/\d+\s*(Kč|CZK)/.test(NABIDKA), 'v nabídce je konkrétní cena');
});

test('nabídka slibuje propojení zdarma i možnost pořídit váhu', () => {
  assert.match(NABIDKA, /zdarma/);
  assert.match(NABIDKA, /objednáš si ji přímo u nás/);
});

test('všechna tři místa používají sdílenou komponentu, ne vlastní text', () => {
  for (const [jmeno, zdroj] of [['PropojenaZarizeniSection', ZARIZENI], ['BodyCompositionSection', TELO], ['App', APP]] as const) {
    assert.match(zdroj, /<NabidkaPropojeni/, `${jmeno} nabídku nekreslí`);
    assert.match(zdroj, /import \{ NabidkaPropojeni \}/, `${jmeno} komponentu neimportuje`);
  }
});

test('nabídka se ukazuje jen tam, kde zařízení chybí', () => {
  assert.match(ZARIZENI, /\{\(!slozeni \|\| !zdraviPosledni\) && \(/);
  assert.match(APP, /\{!zdravi\.pripojeno && \(\s*<div className="mt-4 text-left/);
});
