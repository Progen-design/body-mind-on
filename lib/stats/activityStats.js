/**
 * Helpers for /api/stats/activity — Apple Watch / Withings activity stats.
 */

export const ACTIVITY_STATS_DAYS = Object.freeze([7, 30, 90, 3650]);

const WORKOUT_TYPE_LABELS_CS = {
  pool_swim: 'Plavání',
  swimming: 'Plavání',
  swim: 'Plavání',
  running: 'Běh',
  run: 'Běh',
  cycling: 'Kolo',
  bike: 'Kolo',
  walking: 'Chůze',
  hike: 'Turistika',
  hiking: 'Turistika',
  strength: 'Síla',
  traditional_strength_training: 'Síla',
  functional_strength_training: 'Síla',
  yoga: 'Jóga',
  pilates: 'Pilates',
  hiit: 'HIIT',
  core_training: 'Core',
  elliptical: 'Eliptický',
  rowing: 'Veslování',
  dance: 'Tanec',
  other: 'Jiný',
};

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function parseActivityStatsDays(raw) {
  if (raw === 'all' || raw === 'celkem') return 3650;
  const n = Number(raw);
  if (ACTIVITY_STATS_DAYS.includes(n)) return n;
  return 7;
}

/**
 * @param {unknown} row
 */
export function normalizeActivityStatsRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      obdobi_dnu: 7,
      kroky: 0,
      pohyb_min: 0,
      aktivni_kcal: 0,
      treninky: 0,
      treninky_watch: 0,
      treninky_plan: 0,
      aktivni_dny: 0,
      jidla_odskrtnuta: 0,
      navyky_splnene: 0,
      checkiny: 0,
      vaha_start: null,
      vaha_konec: null,
      vaha_zmena: null,
    };
  }
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const int = (v) => {
    const n = num(v);
    return n == null ? 0 : Math.round(n);
  };
  return {
    obdobi_dnu: int(row.obdobi_dnu) || 7,
    kroky: int(row.kroky),
    pohyb_min: int(row.pohyb_min),
    aktivni_kcal: int(row.aktivni_kcal),
    treninky: int(row.treninky),
    treninky_watch: int(row.treninky_watch),
    treninky_plan: int(row.treninky_plan),
    aktivni_dny: int(row.aktivni_dny),
    jidla_odskrtnuta: int(row.jidla_odskrtnuta),
    navyky_splnene: int(row.navyky_splnene),
    checkiny: int(row.checkiny),
    vaha_start: num(row.vaha_start),
    vaha_konec: num(row.vaha_konec),
    vaha_zmena: num(row.vaha_zmena),
  };
}

export function workoutTypeLabelCs(type) {
  const key = String(type || '').toLowerCase().trim();
  if (!key) return 'Trénink';
  if (WORKOUT_TYPE_LABELS_CS[key]) return WORKOUT_TYPE_LABELS_CS[key];
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Daily load bars from apple_health_daily (exercise_min).
 * @param {Array<{ local_date?: string, exercise_min?: number|string, active_kcal?: number|string }>} daily
 * @param {number} [days=7]
 */
export function buildDailyLoadBarsFromAppleHealth(daily, days = 7) {
  const byDate = new Map();
  for (const row of daily || []) {
    const key = String(row.local_date || '').slice(0, 10);
    if (!key) continue;
    byDate.set(key, {
      exercise_min: Number(row.exercise_min) || 0,
      active_kcal: Number(row.active_kcal) || 0,
    });
  }

  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }

  const values = keys.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      label: formatShortDateCs(date),
      points: row ? Math.round(row.exercise_min) : 0,
      kcal: row ? Math.round(row.active_kcal) : 0,
    };
  });
  const max = Math.max(1, ...values.map((v) => v.points));
  return values.map((v) => ({
    ...v,
    ratio: v.points > 0 ? Math.max(10, Math.round((v.points / max) * 100)) : 0,
  }));
}

/**
 * Type load bars from apple_health_daily.workout_types (+ workout_min share).
 */
export function buildTypeLoadBarsFromAppleHealth(daily) {
  const map = {};
  for (const row of daily || []) {
    const types = Array.isArray(row.workout_types) ? row.workout_types.filter(Boolean) : [];
    if (!types.length) continue;
    const minutes = Number(row.workout_min) || Number(row.exercise_min) || 0;
    const share = minutes > 0 ? minutes / types.length : 1;
    for (const t of types) {
      const label = workoutTypeLabelCs(t);
      map[label] = (map[label] || 0) + share;
    }
  }
  const entries = Object.entries(map)
    .map(([label, points]) => ({ id: label, label, points: Math.round(points * 10) / 10 }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 6);
  const max = Math.max(1, ...entries.map((x) => x.points), 1);
  return entries.map((x) => ({
    ...x,
    ratio: Math.max(8, Math.round((x.points / max) * 100)),
  }));
}

export function formatShortDateCs(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  return `${Number(day)}.${Number(m)}.`;
}

/**
 * Pick up to maxLabels evenly spaced indices (always include first & last).
 * @param {number} length
 * @param {number} [maxLabels=8]
 * @returns {number[]}
 */
export function pickSparseLabelIndices(length, maxLabels = 8) {
  const n = Number(length) || 0;
  if (n <= 0) return [];
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let i = 0; i < maxLabels; i += 1) {
    out.push(Math.round((i * (n - 1)) / (maxLabels - 1)));
  }
  return [...new Set(out)];
}
