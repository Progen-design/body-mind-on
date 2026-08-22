// Fixture odpovida skutecnym radkum pohledu apple_health_recovery v produkci
// vcetne der: recovery_score null, has_sleep false, hrv_baseline7 null.
import test from 'node:test';
import assert from 'node:assert/strict';
import { naBiometrii, maZdravotniData, naTreninkyZHodinek } from './adapteryZdravi.ts';
import { PRAZDNA_BIOMETRIE } from './initialData.ts';

const BEZ_VERDIKTU = {
  local_date: '2026-08-13', hrv_ms: 43.4, resting_hr: 69, steps: 9351,
  active_kcal: 730, exercise_min: 15, has_sleep: false, sleep_asleep_min: null,
  hrv_baseline7: null, recovery_score: null, recovery_status: 'nedostatek_dat'
};

const SVERDIKTEM = { ...BEZ_VERDIKTU, local_date: '2026-08-14', recovery_score: 82, recovery_status: 'ok' };

test('bez skóre a se stavem nedostatek_dat se nevyrobí verdikt o regeneraci', () => {
  const b = naBiometrii([BEZ_VERDIKTU] as any, [], true, null, PRAZDNA_BIOMETRIE);
  assert.equal(b.recoveryScore, 0, 'nula znamená "nevíme", UI ji skryje');
  assert.equal(b.recoveryAdvice, '', 'žádná rada bez podkladu');
});

test('se skóre a stavem ok verdikt vznikne', () => {
  const b = naBiometrii([SVERDIKTEM] as any, [], true, null, PRAZDNA_BIOMETRIE);
  assert.equal(b.recoveryScore, 82);
  assert.equal(b.recoveryStatus, 'Připraven na max');
  assert.ok(b.recoveryAdvice.length > 0);
});

test('naměřené hodnoty projdou, chybějící spánek se neodhaduje', () => {
  const b = naBiometrii([BEZ_VERDIKTU] as any, [], true, null, PRAZDNA_BIOMETRIE);
  assert.equal(b.hrvMs, 43.4);
  assert.equal(b.restingHrBpm, 69);
  assert.equal(b.stepsToday, 9351);
  assert.equal(b.sleepDuration, '—', 'has_sleep false → pomlčka, ne vymyšlené hodiny');
  assert.equal(b.hrvBaselineMs, 0, 'baseline chybí');
});

test('trendy berou jen dny, kde hodnota opravdu je', () => {
  const radky = [
    { ...BEZ_VERDIKTU, local_date: '2026-08-11', hrv_ms: null },
    { ...BEZ_VERDIKTU, local_date: '2026-08-12', hrv_ms: 40 },
    { ...BEZ_VERDIKTU, local_date: '2026-08-13', hrv_ms: 43.4 }
  ];
  const b = naBiometrii(radky as any, [], true, null, PRAZDNA_BIOMETRIE);
  assert.equal(b.hrvTrend.length, 2);
  assert.deepEqual(b.hrvTrend.map((t) => t.value), [40, 43.4]);
});

test('maZdravotniData pozná prázdno', () => {
  assert.equal(maZdravotniData([]), false);
  assert.equal(
    maZdravotniData([{ ...BEZ_VERDIKTU, hrv_ms: null, resting_hr: null, steps: null }] as any),
    false
  );
  assert.equal(maZdravotniData([BEZ_VERDIKTU] as any), true);
});

test('tréninky z hodinek se převedou i s tepem a délkou', () => {
  const t = naTreninkyZHodinek([
    { workout_type: 'Bazén Plavat', started_at: '2026-08-20T14:10:36+00:00',
      duration_s: 1680.87, active_kcal: 441.45, avg_hr: 137.7, max_hr: 151 }
  ] as any);
  assert.equal(t.length, 1);
  assert.equal(t[0].type, 'Bazén Plavat');
  assert.equal(t[0].durationMin, 28);
  assert.equal(t[0].caloriesBurned, 441);
  assert.equal(t[0].avgHr, 138);
});


// ------------------------------------------------- metriky z hodinek (3.10)
//
// Fixture je doslovny vyrez apple_health_metrics_daily z produkce vcetne
// sloupcu label_cs, category, unit, agg a is_key — ty uz tabulka nese
// a do 22. 8. 2026 je necetl nikdo.

const METRIKY = [
  { local_date: '2026-08-21', metric_name: 'heart_rate_variability', label_cs: 'HRV',
    category: 'srdce', unit: 'ms', agg: 'avg', is_key: true, value: 33.47 },
  { local_date: '2026-08-22', metric_name: 'heart_rate_variability', label_cs: 'HRV',
    category: 'srdce', unit: 'ms', agg: 'avg', is_key: true, value: 41.2 },
  { local_date: '2026-08-22', metric_name: 'resting_heart_rate', label_cs: 'Klidový tep',
    category: 'srdce', unit: 'count/min', agg: 'avg', is_key: true, value: 69.3 },
  { local_date: '2026-08-22', metric_name: 'step_count', label_cs: 'Kroky',
    category: 'aktivita', unit: 'count', agg: 'sum', is_key: true, value: 15625.43 },
  { local_date: '2026-08-22', metric_name: 'respiratory_rate', label_cs: 'Dechová frekvence',
    category: 'dychani', unit: 'count/min', agg: 'avg', is_key: true, value: 14.91 },
  // Neklicova metrika — do profilu nepatri, at uz hodnotu ma nebo nema.
  { local_date: '2026-08-22', metric_name: 'underwater_temperature', label_cs: 'Teplota vody',
    category: 'prostredi', unit: 'degC', agg: 'avg', is_key: false, value: 27.36 },
  // Klicova, ale bez namerene hodnoty — dlazdice se nesmi vykreslit vubec.
  { local_date: '2026-08-22', metric_name: 'blood_oxygen_saturation', label_cs: 'Okysličení krve',
    category: 'dychani', unit: '%', agg: 'avg', is_key: true, value: null }
];

