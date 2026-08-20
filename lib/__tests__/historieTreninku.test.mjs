/**
 * Sjednocená historie tréninků.
 *
 * Chyba, kterou to opravuje: „Historie tréninků“ hlásila „Zatím nemáš žádné
 * záznamy“, zatímco „Statistiky a progres“ ve stejném profilu ukazovaly pět
 * tréninků a 505 minut. Historie četla `workouts` (ruční zápis, 0 řádků),
 * statistiky i `apple_health_workouts` (5 řádků).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { kmNeboNull, sjednocenaHistorie, souhrnHistorie } from '../profile/historieTreninku.js';

const HODINKY = [
  {
    id: 'w1',
    started_at: '2026-08-18T06:30:00Z',
    label_cs: 'Silový trénink',
    workout_type: 'functionalStrengthTraining',
    duration_s: 3600,
    active_kcal: 420,
    avg_hr: 128,
    max_hr: 165,
    distance_m: 0,
  },
  {
    id: 'w2',
    started_at: '2026-08-20T17:05:00Z',
    label_cs: 'Plavání v bazénu',
    duration_s: 1800,
    total_kcal: 300,
    distance_m: 1200,
  },
];

const RUCNI = [
  { id: 'r1', workout_date: '2026-08-19', workout_name: 'Nohy', duration: 55, workout_type: 'strength' },
];

test('prázdná historie jen když není ani ruční, ani z hodinek', () => {
  assert.equal(sjednocenaHistorie({}).length, 0);
  assert.equal(sjednocenaHistorie({ rucni: [], zHodinek: [] }).length, 0);
  assert.equal(sjednocenaHistorie({ rucni: [], zHodinek: HODINKY }).length, 2);
  assert.equal(sjednocenaHistorie({ rucni: RUCNI, zHodinek: [] }).length, 1);
});

test('tréninky z hodinek se objeví i bez jediného ručního zápisu', () => {
  // Přesně případ z produkce: workouts = 0, apple_health_workouts = 5.
  const z = sjednocenaHistorie({ rucni: [], zHodinek: HODINKY });
  assert.equal(z.length, 2);
  assert.ok(z.every((x) => x.zdroj === 'hodinky'));
});

test('řadí se od nejnovějšího napříč oběma zdroji', () => {
  const z = sjednocenaHistorie({ rucni: RUCNI, zHodinek: HODINKY });
  assert.deepEqual(z.map((x) => x.nazev), ['Plavání v bazénu', 'Nohy', 'Silový trénink']);
});

test('zdroj je u každého záznamu rozeznatelný', () => {
  const z = sjednocenaHistorie({ rucni: RUCNI, zHodinek: HODINKY });
  assert.deepEqual(z.map((x) => x.zdroj), ['hodinky', 'rucni', 'hodinky']);
});

test('sekundy z hodinek se převedou na minuty', () => {
  const [, , silovy] = sjednocenaHistorie({ rucni: RUCNI, zHodinek: HODINKY });
  assert.equal(silovy.minuty, 60);
});

test('kalorie berou aktivní, a když nejsou, celkové', () => {
  const z = sjednocenaHistorie({ zHodinek: HODINKY });
  const silovy = z.find((x) => x.nazev === 'Silový trénink');
  const plavani = z.find((x) => x.nazev === 'Plavání v bazénu');
  assert.equal(silovy.kcal, 420);
  assert.equal(plavani.kcal, 300);
});

test('chybějící údaje jsou null, ne nula', () => {
  const [z] = sjednocenaHistorie({ zHodinek: [{ id: 'x', started_at: '2026-08-20T10:00:00Z' }] });
  assert.equal(z.minuty, null);
  assert.equal(z.kcal, null);
  assert.equal(z.tepPrumer, null);
  assert.equal(z.vzdalenostM, null);
});

test('název z hodinek bere český popisek z workout_type_map', () => {
  const [z] = sjednocenaHistorie({ zHodinek: [HODINKY[0]] });
  assert.equal(z.nazev, 'Silový trénink');
  const [bezPopisku] = sjednocenaHistorie({
    zHodinek: [{ id: 'y', started_at: '2026-08-20T10:00:00Z', workout_type: 'running' }],
  });
  assert.equal(bezPopisku.nazev, 'running');
});

test('minuty ručního zápisu chodí z workoutFormat, ne z vlastního výpočtu', () => {
  const [z] = sjednocenaHistorie({
    rucni: [{ id: 'r', workout_date: '2026-08-19', duration: 55 }],
    pomocnici: { minuty: () => 42 },
  });
  assert.equal(z.minuty, 42);
});

test('smazat jde jen ruční zápis — trénink z hodinek nám nepatří', () => {
  const z = sjednocenaHistorie({ rucni: RUCNI, zHodinek: HODINKY });
  assert.deepEqual(z.map((x) => x.lzeSmazat), [false, true, false]);
});

test('záznam bez čitelného data padá na konec, ne na rok 1970', () => {
  const z = sjednocenaHistorie({
    rucni: [{ id: 'bez', workout_date: null }],
    zHodinek: HODINKY,
  });
  assert.equal(z[z.length - 1].id, 'bez');
});

test('souhrn počítá obojí zvlášť', () => {
  const s = souhrnHistorie(sjednocenaHistorie({ rucni: RUCNI, zHodinek: HODINKY }));
  assert.equal(s.celkem, 3);
  assert.equal(s.rucnich, 1);
  assert.equal(s.zHodinek, 2);
  assert.equal(s.minutyCelkem, 60 + 55 + 30);
});

test('souhrn bez jediné známé délky nehlásí nula minut', () => {
  const s = souhrnHistorie([{ zdroj: 'hodinky', minuty: null }]);
  assert.equal(s.minutyCelkem, null);
});

test('vzdálenost: nula metrů není vzdálenost', () => {
  assert.equal(kmNeboNull(0), null);
  assert.equal(kmNeboNull(null), null);
  assert.equal(kmNeboNull(1200), 1.2);
  assert.equal(kmNeboNull(5432), 5.4);
});
