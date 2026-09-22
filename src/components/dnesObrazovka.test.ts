// Záložka Dnes = „wow" obrazovka — PROMPT_DNES_WOW.md (21. 9. 2026).
//
// Nahradil dřívější `dnesniPrehled.test.ts` (karta `DnesniPrehled` zmizela,
// nahradila ji časová osa dne). Testy hlídají pořadí a pravidla struktury,
// ne pixely: co je nad čím, že prodej je nanejvýš jednou a že nic ze
// stávajících funkcí nezmizelo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const DNES = cti('src/components/DnesObrazovka.tsx');
const OSA = cti('src/components/CasovaOsaDne.tsx');
const APP = cti('src/App.tsx');
const CESTA = cti('src/components/TvojeCesta.tsx');

const poradi = (...casti: string[]) => {
  const pozice = casti.map((c) => DNES.indexOf(c));
  assert.ok(pozice.every((p) => p > -1), `v DnesObrazovka chybí: ${casti.filter((c) => DNES.indexOf(c) === -1).join(', ')}`);
  return pozice.every((p, i) => i === 0 || p > pozice[i - 1]);
};

test('pořadí shora dolů: hero → TED → osa dne → Tvoje cesta → prodej → nástroje', () => {
  assert.ok(
    poradi('<DnesHero', '<RadekTeda', '<CasovaOsaDne', '<TvojeCesta', '<TrialCountdownStrip', '<NastrojeDlazdice'),
    'záložka Dnes nemá zadané pořadí sekcí'
  );
});

test('žádný prodej nad časovou osou', () => {
  const osa = DNES.indexOf('<CasovaOsaDne');
  assert.ok(DNES.indexOf('<TrialCountdownStrip') > osa, 'prodejní pruh je nad osou dne');
  assert.ok(!/<TrialPaywallCard|<PredplatneNabidka/.test(DNES), 'DnesObrazovka kreslí paywall přímo — patří jen do panelu dlaždice');
});