test('zobrazují se jen klíčové metriky, které mají naměřenou hodnotu', async () => {
  const { naSkupinyMetrik } = await import('./adapteryZdravi.ts');
  const skupiny = naSkupinyMetrik(METRIKY as never);
  const klice = skupiny.flatMap((s) => s.metriky.map((m) => m.klic));

  assert.ok(klice.includes('heart_rate_variability'));
  assert.equal(klice.includes('underwater_temperature'), false, 'neklicova metrika v profilu nema co delat');
  assert.equal(
    klice.includes('blood_oxygen_saturation'), false,
    'metrika bez hodnoty se nesmi vykreslit ani jako "—"'
  );
});

test('bere se poslední den, který hodnotu má', async () => {
  const { naSkupinyMetrik } = await import('./adapteryZdravi.ts');
  const srdce = naSkupinyMetrik(METRIKY as never).find((s) => s.klic === 'srdce');
  const hrv = srdce?.metriky.find((m) => m.klic === 'heart_rate_variability');

  assert.equal(hrv?.datum, '2026-08-22');
  assert.equal(hrv?.hodnota, '41,2');
});

test('jednotky se překládají do češtiny podle metriky', async () => {
  const { naSkupinyMetrik } = await import('./adapteryZdravi.ts');
  const skupiny = naSkupinyMetrik(METRIKY as never);
  const najdi = (k: string) => skupiny.flatMap((s) => s.metriky).find((m) => m.klic === k);

  // count/min znamena u tepu neco jineho nez u dechu.
  assert.equal(najdi('resting_heart_rate')?.jednotka, 'tep/min');
  assert.equal(najdi('respiratory_rate')?.jednotka, 'dech/min');
  // U kroku je "count" sum — cislo mluvi samo.
  assert.equal(najdi('step_count')?.jednotka, '');
  assert.equal(najdi('step_count')?.hodnota, (15625).toLocaleString('cs-CZ'));
});

test('sekce mají české názvy a pevné pořadí', async () => {
  const { naSkupinyMetrik } = await import('./adapteryZdravi.ts');
  const skupiny = naSkupinyMetrik(METRIKY as never);

  assert.deepEqual(skupiny.map((s) => s.nazev), ['Srdce', 'Aktivita', 'Dýchání']);
});

test('prázdný vstup nespadne a nevrátí nic', async () => {
  const { naSkupinyMetrik } = await import('./adapteryZdravi.ts');
  assert.deepEqual(naSkupinyMetrik([]), []);
  assert.deepEqual(naSkupinyMetrik(undefined as never), []);
});

// ------------------------------------------------------------ spánek (3.10)
//
// Zmereno v apple_health_raw_payloads: zdroj posila rem/core/deep/inBed jako
// literalni nulu. Import je spravne nulluje. Fixture to kopiruje.

const NOCI = [
  {
    local_date: '2026-08-15', sleep_start: '2026-08-15T02:35:38+00:00',
    sleep_end: '2026-08-15T14:20:47+00:00', asleep_min: 254.25, awake_min: 42.79
  },
  {
    local_date: '2026-08-21', sleep_start: '2026-08-21T01:43:34+00:00',
    sleep_end: '2026-08-21T04:03:23+00:00', asleep_min: 118.41, awake_min: 21.39
  }
];

test('bere se poslední noc a délka se formátuje jako hodiny a minuty', async () => {
  const { naSpanek } = await import('./adapteryZdravi.ts');
  const noc = naSpanek(NOCI as never);

  assert.equal(noc?.datum, '2026-08-21');
  assert.equal(noc?.spanek, '1 h 58 min');
  assert.equal(noc?.probuzeni, '21 min');
});

test('noc bez naměřené délky se nevrací — sekce se skryje', async () => {
  const { naSpanek } = await import('./adapteryZdravi.ts');

  assert.equal(naSpanek([]), null);
  assert.equal(naSpanek([{ local_date: '2026-08-22', asleep_min: null } as never]), null);
  // Nulova noc neni namerena noc.
  assert.equal(naSpanek([{ local_date: '2026-08-22', asleep_min: 0 } as never]), null);
});

test('výstup spánku neobsahuje fáze ani efektivitu — zdroj je neposílá', async () => {
  const { naSpanek } = await import('./adapteryZdravi.ts');
  const noc = naSpanek(NOCI as never);
  const klice = Object.keys(noc ?? {});

  for (const zakazany of ['rem', 'core', 'deep', 'efektivita', 'vPosteli']) {
    assert.equal(klice.includes(zakazany), false, `${zakazany} se do UI dostat nesmi`);
  }
});
