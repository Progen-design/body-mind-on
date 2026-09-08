/**
 * Header — tlačítko TEDa a přesun „Upravit preference" do zásuvky.
 *
 * `Header.tsx` je `.tsx` (JSX) a testovací běh (`node --experimental-strip-types`)
 * JSX nekompiluje, takže se nedá přímo importovat a vykreslit — stejný důvod,
 * proč `profilObsah.test.ts` a `barevneTokeny.test.ts` testují komponenty
 * čtením zdrojáku, ne renderem. Řeší se to tady stejně.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Komentáře popisují historii — kontroluje se kód. */
function kod(text: string): string {
  return text
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((r) => !r.trim().startsWith('//'))
    .join('\n');
}

const HEADER = kod(cti('./Header.tsx'));
const TED_CONTEXT = kod(cti('../context/TedContext.tsx'));

test('tlačítko TEDa se kreslí jen když dostupny === true', () => {
  // Header bere `dostupny` z useTed(), ne z vlastního propu — mimo
  // TedProvider (např. v testu) je `dostupny: false` (výchozí hodnota
  // kontextu v TedContext.tsx) a tlačítko se vůbec nevykreslí.
  assert.match(HEADER, /const\s*\{\s*zeptejSe,\s*dostupny:\s*tedDostupny\s*\}\s*=\s*useTed\(\);/);
  assert.match(TED_CONTEXT, /dostupny:\s*false,/);

  // Tlačítko musí ležet mezi otevřením podmínky `{tedDostupny && (` a další
  // sekcí (přihlášený uživatel) — ne mimo podmínku.
  const poziceOtevreni = HEADER.indexOf('{tedDostupny && (');
  const poziceKonecBloku = HEADER.indexOf('{account && (', poziceOtevreni);
  assert.ok(poziceOtevreni >= 0, 'tlačítko TEDa musí být uvnitř `{tedDostupny && (...)}`');
  assert.ok(poziceKonecBloku > poziceOtevreni);

  const blokTed = HEADER.slice(poziceOtevreni, poziceKonecBloku);
  assert.match(blokTed, /onClick=\{\(\)\s*=>\s*zeptejSe\(\)\}/);
  assert.match(blokTed, /aria-label="Zeptat se TEDa"/);
  assert.match(blokTed, /Sparkles/);
  // Na úzkém displeji zůstává jen ikona — popisek je schovaný do `sm:`.
  assert.match(blokTed, /hidden sm:inline/);
});

test('klik na „Upravit preference" zavře zásuvku a zavolá onOpenPreferences', () => {
  const poziceLabel = HEADER.indexOf('Upravit preference');
  assert.ok(poziceLabel >= 0, 'v Header.tsx musí existovat tlačítko „Upravit preference"');

  const poziceTlacitka = HEADER.lastIndexOf('<button', poziceLabel);
  const onClickHandler = HEADER.slice(poziceTlacitka, poziceLabel);

  const poziceZavreni = onClickHandler.indexOf('onCloseMenu()');
  const poziceOtevreni = onClickHandler.indexOf('onOpenPreferences()');
  assert.ok(poziceZavreni >= 0, 'klik musí zavolat onCloseMenu()');
  assert.ok(poziceOtevreni >= 0, 'klik musí zavolat onOpenPreferences()');
  assert.ok(poziceZavreni < poziceOtevreni, 'zásuvka se zavírá dřív, než se otevře modál s preferencemi');
});

test('sekce „Nastavení" je pod „Navigace & Přehled" a nad patičkou s odhlášením', () => {
  const poziceNavigace = HEADER.indexOf('Navigace');
  const poziceNastaveni = HEADER.indexOf('Nastavení');
  const poziceOdhlaseni = HEADER.indexOf('Odhlásit se');

  assert.ok(poziceNavigace >= 0 && poziceNastaveni >= 0 && poziceOdhlaseni >= 0);
  assert.ok(poziceNavigace < poziceNastaveni, '„Nastavení" musí být pod „Navigace & Přehled"');
  assert.ok(poziceNastaveni < poziceOdhlaseni, '„Nastavení" musí být nad patičkou s odhlášením');
});

test('Header už nedrží nadbytečný prop — preference dostává jako callback, ne přes starou lištu', () => {
  assert.match(HEADER, /onOpenPreferences:\s*\(\)\s*=>\s*void;/);
  // Lišta rychlých akcí je pryč — Header o ní nesmí vůbec vědět.
  assert.doesNotMatch(HEADER, /QuickActionToolbar/);
});
