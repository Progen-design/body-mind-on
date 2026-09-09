// Dnešek se bere ze záznamů, ne z odškrtávání.
//
// Přehled dřív počítal „splněno" z odškrtnutých plánovaných jídel a
// neodškrtnuté vydával za nesnědené. `GET /api/stats/adherence` nad DB funkcí
// `get_daily_adherence()` přitom existoval a UI ho nevolalo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const KARTA = cti('src/components/DnesniPrehled.tsx');
const APP = cti('src/App.tsx');
const BENTO = cti('src/components/OverviewBentoGrid.tsx');

test('karta dneška je nahoře a bere data ze serveru', () => {
  assert.match(APP, /<DnesniPrehled/, 'App kartu nekreslí');
  assert.match(KARTA, /'\/api\/stats\/adherence'/, 'karta nevolá adherence');
  // Profil má začínat dneškem, ne profilem — jinak se člověk k dnešku
  // musí prokousat přes osobní údaje.
  assert.ok(
    APP.indexOf('<DnesniPrehled') < APP.indexOf('<ProfileSection'),
    'dnešek není nad profilem'
  );
});

test('neodškrtnuté jídlo znamená „nevíme", ne „nesnědl"', () => {
  assert.match(KARTA, /zaznamenáno/, 'chybí rozlišení zaznamenaného od plánovaného');
  assert.match(KARTA, /nevíme, jestli jsi jedl/, 'chybí přiznání chybějícího záznamu');
  assert.ok(
    !/% splněno/.test(BENTO),
    'bento zase tvrdí procento splnění z odškrtnutých položek'
  );
});

test('pohyb se ukazuje jen když ho hodinky naměřily', () => {
  // Nula minut by tvrdila, že se člověk nehýbal — my víme jen to, že data
  // nedorazila.
  assert.match(KARTA, /pohybMin > 0 && \(/, 'pohyb se kreslí i bez naměřených dat');
  assert.match(KARTA, /Naměřeno hodinkami/, 'chybí zdroj čísla');
});

test('trénink platí za odcvičený i bez odškrtnutí, když ho naměřily hodinky', () => {
  assert.match(KARTA, /watch_workout_count/, 'hodinkový trénink se nepočítá');
  assert.match(KARTA, /manual_workout_count/, 'ručně zapsaný trénink se nepočítá');
});
