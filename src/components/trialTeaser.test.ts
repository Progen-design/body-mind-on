// PROMPT_UX_DNES.md (18. 9. 2026) bod A.2/A.6/C — prodej se rozdělil na tři
// jasně oddělené role, dřív žila v jedné kartě uprostřed Dnes:
//   1. TrialCountdownStrip — úzký pruh pod hlavičkou, jen countdown + tlačítko.
//   2. TrialPaywallCard — sbalená ukázka „Tvůj další týden", bez cen.
//   3. PredplatneNabidka — plné srovnání START/ON Club/VIP, jen v Účtu
//      a předplatném (uvnitř UcetASpravaSection) a v tom úzkém pruhu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const STRIP = cti('src/components/TrialCountdownStrip.tsx');
const PAYWALL = cti('src/components/TrialPaywallCard.tsx');
const NABIDKA = cti('src/components/PredplatneNabidka.tsx');
const UCET = cti('src/components/UcetASpravaSection.tsx');
const APP = cti('src/App.tsx');

test('úzký pruh nemá karty ani ceny, jen countdown a tlačítko', () => {
  assert.ok(!STRIP.includes('PRICING'), 'pruh sahá na ceníkovou tabulku');
  assert.ok(!STRIP.includes('spustitCheckout'), 'pruh spouští checkout přímo, místo odkazu na plné srovnání');
  assert.match(STRIP, /h-12\b/, 'pruh nemá pevnou nízkou výšku (h-12 = 48 px)');
  assert.match(STRIP, /Odemknout/, 'pruh nemá tlačítko Odemknout');
});

test('„Tvůj další týden" je sbalená ukázka bez cen, žádný checkout', () => {
  assert.ok(!PAYWALL.includes('spustitCheckout'), 'karta pořád spouští checkout — ceny se měly přestěhovat pryč');
  assert.ok(!PAYWALL.includes('PRICING'), 'karta pořád čte ceníkovou tabulku');
  assert.match(PAYWALL, /useState\(false\)/, 'karta není sbalená ve výchozím stavu');
  assert.match(PAYWALL, /rozbaleno && jidla\.length > 0/, 'seznam jídel se nekryje s rozbalovacím stavem');
});

test('plné srovnání tierů žije jen v PredplatneNabidka, ne rozeseté v TrialPaywallCard', () => {
  assert.match(NABIDKA, /spustitCheckout/, 'PredplatneNabidka nespouští checkout');
  assert.match(NABIDKA, /START_REASONS/, 'START karta neukazuje důvody ke koupi (bod C)');
  assert.match(NABIDKA, /CANCEL_ANYTIME_LINE/, 'chybí věta o zrušení kdykoli');
});

test('PredplatneNabidka je vykreslená jen na dvou místech — Účet a úzký pruh', () => {
  assert.ok(UCET.includes('<PredplatneNabidka'), 'Účet a předplatné neukazuje plné srovnání');
  assert.ok(APP.includes('<TrialCountdownStrip'), 'App nekreslí úzký prodejní pruh');
  assert.ok(APP.includes('<UcetASpravaSection'), 'App nekreslí Účet a předplatné');
  // Karta „Tvůj další týden" sama žádné PredplatneNabidka nekreslí — ceny
  // tam nepatří (bod C: „na dvou místech a nikde jinde"). Hledá se JSX
  // použití (`<PredplatneNabidka`), ne holý název — ten smí být zmíněný
  // ve vysvětlujícím komentáři, proč tam ceny nejsou.
  assert.ok(!PAYWALL.includes('<PredplatneNabidka'), 'TrialPaywallCard kreslí plné srovnání — patří jinam');
});

test('START odrážky jsou důvody, ne výčet funkcí (bod C)', () => {
  const PRICING = cti('lib/pricing.ts');
  assert.match(PRICING, /obecná tabulka/, 'chybí konkrétní důvod „ne obecná tabulka"');
  assert.match(PRICING, /Zrušíš kdykoli/, 'chybí věta o zrušení, co sundává riziko z rozhodnutí');
});