test('prodej nanejvýš jednou: pruh je jeden, plná karta dalšího týdne jen v rozbalené dlaždici', () => {
  assert.equal((DNES.match(/<TrialCountdownStrip/g) || []).length, 1);
  assert.equal((APP.match(/<TrialPaywallCard/g) || []).length, 1, 'TrialPaywallCard se v App kreslí víckrát');
  assert.match(APP, /panelTyden=\{\s*<TrialPaywallCard/, 'karta dalšího týdne není za dlaždicí');
  assert.ok(!/<TrialCountdownStrip/.test(APP), 'App kreslí prodejní pruh mimo DnesObrazovka');
});

test('karta „Jak ti dnešek seděl?" z Dnes zmizela, ne z projektu', () => {
  assert.ok(!/<DenniCheckin/.test(APP), 'DenniCheckin je zpátky na Dnes');
  assert.ok(fs.existsSync(path.join(KOREN, 'src/components/DenniCheckin.tsx')), 'komponenta DenniCheckin se smazala');
  assert.ok(fs.existsSync(path.join(KOREN, 'api/daily-checkin.js')), 'API daily-checkin se smazalo');
});

test('jídla a trénink jsou jedna časová osa, ne dvě karty; DnesniPrehled je pryč', () => {
  assert.match(APP, /<DnesObrazovka/);
  assert.ok(!/<DnesniPrehled|import \{ DnesniPrehled/.test(APP), 'App pořád vykresluje DnesniPrehled');
  assert.ok(!fs.existsSync(path.join(KOREN, 'src/components/DnesniPrehled.tsx')), 'DnesniPrehled.tsx zůstal');
  assert.match(OSA, /sestavCasovouOsu/, 'osa nepoužívá čistou funkci sestavCasovouOsu');
  assert.match(OSA, /casVPraze/, 'značka „Teď" nebere pražský čas');
});

test('osa dne zachovává funkce dřívější karty: makra dne a nesoulad cíle s přegenerováním', () => {
  assert.match(OSA, /denniMakra/, 'chybí makra dne ze sdíleného denniMakra');
  assert.match(OSA, /CalorieMismatchBanner/, 'zmizel banner nesouladu cíle');
  assert.match(OSA, /onRegeneratePlan/, 'nejde přegenerovat plán');
});

test('položky osy jdou ovládat klávesnicí a mají popis pro čtečku', () => {
  assert.match(OSA, /role="button"/);
  assert.match(OSA, /tabIndex=\{0\}/);
  assert.match(OSA, /e\.key === 'Enter' \|\| e\.key === ' '/);
  assert.match(OSA, /aria-label=\{`\$\{p\.typ === 'trenink'/);
});

test('prázdné stavy mají vlastní text a akci', () => {
  assert.match(OSA, /Na dnešek zatím nemáš v plánu žádné jídlo ani trénink/);
  assert.match(OSA, /Dnes máš volno od tréninku/);
  assert.match(CESTA, /Graf se objeví, jakmile budeš mít/);
  assert.match(CESTA, /Zapsat váhu/);
});

test('Tvoje cesta: sparkline je vlastní SVG a série se kreslí až od dvou dní', () => {
  assert.match(CESTA, /<svg/);
  assert.match(CESTA, /<motion\.polyline/);
  assert.match(CESTA, /serie >= 2/);
  assert.match(CESTA, /useReducedMotion/);
  assert.ok(!/from 'recharts'|from 'chart\.js'|from 'd3/.test(CESTA), 'graf používá knihovnu, ne vlastní SVG');
});

test('nástroje: čtyři dlaždice, existující sekce zůstávají za nimi', () => {
  for (const id of ["'nakup'", "'tyden'", "'zarizeni'", "'ucet'"]) {
    assert.ok(DNES.includes(`id: ${id}`), `chybí dlaždice ${id}`);
  }
  assert.match(APP, /panelZarizeni=\{\s*<PropojenaZarizeniSection/, 'PropojenaZarizeniSection není za dlaždicí');
  assert.match(APP, /panelUcet=\{\s*<UcetASpravaSection/, 'UcetASpravaSection není za dlaždicí');
  const DLAZDICE = cti('src/components/NastrojeDlazdice.tsx');
  assert.match(DLAZDICE, /grid-cols-2 lg:grid-cols-4/, 'mřížka není 2×2 na mobilu a 4 v řadě na desktopu');
  assert.match(DLAZDICE, /aria-expanded/, 'rozbalovací dlaždice nemá aria-expanded');
});

test('uvítací karta dne 1–2 se pamatuje v localStorage bez pádu', () => {
  assert.match(DNES, /jeUvitaciDen\(denN\)/);
  assert.match(DNES, /Rozumím|onZavrit/);
  const UVITANI = cti('src/lib/uvitani.ts');
  assert.match(UVITANI, /try \{[\s\S]*getItem[\s\S]*\} catch/, 'čtení localStorage není v try/catch');
  assert.match(UVITANI, /try \{[\s\S]*setItem[\s\S]*\} catch/, 'zápis do localStorage není v try/catch');
});

test('načítání profilu ukazuje kostru ve tvaru obrazovky, ne jen kolečko', () => {
  assert.match(APP, /<DnesSkeleton/);
  const KOSTRA = cti('src/components/DnesSkeleton.tsx');
  assert.match(KOSTRA, /role="status"/);
  assert.match(KOSTRA, /animate-pulse/);
});

test('žádné nové volání OpenAI a žádná grafová knihovna', () => {
  for (const soubor of ['DnesObrazovka', 'CasovaOsaDne', 'TvojeCesta', 'DnesHero', 'RadekTeda', 'UvitaciKarta']) {
    const kod = cti(`src/components/${soubor}.tsx`);
    assert.ok(!/openai/i.test(kod.split('\n').filter((r) => r.trim().startsWith('import')).join('\n')), `${soubor} importuje OpenAI`);
  }
});

test('mobil 390 px: údaj na ose je pod názvem, nic s whitespace-nowrap bez ořezu, kroužky v jednom řádku', () => {
  assert.match(OSA, /sm:hidden mt-0\.5 text-xs[^"]*truncate/, 'údaj na ose není pod názvem na mobilu');
  assert.match(OSA, /hidden sm:block shrink-0 max-w-\[9rem\] truncate/, 'údaj vpravo na desktopu nemá ořez');
  for (const soubor of ['DnesHero', 'CasovaOsaDne', 'TvojeCesta', 'NastrojeDlazdice', 'UvitaciKarta']) {
    const kod = cti(`src/components/${soubor}.tsx`);
    const radky = kod.split('\n').filter((r) => /whitespace-nowrap/.test(r) && !/truncate/.test(r));
    assert.deepEqual(radky, [], `${soubor}: whitespace-nowrap bez truncate přeteče na 390 px`);
  }
  assert.match(cti('src/components/DnesHero.tsx'), /grid grid-cols-3 gap-2/, 'kroužky nejsou v jednom řádku');
});

test('Nastavení: cílová váha má placeholder „automaticky N kg" a nápovědu', () => {
  const MODAL = cti('src/components/PreferencesModal.tsx');
  assert.match(MODAL, /`automaticky \$\{String\(automatickaCilovaKg\)/);
  assert.match(MODAL, /Nech prázdné a cíl spočítáme podle výšky, váhy a cíle\. Vlastní číslo má přednost\./);
  assert.match(APP, /automatickaCilovaKg=\{preferences\.targetWeightAutoKg \?\? null\}/);
});
