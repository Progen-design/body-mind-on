/**
 * Progres založený pouze na skutečných záznamech — žádné modelované váhy ani převody kcal→tuk.
 */

export const PROGRESS_PERIODS = Object.freeze([
  { id: '7', label: '7 dní', days: 7 },
  { id: '30', label: '30 dní', days: 30 },
  { id: '90', label: '90 dní', days: 90 },
  { id: 'all', label: 'Celkem', days: null },
]);

const SOURCE_LABELS_CS = {
  manual: 'Ručně zadané',
  withings: 'Withings',
  integration: 'Zařízení',
  body_metrics: 'Ručně zadané',
  registration: 'Registrace',
};

function toDateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function parseMeasuredAt(row) {
  return row?.measured_at || row?.created_at || row?.date || null;
}

function inPeriod(dateKey, periodStartKey, periodEndKey) {
  if (!dateKey) return false;
  return dateKey >= periodStartKey && dateKey <= periodEndKey;
}

export function getPeriodBounds(periodId, userCreatedAt) {
  const end = new Date();
  const endKey = toDateKey(end.toISOString());
  const period = PROGRESS_PERIODS.find((p) => p.id === periodId) || PROGRESS_PERIODS[1];
  if (period.days == null) {
    const startKey = toDateKey(userCreatedAt || end.toISOString());
    return { startKey, endKey, label: period.label };
  }
  const start = new Date(end);
  start.setDate(start.getDate() - (period.days - 1));
  return { startKey: toDateKey(start.toISOString()), endKey, label: period.label };
}

function addDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d.toISOString());
}

export function computeStreaks(activeDaySet, periodEndKey) {
  const activeDays = [...(activeDaySet || new Set())].sort();
  let bestStreak = 0;
  let run = 0;
  let prev = null;
  for (const d of activeDays) {
    if (prev && addDaysKey(prev, 1) === d) run += 1;
    else run = 1;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  }
  let currentStreak = 0;
  let cursor = periodEndKey;
  const set = activeDaySet instanceof Set ? activeDaySet : new Set(activeDaySet || []);
  while (set.has(cursor)) {
    currentStreak += 1;
    cursor = addDaysKey(cursor, -1);
  }
  return { currentStreak, bestStreak };
}

