// „Jídla dnes" — celý dnešní jídelníček, žádný výřez.
//
// PROMPT_DNES_HERO.md (21. 9. 2026): kcal/makra dne, trénink, pohyb a
// primární akce se přestěhovaly do hero „Tvůj den" (DnesHero, viz
// dnesHero.test.ts) — tahle karta teď je jen seznam dnešních jídel.
// Dřív (PROMPT_UX_DNES.md, 18. 9. 2026) pohltila i jídelní část
// `OverviewBentoGrid.tsx` (odsud test na zaškrtávátko jídla).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const KARTA = cti('src/components/DnesniPrehled.tsx');
const APP = cti('src/App.tsx');

test('„Jídla dnes" je vykreslená pod hero a řádkem TEDa', () => {
  assert.match(APP, /<DnesniPrehled/, 'App kartu nekreslí');
  assert.ok(
    APP.indexOf('<DnesHero') < APP.indexOf('<DnesniPrehled'),
    'Jídla dnes musí být pod hero, ne nad ním'
  );
  assert.ok(
    APP.indexOf('<DnesniPrehled') < APP.indexOf('<UcetASpravaSection'),
    'Jídla dnes nejsou nad účtem a předplatným'
  );
});

test('úzký prodejní pruh je přesunutý pod Jídla dnes (PROMPT_DNES_HERO.md bod 5)', () => {
  assert.ok(
    APP.indexOf('<DnesniPrehled') < APP.indexOf('<TrialCountdownStrip')
    && APP.indexOf('<TrialCountdownStrip') < APP.indexOf('<DenniCheckin'),
    'TrialCountdownStrip musí sedět mezi Jídly dnes a „Jak ti dnešek seděl"'
  );
});

test('adherence/trénink/pohyb se do karty nevrátily — to teď dělá hero', () => {
  assert.ok(!KARTA.includes('/api/stats/adherence'), 'karta si zase sama volá adherence — to dělá DnesHero');
  assert.ok(!KARTA.includes('watch_workout_count'), 'trénink se vrátil zpátky do Jídel dnes');
  assert.ok(!KARTA.includes('pohybMin'), 'pohyb se vrátil zpátky do Jídel dnes');
  assert.ok(!KARTA.includes('Prohlédnout tréninkový plán'), 'primární akce se vrátila zpátky do Jídel dnes');
});

test('nadpis „Jídla dnes" a makra dne vpravo', () => {
  assert.match(KARTA, /Jídla dnes/, 'chybí nadpis Jídla dnes');
  assert.match(KARTA, /denniMakra/, 'makra dne nejsou spočtená přes sdílený denniMakra');
});

test('všechna jídla, žádný výřez', () => {
  assert.ok(!/meals\.slice\(0,\s*3\)/.test(KARTA), 'meals se zase ořezávají na tři');
  assert.match(KARTA, /meals\.map\(/, 'karta nemapuje celé pole meals');
});

test('nesoulad cíle je pořád vidět i v Jídlech dnes (docs/DALSI_KROK.md 7.2a)', () => {
  assert.match(KARTA, /CalorieMismatchBanner/, 'banner nesouladu cíle zmizel z Jídel dnes');
});

test('zaškrtávátko jídla kreslí ikonu v OBOU stavech, ne jen po odškrtnutí', () => {
  // Dřív `{meal.completed && <Check .../>}` — nezaškrtnutý stav byl bez
  // jediného SVG, tedy bez jakéhokoli vizuálního náznaku ovládacího prvku.
  assert.ok(
    !/\{meal\.completed && <Check/.test(KARTA),
    'ikona se pořád kreslí jen po zaškrtnutí — nezaškrtnutý stav zůstane prázdný'
  );
  assert.match(KARTA, /<Check className="w-3\.5 h-3\.5 stroke-\[3\]" \/>/, 'ikona checku chybí úplně');
});

test('nezaškrtnutý stav má viditelnou barvu ikony, ne text-transparent, a kulatější tvar', () => {
  const [, ostatek] = KARTA.split('onToggleMeal(meal.id)');
  assert.ok(ostatek, 'tlačítko pro odškrtnutí jídla chybí');
  const blokTridy = ostatek.slice(0, 700);

  assert.match(blokTridy, /rounded-xl/, 'tvar musí být kulatější (rounded-xl), ne rounded-lg');
  assert.ok(!/rounded-lg/.test(blokTridy), 'starý hranatější rounded-lg tu nesmí zůstat');
  assert.match(
    blokTridy,
    /border-slate-700 bg-slate-800 text-slate-600/,
    'nezaškrtnutý stav musí mít viditelnou (ne transparentní) barvu ikony'
  );
  assert.ok(!/text-transparent/.test(blokTridy), 'ikona nesmí být schovaná přes text-transparent');
});
