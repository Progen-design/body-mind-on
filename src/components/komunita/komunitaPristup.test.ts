/**
 * Komunita v UI: START čte (bez „+", bez komentářů, bez lajku) s lištou
 * „Psát můžeš v ON CLUBU", bez aktivního členství zamčená dlaždice.
 * O právech rozhoduje server (`muze_psat`, 403) — UI je jen zobrazuje.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const STRANKA = cti('./CommunityPage.tsx');
const DETAIL = cti('./CommunityPostDetail.tsx');
const KARTA = cti('./KartaPrispevku.tsx');
const KOMENTARE = cti('./KomentareVKarte.tsx');
const PRISTUP = cti('./KomunitaPristup.tsx');

test('právo psát bere stránka ze serveru (muze_psat), 403 = zamčeno', () => {
  assert.match(STRANKA, /setMuzePsat\(data\.muze_psat === true\)/);
  assert.match(STRANKA, /status === 403\) \{\s+setZamceno\(true\);/);
  assert.match(STRANKA, /if \(zamceno\) \{[\s\S]{0,400}<ZamcenaKomunita \/>/);
});

test('START: žádné „+" (desktop, plovoucí ani v prázdném feedu), místo nich lišta ON CLUB', () => {
  assert.match(STRANKA, /\{muzePsat && \(\s+<button[\s\S]{0,300}Nový příspěvek/);
  assert.match(STRANKA, /\{!detail && !novy && muzePsat && \(/);
  assert.match(STRANKA, /\{muzePsat && \(\s+<button\s+type="button"\s+onClick=\{\(\) => setNovy\(vyzvaKCheckinu/);
  assert.match(STRANKA, /\{!nacitam && !muzePsat && <ListaOnClub \/>\}/);
  assert.match(STRANKA, /jenCteni=\{!muzePsat\}/);
});

test('karta a detail v režimu jen ke čtení: lajk zablokovaný, bez „Napiš komentář…", místo lišty ON CLUB', () => {
  assert.match(KARTA, /onClick=\{onLajk\}\s+disabled=\{jenCteni\}/);
  assert.match(KOMENTARE, /\{!jenCteni && \(\s+<button[\s\S]{0,200}Napiš komentář…/);
  assert.match(DETAIL, /disabled=\{jenCteni\}/);
  assert.match(DETAIL, /\{jenCteni \? \(\s+<div[^>]*>\s+<ListaOnClub \/>/);
});

test('lišta: „Psát můžeš v ON CLUBU" + CTA do stávajícího Checkoutu ON CLUB; zámek odkazuje na odemknutí', () => {
  assert.match(PRISTUP, /TEXT_PSANI_ON_CLUB = 'Psát můžeš v ON CLUBU'/);
  assert.match(PRISTUP, /spustitCheckout\('ON_CLUB'\)/);
  assert.match(PRISTUP, /Přejít na ON CLUB/);
  assert.match(PRISTUP, /Komunita je dostupná s aktivním předplatným\./);
  assert.match(PRISTUP, /href="\/profil\?predplatne=1"/);
});
