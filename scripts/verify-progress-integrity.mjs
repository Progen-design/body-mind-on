#!/usr/bin/env node
/**
 * Ověření integrity modulu Progres – žádné modelované váhy ani kcal→tuk.
 * npm run verify:progress-integrity
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeMeasurementPoints,
  buildMeasuredWeightChart,
  getWeightTrend,
  computeActivitySummary,
  validateMeasurementInput,
  getPeriodBounds,
} from '../lib/progressIntegrity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const profil = read('pages/profil.js');
const progressSection = read('components/profile/ProfileProgressSection.js');
const progressModel = read('lib/progressModel.js');
const migration = read('supabase/migrations/20260713210000_body_measurements.sql');
const bodyApi = read('pages/api/body-measurements.js');
const profileApi = read('pages/api/profile.js');

// 1–4 UI: no fat model, habit grams, modeled weight, silhouette
check('1 no kcal→kg fat in progress UI', !progressSection.includes('kg tuku') && !profil.includes('estimatedKgLostTotal'));
check('2 no modeled weight lines in profil progress', !profil.includes('Z tréninků') && !profil.includes('S návyky'));
check('3 habit weight heuristic not in progress section', !progressSection.includes('habitWeightCorrection') && !progressSection.includes('HABIT_ADJ'));
check('4 silhouette removed from profil UI', !profil.includes('<BodyFigure') && !profil.includes('body-figures-row'));

// 5–7 measurements source
check('5 weight chart uses progressIntegrity', profil.includes('buildMeasuredWeightChart') && profil.includes('normalizeMeasurementPoints'));
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
check('11 goal line labeled in progress section', progressSection.includes('cílová hmotnost'));

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

// 13–15 activity integrity
const act = computeActivitySummary({
  periodId: '30',
  userCreatedAt: '2026-01-01',
  workouts: [{ workout_date: '2026-07-01', duration_min: 30 }],
  dailyCompletions: [
    { activity_type: 'workout', completed_at: '2026-07-02T10:00:00Z' },
    { activity_type: 'meal', completed_at: '2026-07-02T11:00:00Z' },
  ],
});
check('13 active days from real activities', act.activeDays === 2);
check('14 planned vs completed separate', progressSection.includes('plánovaných tréninků'));
check('15 only logged workouts counted', act.completedWorkouts === 1);

// 16–17 privacy
check('16 profile API returns progress arrays', profileApi.includes('body_measurements') && profileApi.includes('daily_activity_completions'));
check('17 body API scoped to user', bodyApi.includes('user_id') && bodyApi.includes('auth.getUser'));

// 18 validation
const badWeight = validateMeasurementInput({ weight_kg: 5 });
const good = validateMeasurementInput({ weight_kg: 75, measured_at: '2026-07-01' });
check('18 server validates ranges', !badWeight.ok && good.ok);

// 19 no diagnosis copy
check('19 no guaranteed progress copy', !progressSection.includes('hubneš') && !progressSection.includes('garantovan'));
check('20 empty states present', progressSection.includes('Zatím nemáme dostatek skutečných měření'));

// no workout estimated chart fallback
check('extra no estimated chart fallback', !profil.includes("chartWeightSource = 'estimated'") && !profil.includes('workoutEstimatedChartData'));

// kcal secondary label
check('extra kcal secondary label', progressSection.includes('Orientační odhad energetického výdeje'));

// progressModel still exists but not used for weight display in profil
check('extra progressModel not imported for weight in profil', !profil.includes('KCAL_PER_KG_BODY_FAT'));

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
