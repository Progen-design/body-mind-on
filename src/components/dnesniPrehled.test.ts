// Dnešek se bere ze záznamů, ne z odškrtávání.
//
// Přehled dřív počítal „splněno" z odškrtnutých plánovaných jídel a
// neodškrtnuté vydával za nesnědené. `GET /api/stats/adherence` nad DB funkci
// `get_daily_adherence()` přitom existoval a UI ho nevolalo.
//
// PROMPT_UX_DNES.md (18. 9. 2026): karta pohltila i jídelní část dřívějšího
// `OverviewBentoGrid.tsx` (odsud i test na zaškrtávátko jídla, dřív
// overviewBentoGrid.test.ts) — obě ukazovaly „dnešek" na dvou místech.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const KARTA = cti('src/components/DnesniPrehled.tsx');
const APP = cti('src/App.tsx');

test('karta dneška je nahoře a bere data ze serveru', () => {
  assert.match(APP, /<DnesniPrehled/, 'App kartu nekreslí');
  assert.match(KARTA, /'\/api\/stats\/adherence'/, 'karta nevolá adherence');
  // Dnes má začínat dneškem hned pod hlavičkou a prodejním pruhem, ne až
  // pod „Účtem a předplatným" na konci stránky.
  assert.ok(
    APP.indexOf('<DnesniPrehled') < APP.indexOf('<UcetASpravaSection'),
    'dnešek není nad účtem a předplatným'
  );
});

test('neodškrtnuté jídlo znamená „nevíme", ne „nesnědl"', () => {
  assert.match(KARTA, /zaznamenáno/, 'chybí rozlišení zaznamenaného od plánovaného');
  assert.match(KARTA, /nevíme, jestli jsi jedl/, 'chybí přiznání chybějícího záznamu');
  assert.ok(
    !/% splněno/.test(KARTA),
    'karta zase tvrdí procento splnění z odškrtnutých položek'
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

test('ve dni volna je primární akce jídelníček, ne "prohlédnout tréninkový plán"', () => {
  // Do 17. 9. 2026 bylo tréninkové tlačítko primární (azurové) VŽDY, i ve
  // dni bez tréninku, kde "Prohlédnout tréninkový plán" jako hlavní akce
  // nedává smysl. Teď se primární tlačítko větví podle maTrenink.
  assert.match(KARTA, /\{maTrenink \? \(/, 'primární akce se nevětví podle maTrenink');

  const [, vetevBezTreninku] = KARTA.split(/\{maTrenink \? \(/);
  assert.ok(vetevBezTreninku, 'chybí větev pro den bez tréninku');
  // V bez-tréninkové větvi: jídelníček dostane azurový (primární) styl a
  // odkaz na trénink klesne na stejný sekundární styl jako "Upravit cíle".
  const primarniStyl = 'border-cyan-500\\/40 bg-cyan-950\\/60 px-4 text-sm font-semibold text-cyan-300';
  const sekundarniStylJakoUpravitCile = 'border-slate-800 px-4 text-sm text-slate-400 hover:text-slate-200';
  assert.match(
    vetevBezTreninku,
    new RegExp(`className="min-h-11 rounded-xl border ${primarniStyl}[\\s\\S]*?Otevřít jídelníček`),
    've dni volna musí být "Otevřít jídelníček" primární (azurové) tlačítko'
  );
  assert.match(
    vetevBezTreninku,
    new RegExp(`className="min-h-11 rounded-xl border ${sekundarniStylJakoUpravitCile}[\\s\\S]*?Prohlédnout tréninkový plán`),
    've dni volna musí mít tréninkové tlačítko stejný sekundární styl jako "Upravit cíle"'
  );
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
