/**
 * Optional smart-device interest at registration (scale | watch).
 * Connection / OAuth happens later in profile — never during signup.
 */

export const DEVICE_OPTIONS = Object.freeze([
  { value: 'scale', label: 'Chytrá váha' },
  { value: 'watch', label: 'Chytré hodinky' },
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

/**
 * MÁ SE „PŘIPOJIT ZAŘÍZENÍ“ VYTÁHNOUT NAHORU?
 *
 * Kdo si v registraci zaškrtl váhu nebo hodinky, chce je připojit hned — sekce
 * schovaná až dole pod plánem znamená, že o ni většina lidí zakopne až za pár
 * dní, nebo vůbec. Kdo nic nezaškrtl (nebo už má připojeno), tu sekci nahoře
 * jen překáží.
 *
 * Vytáhne se tedy jen při shodě obou podmínek: JE zájem a NENÍ připojeno.
 * Po připojení predikát spadne na false a sekce zhora sama zmizí.
 *
 * @param {object|null|undefined} profile
 * @param {{ active?: { status?: string } }|null|undefined} healthConnection
 * @returns {boolean}
 */
export function shouldPromoteDeviceConnect(profile, healthConnection) {
  if (!hasDeviceInterest(getProfileDevices(profile))) return false;
  if (profile?.has_withings_connection === true) return false;
  if (healthConnection?.active?.status === 'active') return false;
  return true;
}