/** Sjednotí měření z body_measurements, body_metrics (bez registrace) a Withings. */
export function normalizeMeasurementPoints({
  bodyMeasurements = [],
  bodyMetrics = [],
  withingsHistory = [],
  registrationMetric = null,
  registrationMetricId = null,
}) {
  const points = [];

  if (registrationMetric?.weight_kg != null) {
    const measuredAt = parseMeasuredAt(registrationMetric);
    const date = toDateKey(measuredAt);
    if (date) {
      points.push({
        id: `reg-${registrationMetric.id}`,
        date,
        measured_at: measuredAt,
        weight_kg: Number(registrationMetric.weight_kg),
        waist_cm: null,
        hips_cm: null,
        chest_cm: null,
        arm_cm: null,
        source: 'registration',
        source_label: SOURCE_LABELS_CS.registration,
        deletable: false,
      });
    }
  }

  for (const row of bodyMeasurements) {
    const measuredAt = parseMeasuredAt(row);
    const date = toDateKey(measuredAt);
    if (!date) continue;
    points.push({
      id: row.id,
      date,
      measured_at: measuredAt,
      weight_kg: row.weight_kg != null ? Number(row.weight_kg) : null,
      waist_cm: row.waist_cm != null ? Number(row.waist_cm) : null,
      hips_cm: row.hips_cm != null ? Number(row.hips_cm) : null,
      chest_cm: row.chest_cm != null ? Number(row.chest_cm) : null,
      arm_cm: row.arm_cm != null ? Number(row.arm_cm) : null,
      source: row.source || 'manual',
      source_label: SOURCE_LABELS_CS[row.source] || SOURCE_LABELS_CS.manual,
      deletable: row.source === 'manual',
    });
  }

  const metricsSorted = [...bodyMetrics].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const registrationId = registrationMetricId || metricsSorted[0]?.id;
  for (const row of metricsSorted) {
    if (row.id === registrationId) continue;
    if (row.weight_kg == null) continue;
    const measuredAt = parseMeasuredAt(row);
    const date = toDateKey(measuredAt);
    if (!date) continue;
    const source = String(row.notes || '').includes('[withings_import]') ? 'withings' : 'body_metrics';
    points.push({
      id: `bm-${row.id}`,
      date,
      measured_at: measuredAt,
      weight_kg: Number(row.weight_kg),
      waist_cm: null,
      hips_cm: null,
      chest_cm: null,
      arm_cm: null,
      source,
      source_label: SOURCE_LABELS_CS[source] || SOURCE_LABELS_CS.manual,
      deletable: false,
    });
  }

  for (const row of withingsHistory) {
    if (!Number.isFinite(Number(row.weight))) continue;
    const date = toDateKey(row.date || row.measured_at);
    if (!date) continue;
    points.push({
      id: `withings-${date}-${row.measured_at || ''}`,
      date,
      measured_at: row.measured_at || row.date,
      weight_kg: Math.round(Number(row.weight) * 10) / 10,
      waist_cm: null,
      hips_cm: null,
      chest_cm: null,
      arm_cm: null,
      source: 'withings',
      source_label: SOURCE_LABELS_CS.withings,
      deletable: false,
    });
  }

  const weightByDate = new Map();
  for (const p of points.sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at)))) {
    if (p.weight_kg == null) continue;
    weightByDate.set(p.date, p);
  }

  return {
    allPoints: points.sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at))),
    weightSeries: [...weightByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function buildMeasuredWeightChart(weightSeries) {
  return (weightSeries || [])
    .filter((p) => Number.isFinite(p.weight_kg))
    .map((p) => ({
      date: p.date,
      weight: Math.round(p.weight_kg * 10) / 10,
      source: p.source,
      measured_at: p.measured_at,
    }));
}

export function getWeightTrend(weightSeries) {
  const series = (weightSeries || []).filter((p) => Number.isFinite(p.weight_kg));
  if (series.length === 0) {
    return { state: 'none', message: 'Zatím nemáme dostatek skutečných měření pro zobrazení trendu.' };
  }
  if (series.length === 1) {
    return {
      state: 'single',
      latest: series[0],
      message: 'Zatím máme jedno měření. Pro vývoj potřebujeme alespoň dvě.',
    };
  }
  const first = series[0];
  const last = series[series.length - 1];
  const delta = Math.round((last.weight_kg - first.weight_kg) * 10) / 10;
  const days = Math.max(1, Math.round((new Date(last.date) - new Date(first.date)) / 86400000));
  return {
    state: 'trend',
    first,
    last,
    delta_kg: delta,
    days,
    message: 'Změna vychází ze skutečně zaznamenaných měření.',
  };
}

function getWorkoutDurationMinutes(workout) {
  if (workout?.duration_min != null) return Number(workout.duration_min) || 0;
  const dist = Number(workout?.distance_km) || 0;
  const pace = Number(workout?.pace_min_per_km) || 0;
  if (dist > 0 && pace > 0) return Math.round(dist * pace);
  return 0;
}

function estimatedCaloriesSecondary(workout) {
  const specs = {
    silovy: 5, kardio: 8, beh: 10, cyklistika: 7, plavani: 9, chuze: 4, joga: 3, jine: 5,
  };
  const type = String(workout?.workout_type || 'jine').toLowerCase();
  const kcalPerMin = specs[type] || 5;
  const mins = getWorkoutDurationMinutes(workout);
  return Math.round(mins * kcalPerMin);
}

function countPlannedWorkoutDays(plan, periodStartKey, periodEndKey) {
  if (!plan?.structured_plan_json?.days) return 0;
  const validFrom = toDateKey(plan.valid_from);
  let count = 0;
  for (const day of plan.structured_plan_json.days) {
    const dayIndex = Number(day.day ?? day.day_index ?? 0);
    const hasWorkout = Array.isArray(day.workout?.exercises) && day.workout.exercises.length > 0;
    if (!hasWorkout) continue;
    const approxDate = validFrom ? addDaysKey(validFrom, dayIndex) : null;
    if (approxDate && !inPeriod(approxDate, periodStartKey, periodEndKey)) continue;
    count += 1;
  }
  return count;
}

export function computeActivitySummary({
  periodId = '30',
  userCreatedAt,
  workouts = [],
  dailyCompletions = [],
  dailyCheckins = [],
  habitLogs = [],
  plan = null,
}) {
  const { startKey, endKey, label } = getPeriodBounds(periodId, userCreatedAt);
  const periodWorkouts = workouts.filter((w) => inPeriod(toDateKey(w.workout_date), startKey, endKey));
  const totalMinutes = periodWorkouts.reduce((s, w) => s + getWorkoutDurationMinutes(w), 0);
  const kcalEstimate = periodWorkouts.reduce((s, w) => s + estimatedCaloriesSecondary(w), 0);

  const activeDaySet = new Set();
  periodWorkouts.forEach((w) => {
    const d = toDateKey(w.workout_date);
    if (d) activeDaySet.add(d);
  });

  const planWorkoutCompletions = dailyCompletions.filter(
    (c) => c.activity_type === 'workout' && inPeriod(toDateKey(c.completed_at), startKey, endKey),
  );
  planWorkoutCompletions.forEach((c) => {
    const d = toDateKey(c.completed_at);
    if (d) activeDaySet.add(d);
  });

  const habitCompletions = habitLogs.filter(
    (log) => log.completed === true && inPeriod(toDateKey(log.log_date), startKey, endKey),
  ).length;
  const checkins = dailyCheckins.filter((c) => inPeriod(toDateKey(c.checkin_date || c.created_at), startKey, endKey));
  const { currentStreak, bestStreak } = computeStreaks(activeDaySet, endKey);

  const periodDays = periodId === 'all'
    ? Math.max(1, Math.round((new Date(endKey) - new Date(startKey)) / 86400000) + 1)
    : Number(PROGRESS_PERIODS.find((p) => p.id === periodId)?.days || 30);

  const plannedWorkouts = countPlannedWorkoutDays(plan, startKey, endKey);

  return {
    periodLabel: label,
    periodStart: startKey,
    periodEnd: endKey,
    completedWorkouts: periodWorkouts.length,
    totalMinutes,
    kcalEstimateSecondary: kcalEstimate,
    activeDays: activeDaySet.size,
    periodDays,
    habitCompletions,
    checkinsCount: checkins.length,
    plannedWorkouts,
    completedPlanWorkouts: planWorkoutCompletions.length,
    currentStreak,
    bestStreak,
    recentWorkouts: [...periodWorkouts]
      .sort((a, b) => String(b.workout_date).localeCompare(String(a.workout_date)))
      .slice(0, 3),
    collectingData: periodWorkouts.length <= 1 && activeDaySet.size <= 1,
  };
}

export function getRecommendedNextStep({ weightTrend, activity }) {
  if (weightTrend.state === 'none') {
    return 'Pro přesnější sledování progresu přidej nové měření hmotnosti.';
  }
  if (weightTrend.state === 'single') {
    return 'Přidej další měření, abychom mohli zobrazit trend.';
  }
  if (activity.completedWorkouts === 0) {
    return 'Dokonči další trénink, abychom mohli porovnat tvoji aktivitu.';
  }
  if (activity.collectingData) {
    return 'Zatím sbíráme první data. Pokračuj v zaznamenávání aktivit.';
  }
  return 'Pokračuj v pravidelných měřeních a dokončování tréninků.';
}

export function validateMeasurementInput(body) {
  const measured_at = body?.measured_at || body?.date || new Date().toISOString();
  if (Number.isNaN(Date.parse(measured_at))) {
    return { ok: false, error: 'Neplatné datum měření.' };
  }
  const future = new Date(measured_at) > new Date(Date.now() + 86400000);
  if (future) return { ok: false, error: 'Datum měření nesmí být v budoucnosti.' };

  const fields = ['weight_kg', 'waist_cm', 'hips_cm', 'chest_cm', 'arm_cm'];
  const values = {};
  let any = false;
  for (const f of fields) {
    if (body[f] == null || body[f] === '') continue;
    const n = Number(body[f]);
    if (!Number.isFinite(n)) return { ok: false, error: `Neplatná hodnota: ${f}` };
    if (f === 'weight_kg' && (n <= 20 || n >= 400)) return { ok: false, error: 'Hmotnost musí být mezi 20 a 400 kg.' };
    if (f !== 'weight_kg' && (n <= 20 || n >= 300)) return { ok: false, error: 'Obvod musí být mezi 20 a 300 cm.' };
    values[f] = n;
    any = true;
  }
  if (!any) return { ok: false, error: 'Zadej alespoň jednu hodnotu měření.' };
  return { ok: true, values: { ...values, measured_at } };
}
