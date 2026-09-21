// Hero „Tvůj den" — PROMPT_DNES_HERO.md (21. 9. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const HERO = cti('src/components/DnesHero.tsx');
const APP = cti('src/App.tsx');

test('hero je nahoře na Dnes a bere adherenci ze serveru', () => {
  assert.match(APP, /<DnesHero/, 'App hero nekreslí');
  assert.match(HERO, /'\/api\/stats\/adherence'/, 'hero nevolá adherenci');
  assert.ok(
    APP.indexOf("activeTab === 'profil'") < APP.indexOf('<DnesHero'),
    'hero není uvnitř větve pro záložku Dnes'
  );
});

test('trénink v ukazateli platí za odcvičený i bez odškrtnutí, když ho naměřily hodinky', () => {
  assert.match(HERO, /watch_workout_count/, 'hodinkový trénink se nepočítá');
  assert.match(HERO, /manual_workout_count/, 'ručně zapsaný trénink se nepočítá');
});

test('ukazatel Trénink ve dni volna nabídne nejbližší další trénink', () => {
  assert.match(HERO, /najdiNejblizsiTrenink/, 'chybí dohledání nejbližšího tréninku pro den volna');
});

test('kroužek kalorií má aria-label se skutečnou hodnotou', () => {
  const zacatek = HERO.indexOf('function KruhKcal');
  assert.ok(zacatek > -1, 'KruhKcal chybí');
  const blok = HERO.slice(zacatek, zacatek + 900);
  assert.match(blok, /aria-label=\{`Snědeno/, 'kroužek nemá popisný aria-label se snědenými kaloriemi');
});

test('pruh pokroku váhy má aria-label s procenty, ne jen vizuální pruh', () => {
  assert.match(HERO, /aria-label=\{`Pokrok k cílové váze/, 'pruh pokroku váhy nemá aria-label');
});

test('„Další krok" je skutečné tlačítko, ne klikací div', () => {
  const zacatek = HERO.indexOf('DALŠÍ KROK');
  assert.ok(zacatek > -1, 'sekce Další krok chybí');
  const blok = HERO.slice(zacatek, zacatek + 500);
  assert.match(blok, /<button/, 'Další krok není <button>');
  assert.ok(!/role="button"/.test(blok), 'Další krok používá klikací div s role="button" místo <button>');
});

test('„Další krok" volá spustDalsiKrok podle typu z dalsiKrok()', () => {
  assert.match(HERO, /import \{ dalsiKrok \}/, 'hero neimportuje pravidla pro Další krok');
  assert.match(HERO, /onClick=\{spustDalsiKrok\}/, 'tlačítko Dalšího kroku nevolá spustDalsiKrok');
});

test('pozdrav používá src/lib/pozdrav.ts, ne vlastní text natvrdo', () => {
  assert.match(HERO, /import \{ pozdrav \}/, 'hero neimportuje sdílenou funkci pozdrav');
  assert.ok(!/Dobrý (večer|den)[,.]?["'`]/.test(HERO), 'pozdrav je napsaný natvrdo místo přes pozdrav()');
});

test('den programu používá src/lib/denProgramu.ts', () => {
  assert.match(HERO, /import \{ denProgramu \}/, 'hero neimportuje sdílenou funkci denProgramu');
  assert.match(HERO, /Den \{denN\} tvého programu/, 'chybí věta „Den N tvého programu"');
});

test('„Jak ti máme říkat?" se ukazuje jen dokud profil.preferredAddress není vyplněné', () => {
  assert.match(HERO, /!profile\.preferredAddress/, 'nudge se neřídí prázdným profile.preferredAddress');
  assert.match(HERO, /Jak ti máme říkat\?/, 'chybí text výzvy');
});

test('řádek TEDa NENÍ součástí hero — je to samostatná komponenta (bod 2 zadání)', () => {
  assert.ok(!/<RadekTeda/.test(HERO), 'hero vykresluje RadekTeda sám, ten patří vedle něj v App.tsx');
  assert.ok(!/\bcoachTips\b/.test(HERO), 'hero pořád dostává coachTips — ty teď patří RadekTeda');
  assert.match(APP, /<RadekTeda/, 'App RadekTeda nekreslí');
  assert.ok(
    APP.indexOf('<DnesHero') < APP.indexOf('<RadekTeda')
    && APP.indexOf('<RadekTeda') < APP.indexOf('<DnesniPrehled'),
    'pořadí musí být hero → řádek TEDa → Jídla dnes'
  );
});
