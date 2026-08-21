// /lib/withings/withingsTrends.js

const TREND_FIELDS = ['weight_kg', 'fat_percent', 'fat_mass_kg', 'muscle_mass_kg', 'bone_mass_kg', 'hydration_kg', 'bmi'];

function roundDelta(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function isValidMeasurement(item) {
  return item && item.measured_at && (
    Number.isFinite(item.weight_kg)
    || Number.isFinite(item.fat_percent)
    || Number.isFinite(item.muscle_mass_kg)
  );
}

function sortByDateDesc(measurements) {
  return [...(measurements || [])]
    .filter(isValidMeasurement)
    .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
}

function findClosestMeasurement(measurements, targetMs) {
  let best = null;
  let bestDiff = Infinity;
  for (const item of measurements) {
    const t = new Date(item.measured_at).getTime();
    const diff = Math.abs(t - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  }
  return best;
}

function computeDelta(latest, baseline, fields = TREND_FIELDS) {
  const delta = {};
  if (!latest || !baseline) return delta;
  for (const field of fields) {
    const a = Number(latest[field]);
    const b = Number(baseline[field]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      delta[field] = roundDelta(a - b);
    }
  }
  return delta;
}

/**
 * @param {Array} measurements - normalizované snapshoty seřazené libovolně
 */
export function calculateWithingsTrends(measurements) {
  const sorted = sortByDateDesc(measurements);
  const latest = sorted[0] || null;
  const previous = sorted[1] || null;

  if (sorted.length < 2) {
    return {
      latest,
      previous: null,
      delta: {},
      trend7d: {},
      trend30d: {},
      hasEnoughData: false,
      message: 'Trend spočítáme po dalších měřeních.',
    };
  }

  const now = latest ? new Date(latest.measured_at).getTime() : Date.now();
  const day7 = findClosestMeasurement(sorted.slice(1), now - 7 * 24 * 60 * 60 * 1000);
  const day30 = findClosestMeasurement(sorted.slice(1), now - 30 * 24 * 60 * 60 * 1000);

  return {
    latest,
    previous,
    delta: computeDelta(latest, previous),
    trend7d: computeDelta(latest, day7),
    trend30d: computeDelta(latest, day30),
    hasEnoughData: true,
    message: null,
  };
}

export function formatTrendDelta(value, unit = '') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  const formatted = String(n).replace('.', ',');
  return `${sign}${formatted}${unit}`;
}
