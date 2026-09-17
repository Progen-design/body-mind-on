#!/usr/bin/env node
/**
 * Ověření integrity modulu Progres – žádné modelované váhy ani kcal→tuk.
 * npm run verify:progress-integrity
 *
 * PROMPT_UKLID.md (2026-09-17) — GAP, větší než detail. Celá "Progress"
 * analytická sekce (`_legacy-next/components/profile/ProfileProgressSection.js`:
 * váhový graf s trendem, souhrn aktivity po obdobích, cílová linka) nemá
 * v `src/` ŽÁDNÝ ekvivalent — ověřeno greppem přes `computeActivitySummary`,
 * `getPeriodBounds`, `buildMeasuredWeightChart`, `normalizeMeasurementPoints`
 * (0 zásahů mimo tenhle skript a jeho testy). Živý `src/components/
 * WeightChart.tsx` jede úplně jinou, jednodušší cestou (`WeightRecord` typ
 * přímo z `adaptery.ts`), NE přes `lib/progressIntegrity.js` — a nezávisle
 * ověřeno, že si znovu nezavedl to, kvůli čemu `progressIntegrity.js`
 * vznikl (žádné "kg tuku", žádný BodyFigure/silhouette, žádný
 * KCAL_PER_KG_BODY_FAT). Bezpečnostní vlastnost tedy drží, i když
 * přes jiný, netestovaný kód. `lib/progressIntegrity.js` samo zůstává
 * a testuje se dál — je to čistá funkce, platí bez ohledu na to, jestli ji
 * dnes něco volá. Pinováno jako GAP, ne vymyšleno.
 */
import {
  normalizeMeasurementPoints,
  buildMeasuredWeightChart,
  getWeightTrend,
  computeActivitySummary,
  validateMeasurementInput,
  getPeriodBounds,
} from '../lib/progressIntegrity.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

// `20260713210000_body_measurements.sql` neexistuje — squashnuto do baseline
// (stejný nález jako verify-paid-membership-gate.mjs / verify-profile-beta-ux.mjs).
const migration = read('supabase/migrations/20260714180000_baseline_schema.sql');
const bodyApi = read('api/body-measurements.js');
const profileApi = read('api/profile.js');
const weightChart = read('src/components/WeightChart.tsx');
const adapteryTs = read('src/data/adaptery.ts');

check('GAP: žádná src/ komponenta nevolá progressIntegrity.js', !weightChart.includes('progressIntegrity') && !adapteryTs.includes('progressIntegrity'));
check('GAP: živý WeightChart přesto nemá kcal→kg tuku fabulaci', !weightChart.includes('kg tuku') && !weightChart.includes('KCAL_PER_KG_BODY_FAT'));
check('GAP: živý WeightChart nemá siluetu/BodyFigure', !weightChart.includes('BodyFigure') && !weightChart.includes('body-figures-row'));

// 5–7 measurements source (živé api/lib, ne _legacy-next)
check('6 measurement has date field in model', migration.includes('measured_at'));
check('7 measurement has source field', migration.includes('source') && bodyApi.includes("source: 'manual'"));

// 8–9 trend rules
const single = getWeightTrend([{ weight_kg: 80, date: '2026-01-01' }]);
check('8 single measurement no trend', single.state === 'single');
const trend = getWeightTrend([
  { weight_kg: 80, date: '2026-01-01' },
  { weight_kg: 79.3, date: '2026-01-15' },
]);
check('9 two measurements trend delta', trend.state === 'trend' && trend.delta_kg === -0.7);

// 10–11 chart no predicted points
const chart = buildMeasuredWeightChart([
  { weight_kg: 80, date: '2026-01-01', source: 'manual', measured_at: '2026-01-01' },
  { weight_kg: 79, date: '2026-01-08', source: 'manual', measured_at: '2026-01-08' },
]);
check('10 chart only measured points', chart.length === 2 && !chart.some((p) => p.source === 'estimated'));

// 12 period filter
const todayKey = new Date().toISOString().slice(0, 10);
const oldKey = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
const act7 = computeActivitySummary({
  periodId: '7',
  userCreatedAt: '2026-01-01T00:00:00Z',
  workouts: [
    { workout_date: todayKey, duration_min: 30 },
    { workout_date: oldKey, duration_min: 60 },
  ],
});
check('12 period 7d filters workouts', act7.completedWorkouts === 1);

// 13, 15 activity integrity
// Datum bylo natvrdo 2026-07-01/02 — mimo "posledních 30 dní" od jakéhokoli
// dnešku po srpnu 2026. Relativní k Date.now(), jako period-filter test výš.
// Dva různé dny schválně (workout den + zvlášť den dokončení), jinak by
// spadly na stejný den a activeDays vyšlo 1 misto 2.
const workoutKey = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
const completionKey = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
const act = computeActivitySummary({
  periodId: '30',
  userCreatedAt: '2026-01-01',
  workouts: [{ workout_date: workoutKey, duration_min: 30 }],
  dailyCompletions: [
    { activity_type: 'workout', completed_at: `${completionKey}T10:00:00Z` },
    { activity_type: 'meal', completed_at: `${completionKey}T11:00:00Z` },
  ],
});
check('13 active days from real activities', act.activeDays === 2);
check('15 only logged workouts counted', act.completedWorkouts === 1);

// 16–17 privacy
check('16 profile API returns progress arrays', profileApi.includes('body_measurements') && profileApi.includes('daily_activity_completions'));
check('17 body API scoped to user', bodyApi.includes('user_id') && bodyApi.includes('auth.getUser'));

// 18 validation
const badWeight = validateMeasurementInput({ weight_kg: 5 });
const good = validateMeasurementInput({ weight_kg: 75, measured_at: '2026-07-01' });
check('18 server validates ranges', !badWeight.ok && good.ok);

// period bounds all
const allBounds = getPeriodBounds('all', '2026-01-01T00:00:00Z');
check('extra all period uses user created_at', allBounds.startKey === '2026-01-01');

// normalize dedupe
const normalized = normalizeMeasurementPoints({
  bodyMeasurements: [{ id: '1', measured_at: '2026-07-01', weight_kg: 75, source: 'manual' }],
  bodyMetrics: [
    { id: 'r', created_at: '2026-01-01', weight_kg: 80 },
    { id: 'u', created_at: '2026-07-01', weight_kg: 75 },
  ],
  registrationMetric: { id: 'r', created_at: '2026-01-01', weight_kg: 80 },
  registrationMetricId: 'r',
});
check('extra measurements merged', normalized.weightSeries.length >= 2);

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
