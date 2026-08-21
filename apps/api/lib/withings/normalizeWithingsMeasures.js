// /lib/withings/normalizeWithingsMeasures.js

const MEASURE_TYPE_TO_FIELD = {
  1: 'weight_kg',
  4: 'height_m',
  5: 'fat_free_mass_kg',
  6: 'fat_percent',
  8: 'fat_mass_kg',
  9: 'diastolic_bp',
  10: 'systolic_bp',
  11: 'pulse',
  76: 'muscle_mass_kg',
  77: 'hydration_kg',
  88: 'bone_mass_kg',
  91: 'pulse_wave_velocity',
  123: 'visceral_fat',
  170: 'visceral_fat',
  226: 'basal_metabolic_rate',
};

const FIELD_RANGES = {
  weight_kg: [30, 250],
  fat_percent: [3, 70],
  fat_mass_kg: [1, 150],
  muscle_mass_kg: [10, 150],
  bone_mass_kg: [1, 10],
  hydration_kg: [10, 120],
  hydration_percent: [20, 80],
  bmi: [10, 70],
  pulse: [30, 220],
  visceral_fat: [1, 60],
  basal_metabolic_rate: [800, 5000],
};

function measurementValue(measure) {
  const value = Number(measure?.value);
  const unit = Number(measure?.unit);
  if (!Number.isFinite(value) || !Number.isFinite(unit)) return null;
  return value * Math.pow(10, unit);
}

function roundMetric(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function isInRange(field, value) {
  const range = FIELD_RANGES[field];
  if (!range || value == null) return value == null;
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  return n >= range[0] && n <= range[1];
}

function validateField(field, value, warnings) {
  if (value == null) return null;
  const rounded = roundMetric(value);
  if (!isInRange(field, rounded)) {
    warnings.push(`invalid_${field}:${rounded}`);
    return null;
  }
  return rounded;
}

function calculateBmiFromContext(weightKg, userContext) {
  const heightCm = Number(userContext?.height_cm || userContext?.heightCm);
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || heightCm <= 0) return null;
  const meters = heightCm / 100;
  return roundMetric(weightKg / (meters * meters));
}

function emptySnapshot(measuredAt) {
  return {
    measured_at: measuredAt,
    weight_kg: null,
    fat_percent: null,
    fat_mass_kg: null,
    muscle_mass_kg: null,
    bone_mass_kg: null,
    hydration_kg: null,
    hydration_percent: null,
    bmi: null,
    basal_metabolic_rate: null,
    visceral_fat: null,
    pulse: null,
    source: 'withings',
    raw_payload: {},
  };
}

function applyLabelValue(snapshot, label, value, warnings) {
  const fieldMap = {
    weight_kg: 'weight_kg',
    fat_ratio_percent: 'fat_percent',
    fat_percent: 'fat_percent',
    fat_mass_kg: 'fat_mass_kg',
    muscle_mass_kg: 'muscle_mass_kg',
    bone_mass_kg: 'bone_mass_kg',
    hydration_kg: 'hydration_kg',
    hydration_percent: 'hydration_percent',
    bmi: 'bmi',
    basal_metabolic_rate: 'basal_metabolic_rate',
    visceral_fat: 'visceral_fat',
    pulse: 'pulse',
    heart_rate: 'pulse',
  };
  const field = fieldMap[label];
  if (!field) return;
  snapshot[field] = validateField(field, value, warnings);
}

/**
 * Normalizuje Withings measure group nebo mapu hodnot do jednotného snapshotu.
 * @param {object} rawPayload - measure group z API nebo { measures, date, grpid } / { by_label }
 * @param {object} userContext - volitelně height_cm pro výpočet BMI
 */
export function normalizeWithingsMeasures(rawPayload, userContext = {}) {
  const warnings = [];
  const group = rawPayload?.group || rawPayload;
  const measuredUnix = Number(group?.date || group?.created || rawPayload?.measured_at_unix || 0);
  const measuredAt = measuredUnix
    ? new Date(measuredUnix * 1000).toISOString()
    : (rawPayload?.measured_at || group?.measured_at || new Date().toISOString());

  const snapshot = emptySnapshot(measuredAt);
  snapshot.raw_payload = {
    grpid: group?.grpid ?? rawPayload?.withings_measure_group_id ?? null,
    category: group?.category ?? null,
    deviceid: group?.deviceid ?? null,
  };

  if (rawPayload?.by_label && typeof rawPayload.by_label === 'object') {
    Object.entries(rawPayload.by_label).forEach(([label, value]) => {
      applyLabelValue(snapshot, label, value, warnings);
    });
  } else {
    const measures = Array.isArray(group?.measures) ? group.measures : [];
    measures.forEach((measure) => {
      const type = Number(measure?.type);
      const field = MEASURE_TYPE_TO_FIELD[type];
      const decoded = measurementValue(measure);
      if (!field || decoded == null) return;
      if (field === 'fat_percent') {
        snapshot.fat_percent = validateField('fat_percent', decoded, warnings);
      } else if (field === 'visceral_fat' && snapshot.visceral_fat == null) {
        snapshot.visceral_fat = validateField('visceral_fat', decoded, warnings);
      } else if (field in snapshot) {
        snapshot[field] = validateField(field, decoded, warnings);
      }
    });
  }

  if (snapshot.bmi == null && snapshot.weight_kg != null) {
    const computed = calculateBmiFromContext(snapshot.weight_kg, userContext);
    snapshot.bmi = validateField('bmi', computed, warnings);
  }

  if (warnings.length) {
    console.warn('[normalizeWithingsMeasures]', warnings.join(', '));
  }

  return snapshot;
}

export function normalizeWithingsMeasuresFromRows(rows, userContext = {}) {
  const byLabel = {};
  let measuredAt = null;
  let groupId = null;
  for (const row of rows || []) {
    if (!measuredAt) measuredAt = row.measured_at;
    if (!groupId) groupId = row.withings_measure_group_id;
    const label = row.measure_type_label;
    if (label) byLabel[label] = Number(row.value);
  }
  return normalizeWithingsMeasures({
    measured_at: measuredAt,
    withings_measure_group_id: groupId,
    by_label: byLabel,
  }, userContext);
}

export function stripRawPayload(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const { raw_payload: _raw, ...rest } = snapshot;
  return rest;
}

export { FIELD_RANGES, MEASURE_TYPE_TO_FIELD };
