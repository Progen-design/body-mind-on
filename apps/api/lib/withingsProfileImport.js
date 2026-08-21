// /lib/withingsProfileImport.js
import { supabaseServer } from './supabaseServer.js';

function roundNumber(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(n * factor) / factor;
}

function calculateBmi(weightKg, heightCm) {
  const weight = Number(weightKg);
  const height = Number(heightCm);
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null;
  const meters = height / 100;
  return roundNumber(weight / (meters * meters), 1);
}

function parseNotes(raw) {
  if (!raw || typeof raw !== 'string') return { base: '', meta: {} };
  const marker = '\n\n[withings_import] ';
  const idx = raw.indexOf(marker);
  if (idx === -1) return { base: raw, meta: {} };
  const base = raw.slice(0, idx).trim();
  const jsonText = raw.slice(idx + marker.length).trim();
  try {
    return { base, meta: JSON.parse(jsonText) || {} };
  } catch (_) {
    return { base, meta: {} };
  }
}

function buildNotes(existingNotes, meta) {
  const { base } = parseNotes(existingNotes);
  const suffix = `[withings_import] ${JSON.stringify(meta)}`;
  return base ? `${base}\n\n${suffix}` : suffix;
}

export async function importLatestWithingsToProfile(userId) {
  if (!userId) throw new Error('Chybí userId pro import Withings dat do profilu.');

  const { data: latestWeight, error: weightError } = await supabaseServer
    .from('withings_measurements')
    .select('value, measured_at, withings_measure_group_id')
    .eq('user_id', userId)
    .eq('measure_type_label', 'weight_kg')
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (weightError) throw weightError;
  if (!latestWeight?.value) {
    return {
      imported: false,
      reason: 'no_weight_measurement',
    };
  }

  const weightKg = roundNumber(latestWeight.value, 1);
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) {
    return {
      imported: false,
      reason: 'weight_out_of_range',
      weight_kg: weightKg,
    };
  }

  const { data: latestProfileMetric, error: metricError } = await supabaseServer
    .from('body_metrics')
    .select('id, height_cm, notes')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metricError) throw metricError;
  if (!latestProfileMetric?.id) {
    return {
      imported: false,
      reason: 'missing_body_metrics_row',
      weight_kg: weightKg,
    };
  }

  const bmi = calculateBmi(weightKg, latestProfileMetric.height_cm);
  const importMeta = {
    source: 'withings',
    imported_at: new Date().toISOString(),
    measured_at: latestWeight.measured_at,
    group_id: latestWeight.withings_measure_group_id,
    weight_kg: weightKg,
  };

  const update = {
    weight_kg: weightKg,
    notes: buildNotes(latestProfileMetric.notes, importMeta),
  };
  if (bmi != null) update.bmi = bmi;

  const { error: updateError } = await supabaseServer
    .from('body_metrics')
    .update(update)
    .eq('id', latestProfileMetric.id);

  if (updateError) throw updateError;

  const { data: authUser } = await supabaseServer.auth.admin.getUserById(userId);
  const currentMeta = authUser?.user?.user_metadata || {};
  await supabaseServer.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMeta,
      weight_kg: weightKg,
      withings_last_weight_kg: weightKg,
      withings_last_weight_at: latestWeight.measured_at,
    },
  }).catch((err) => {
    console.warn('[withingsProfileImport] user metadata update skipped', err?.message || err);
  });

  return {
    imported: true,
    body_metric_id: latestProfileMetric.id,
    weight_kg: weightKg,
    bmi,
    measured_at: latestWeight.measured_at,
  };
}
