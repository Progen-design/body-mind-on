/** PII guard for product event properties — recursive key denylist. */

const DENY_KEY_PARTS = [
  'email',
  'name',
  'first_name',
  'last_name',
  'phone',
  'password',
  'token',
  'address',
  'birth',
  'diagnosis',
  'allergy',
  'medical',
  'weight',
  'height',
  'notes',
  'message',
  'description',
];

const ALLOWED_PROPERTY_KEYS = new Set([
  'program',
  'tier',
  'onboarding_step',
  'step',
  'devices',
  'plan_type',
  'action_type',
  'day_number',
  'source_component',
  'success',
  'error_code',
  'feedback_score',
  'cohort_code',
  'muscle_group_count',
  'location',
  'duration_bucket',
  'intensity',
  'generation_attempt',
  'error_category',
  'auth_ms',
  'db_read_ms',
  'db_update_ms',
  'total_ms',
]);

const ALLOWED_DEVICE_VALUES = new Set(['scale', 'watch']);

function keyLooksLikePii(key) {
  const k = String(key || '').toLowerCase();
  return DENY_KEY_PARTS.some((part) => k.includes(part));
}

/**
 * @param {unknown} value
 * @param {string} [path]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateEventProperties(value, path = 'properties') {
  if (value == null) return { ok: true };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'properties_must_be_object' };
  }

  for (const [key, val] of Object.entries(value)) {
    const fullPath = `${path}.${key}`;
    if (keyLooksLikePii(key)) {
      return { ok: false, reason: 'event_properties_rejected' };
    }
    if (!ALLOWED_PROPERTY_KEYS.has(key)) {
      return { ok: false, reason: 'event_properties_rejected' };
    }

    if (key === 'devices') {
      if (!Array.isArray(val)) {
        return { ok: false, reason: 'event_properties_rejected' };
      }
      for (const item of val) {
        if (typeof item !== 'string' || item.length > 40 || !ALLOWED_DEVICE_VALUES.has(item)) {
          return { ok: false, reason: 'event_properties_rejected' };
        }
      }
      continue;
    }

    if (key === 'step' || key === 'onboarding_step') {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return { ok: false, reason: 'event_properties_rejected' };
      }
      continue;
    }

    if (val != null && typeof val === 'object') {
      const nested = validateEventProperties(val, fullPath);
      if (!nested.ok) return nested;
    }
    if (typeof val === 'string' && val.length > 200) {
      return { ok: false, reason: 'event_properties_rejected' };
    }
  }
  return { ok: true };
}

export function jsonByteLength(obj) {
  try {
    return Buffer.byteLength(JSON.stringify(obj ?? {}), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
