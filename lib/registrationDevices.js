/**
 * Optional smart-device interest at registration (scale | watch).
 * Connection / OAuth happens later in profile — never during signup.
 */

export const DEVICE_OPTIONS = Object.freeze([
  { value: 'scale', label: 'Chytrá váha (Withings)' },
  { value: 'watch', label: 'Chytré hodinky (Apple Watch)' },
]);

const ALLOWED = new Set(['scale', 'watch']);

/**
 * @param {unknown} raw
 * @returns {string[]|null} sorted unique allowed values, or null if empty/unspecified
 */
export function normalizeDevices(raw) {
  if (raw == null) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const item of list) {
    const v = String(item || '').trim().toLowerCase();
    if (!ALLOWED.has(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  if (!out.length) return null;
  out.sort();
  return out;
}

/**
 * @param {string[]|null|undefined} devices
 * @returns {boolean}
 */
export function hasDeviceInterest(devices) {
  const list = normalizeDevices(devices);
  return Array.isArray(list) && list.length > 0;
}

/**
 * @param {string[]|null|undefined} devices
 * @param {'scale'|'watch'} kind
 */
export function wantsDevice(devices, kind) {
  const list = normalizeDevices(devices);
  return Array.isArray(list) && list.includes(kind);
}

/**
 * Derive legacy smart-scale metadata from devices interest.
 * @param {string[]|null|undefined} devices
 */
export function devicesToSmartScaleMetadata(devices) {
  if (wantsDevice(devices, 'scale')) {
    return { wants_body_tracking: true, smart_scale_provider: 'withings' };
  }
  return { wants_body_tracking: false, smart_scale_provider: null };
}

/**
 * Latest body_metrics.devices from profile payload.
 * @param {object} profile
 * @returns {string[]|null}
 */
export function getProfileDevices(profile) {
  const rows = Array.isArray(profile?.body_metrics) ? profile.body_metrics : [];
  for (const row of [...rows].sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))) {
    const devices = normalizeDevices(row?.devices);
    if (devices) return devices;
  }
  return null;
}
