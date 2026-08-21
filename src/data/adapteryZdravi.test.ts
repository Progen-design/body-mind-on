// Fixture odpovida skutecnym radkum pohledu apple_health_recovery v produkci
// vcetne der: recovery_score null, has_sleep false, hrv_baseline7 null.
import test from 'node:test';
import assert from 'node:assert/strict';
import { naBiometrii, maZdravotniData, naTreninkyZHodinek } from './adapteryZdravi.ts';
import { appleWatchBiometricsData } from './initialData.ts';

const BEZ_VERDIKTU = {
  local_date: '2026-08-13', hrv_ms: 43.4, resting_hr: 69, steps: 9351,
  active_kcal: 730, exercise_min: 15, has_sleep: false, sleep_asleep_min: null,
  hrv_baseline7: null, recovery_score: null, recovery_status: 'nedostatek_dat'
};

const SVERDIKTEM = { ...BEZ_VERDIKTU, local_date: '2026-08-14', recovery_score: 82, recovery_status: 'ok' };

test('bez skóre a se stavem nedostatek_dat se nevyrobí verdikt o regeneraci', () => {
  const b = naBiometrii([BEZ_VERDIKTU] as any, [], true, null, appleWatchBiometricsData);
  assert.equal(b.recoveryScore, 0, 'nula znamená "nevíme", UI ji skryje');
  assert.equal(b.recoveryAdvice, '', 'žádná rada bez podkladu');
});

test('se skóre a stavem ok verdikt vznikne', () => {
  const b = naBiometrii([SVERDIKTEM] as any, [], true, null, appleWatchBiometricsData);
  assert.equal(b.recoveryScore, 82);
  assert.equal(b.recoveryStatus, 'Připraven na max');
  assert.ok(b.recoveryAdvice.length > 0);
});

test('naměřené hodnoty projdou, chybějící spánek se neodhaduje', () => {
  const b = naBiometrii([BEZ_VERDIKTU] as any, [], true, null, appleWatchBiometricsData);
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
  const b = naBiometrii(radky as any, [], true, null, appleWatchBiometricsData);
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
