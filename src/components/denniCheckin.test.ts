// Denní check-in — sbírat odpovědi nestačí, musí z nich něco plynout.
//
// `GET/POST /api/daily-checkin` existoval od začátku i s číselníkem důvodů,
// ale UI ho nikdy nezavolalo: tabulka `daily_checkins` měla v produkci
// 9. 9. 2026 nula řádků.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const KARTA = cti('src/components/DenniCheckin.tsx');
const APP = cti('src/App.tsx');
const CISELNIK = cti('lib/productEventAllowlist.js');

test('check-in je v aplikaci vidět a volá svůj endpoint', () => {
  assert.match(APP, /<DenniCheckin/, 'App kartu nekreslí');
  assert.match(APP, /import \{ DenniCheckin \}/, 'App kartu neimportuje');
  assert.match(KARTA, /'\/api\/daily-checkin'/, 'karta endpoint nevolá');
  assert.match(KARTA, /method: 'POST'/, 'odpověď se neodesílá');
});

test('hodnocení i důvody sedí na číselník, který server přijme', () => {
  // Server odmítne cokoli mimo CHECKIN_RATINGS / CHECKIN_BLOCKERS (400).
  for (const rating of ['great', 'good', 'partial', 'none']) {
    assert.ok(CISELNIK.includes(`'${rating}'`), `server nezná hodnocení ${rating}`);
    assert.ok(KARTA.includes(`'${rating}'`), `karta nenabízí hodnocení ${rating}`);
  }
  for (const blocker of [
    'no_time',
    'food_mismatch',
    'workout_too_hard',
    'workout_too_easy',
    'no_motivation',
    'technical_problem',
    'other',
  ]) {
    assert.ok(CISELNIK.includes(`'${blocker}'`), `server nezná důvod ${blocker}`);
    assert.ok(KARTA.includes(`${blocker}:`), `karta neřeší důvod ${blocker}`);
  }
});

test('každý důvod vede k nabídce, ne jen k poděkování', () => {
  // Důvody, se kterými aplikace umí něco udělat, musí mít tlačítko.
  for (const duvod of ['no_time', 'food_mismatch', 'workout_too_hard', 'workout_too_easy']) {
    const usek = KARTA.slice(KARTA.indexOf(`${duvod}: {`));
    const konec = usek.indexOf('},');
    assert.match(
      usek.slice(0, konec),
      /tlacitko:/,
      `důvod ${duvod} nenabízí žádnou akci`
    );
  }
});

test('na „skvěle" se už na důvod neptáme', () => {
  assert.match(KARTA, /if \(id === 'great'\)/, 'chybí zkratka pro bezproblémový den');
});

test('odpověď se ptá jednou denně, ne pokaždé', () => {
  // Server drží jeden řádek na kalendářní den; karta musí ten stav načíst,
  // jinak by se ptala i po odpovědi.
  assert.match(KARTA, /apiFetch<OdpovedServeru>\('\/api\/daily-checkin'\)/, 'stav dne se nenačítá');
  assert.match(KARTA, /setHotovo\(true\)/, 'už zodpovězený den se nepozná');
});
