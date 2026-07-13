/**
 * Exercise identity integrity — canonical_key is source of truth, not free-text names.
 */
import { getCanonicalExercise, resolveToCanonicalKey } from './exerciseCanonicalMap.js';

export const EXERCISE_MEDIA_PLACEHOLDER_CS = 'Ukázka cviku zatím není k dispozici.';

/** Canonical keys that represent squat / dřep movement patterns. */
export const SQUAT_MOVEMENT_CANONICAL_KEYS = new Set(['squat', 'goblet_squat']);

/** Press / push patterns that must never be labeled as Dřepy. */
export const NON_SQUAT_PRESS_CANONICAL_KEYS = new Set([
  'chest_press',
  'bench_press',
  'leg_press',
  'overhead_press',
  'lateral_raise',
  'tricep_extension',
  'bicep_curl',
  'lat_pulldown',
  'bent_over_row',
  'pull_up',
  'hamstring_curl',
  'hip_thrust',
]);

function normalizeLabel(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalDisplayLabel(canonicalKey) {
  const key = String(canonicalKey || '').trim().toLowerCase();
  if (!key) return null;
  return getCanonicalExercise(key)?.display_name_cs || null;
}

export function isSquatMovementCanonical(canonicalKey) {
  return SQUAT_MOVEMENT_CANONICAL_KEYS.has(String(canonicalKey || '').toLowerCase());
}

export function displayNameImpliesSquat(displayName) {
  const n = normalizeLabel(displayName);
  if (!n) return false;
  if (n.includes('goblet')) return true;
  return n.includes('drep') || n.includes('squat');
}

/**
 * Resolve canonical key from label — must not map presses to squat.
 */
export function resolveCanonicalKeyStrict(label) {
  const key = resolveToCanonicalKey(label);
  if (!key) return null;
  const n = normalizeLabel(label);
  if (displayNameImpliesSquat(n) && !isSquatMovementCanonical(key)) return null;
  if (NON_SQUAT_PRESS_CANONICAL_KEYS.has(key) && displayNameImpliesSquat(n)) return null;
  return key;
}

/**
 * @param {object} ex
 * @returns {{ ok: boolean, reason?: string, expected?: string, actual?: string }}
 */
export function exerciseDisplayNameMatchesCanonical(ex) {
  const key = String(ex?.canonical_key || '').trim().toLowerCase();
  if (!key || key === 'rest' || key === 'warmup' || key === 'cooldown') {
    return { ok: true };
  }

  const display = String(ex?.display_name_cs || ex?.name_cs || ex?.name || '').trim();
  const expected = canonicalDisplayLabel(key);

  if (displayNameImpliesSquat(display) && !isSquatMovementCanonical(key)) {
    return {
      ok: false,
      reason: 'squat_label_on_non_squat',
      expected: expected || key,
      actual: display,
    };
  }

  if (isSquatMovementCanonical(key) && expected && normalizeLabel(display) !== normalizeLabel(expected)) {
    const alt = normalizeLabel(display);
    const exp = normalizeLabel(expected);
    if (!alt.includes('drep') && !alt.includes('squat') && !alt.includes('goblet')) {
      return { ok: false, reason: 'non_squat_label_on_squat', expected, actual: display };
    }
    if (exp && alt !== exp && !alt.includes(exp.split(' ')[0])) {
      /* allow minor variant suffix e.g. "Goblet dřep" */
    }
  }

  return { ok: true };
}

/**
 * Prefer canonical Czech label over mismatched wger/AI text.
 * @param {object} ex
 * @returns {object}
 */
export function normalizeExerciseDisplayFromCanonical(ex) {
  if (!ex || typeof ex !== 'object') return ex;
  const key = String(ex.canonical_key || '').trim().toLowerCase();
  const def = key ? getCanonicalExercise(key) : null;
  const label = def?.display_name_cs;
  if (!label) return { ...ex };

  const out = { ...ex };
  const match = exerciseDisplayNameMatchesCanonical(out);
  if (!match.ok || !String(out.display_name_cs || '').trim()) {
    out.display_name_cs = label;
    out.name_cs = label;
    if (!out.name || displayNameImpliesSquat(out.name) !== isSquatMovementCanonical(key)) {
      out.name = label;
    }
  }
  return out;
}

/**
 * @param {object[]} exercises
 * @returns {{ valid: boolean, issues: object[] }}
 */
export function validateWorkoutExerciseIntegrity(exercises) {
  const issues = [];
  const list = Array.isArray(exercises) ? exercises : [];
  const seenKeys = new Set();
  const wgerByKey = new Map();

  for (let i = 0; i < list.length; i++) {
    const ex = list[i];
    const key = String(ex?.canonical_key || '').trim().toLowerCase();
    if (!key || key === 'rest') continue;

    if (!key) {
      issues.push({ index: i, code: 'missing_canonical_key' });
      continue;
    }

    const nameMatch = exerciseDisplayNameMatchesCanonical(ex);
    if (!nameMatch.ok) {
      issues.push({
        index: i,
        code: nameMatch.reason,
        canonical_key: key,
        expected: nameMatch.expected,
        actual: nameMatch.actual,
      });
    }

    if (seenKeys.has(key)) {
      issues.push({ index: i, code: 'duplicate_canonical_key', canonical_key: key });
    }
    seenKeys.add(key);

    const wgerId = ex?.wger_exercise_id != null ? Number(ex.wger_exercise_id) : null;
    if (Number.isFinite(wgerId) && wgerId > 0) {
      const prev = wgerByKey.get(wgerId);
      if (prev && prev !== key) {
        issues.push({
          index: i,
          code: 'wger_id_collision',
          canonical_key: key,
          other_key: prev,
          wger_exercise_id: wgerId,
        });
      } else {
        wgerByKey.set(wgerId, key);
      }
    }
  }

  const drepyCount = list.filter((ex) => displayNameImpliesSquat(
    ex?.display_name_cs || ex?.name_cs || ex?.name
  )).length;
  const squatKeys = list.filter((ex) => isSquatMovementCanonical(ex?.canonical_key)).length;
  if (drepyCount >= 2 && squatKeys < drepyCount) {
    issues.push({ code: 'duplicate_wrong_drepy_labels', drepy_count: drepyCount, squat_keys: squatKeys });
  }

  return { valid: issues.length === 0, issues };
}

/**
 * @param {string} canonicalKey
 * @returns {boolean}
 */
export function isNonSquatMislabeledAsSquat(canonicalKey, label) {
  const key = String(canonicalKey || '').toLowerCase();
  if (!NON_SQUAT_PRESS_CANONICAL_KEYS.has(key)) return false;
  return displayNameImpliesSquat(label);
}
