import { normalizeWithingsMeasures, stripRawPayload } from './normalizeWithingsMeasures.js';

const TYPE_TO_LABEL = {
  1: 'weight_kg',
  4: 'height_m',
  5: 'fat_free_mass_kg',
  6: 'fat_percent',
  8: 'fat_mass_kg',
  11: 'pulse',
  76: 'muscle_mass_kg',
  77: 'hydration_kg',
  88: 'bone_mass_kg',
  123: 'visceral_fat',
  170: 'visceral_fat',
  226: 'basal_metabolic_rate',
};

const LABEL_ALIAS = {
  fat_ratio_percent: 'fat_percent',
  heart_rate: 'pulse',
};

function normalizedLabel(row) {
  const type = Number(row?.measure_type);
  const rawLabel = String(row?.measure_type_label || '').trim().toLowerCase();
  const mappedByType = TYPE_TO_LABEL[type] || null;

  // Backward-compatible fallback for historic rows stored as "measure_<type>".
  if (/^measure_\d+$/.test(rawLabel) && mappedByType) return mappedByType;
  if (LABEL_ALIAS[rawLabel]) return LABEL_ALIAS[rawLabel];
  if (rawLabel) return rawLabel;
  return mappedByType || null;
}

function groupKey(row) {
  const groupId = String(row?.withings_measure_group_id || '').trim();
  if (groupId) return `g:${groupId}`;
  const measuredAt = String(row?.measured_at || '').trim();
  if (measuredAt) return `t:${measuredAt}`;
  const type = String(row?.measure_type ?? 'x');
  const value = String(row?.value ?? 'x');
  return `fallback:${type}:${value}`;
}

function measuredAtMs(groupRows) {
  const first = String(groupRows?.[0]?.measured_at || '').trim();
  const ts = new Date(first).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function aggregateGroup(groupRows, userContext = {}) {
  if (!Array.isArray(groupRows) || !groupRows.length) return null;
  const measuredAt = groupRows[0]?.measured_at || null;
  const groupId = groupRows[0]?.withings_measure_group_id || null;
  const byLabel = {};

  for (const row of groupRows) {
    const label = normalizedLabel(row);
    const value = Number(row?.value);
    if (!label || !Number.isFinite(value)) continue;
    byLabel[label] = value;
  }

  const normalized = normalizeWithingsMeasures({
    measured_at: measuredAt,
    withings_measure_group_id: groupId,
    by_label: byLabel,
  }, userContext);

  return stripRawPayload(normalized);
}

export function aggregateWithingsMeasurements(rows, userContext = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const grouped = new Map();

  for (const row of rows) {
    const key = groupKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const snapshots = [...grouped.values()]
    .map((groupRows) => aggregateGroup(groupRows, userContext))
    .filter(Boolean)
    .sort((a, b) => {
      const ta = new Date(a?.measured_at || 0).getTime();
      const tb = new Date(b?.measured_at || 0).getTime();
      return tb - ta;
    });

  return snapshots[0] || null;
}

export function aggregateWithingsMeasurementsHistory(rows, userContext = {}, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const limit = Math.min(Math.max(Number(options.limit) || 90, 1), 200);
  const grouped = new Map();

  for (const row of rows) {
    const key = groupKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  return [...grouped.values()]
    .sort((a, b) => measuredAtMs(b) - measuredAtMs(a))
    .map((groupRows) => aggregateGroup(groupRows, userContext))
    .filter(Boolean)
    .slice(0, limit);
}
