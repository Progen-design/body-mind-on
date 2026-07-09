/**
 * Kdy zobrazit sekci „Tělesný vývoj“ / Withings v profilu.
 * Withings je volitelný modul — defaultně skrytý.
 */

function latestBodyMetrics(profile) {
  const rows = Array.isArray(profile?.body_metrics) ? profile.body_metrics : [];
  if (!rows.length) return null;
  return [...rows].sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0] || null;
}

export function getSmartScaleProvider(profile) {
  const fromUser = profile?.user?.smart_scale_provider;
  if (fromUser === 'withings' || fromUser === 'other') return fromUser;
  const meta = profile?.user_metadata || profile?.user?.user_metadata;
  if (meta?.smart_scale_provider === 'withings' || meta?.smart_scale_provider === 'other') {
    return meta.smart_scale_provider;
  }
  return null;
}

export function getWantsBodyTracking(profile) {
  if (profile?.user?.wants_body_tracking === true) return true;
  const meta = profile?.user_metadata || profile?.user?.user_metadata;
  return meta?.wants_body_tracking === true;
}

export function hasWithingsImportInMetrics(profile) {
  const latest = latestBodyMetrics(profile);
  const notes = String(latest?.notes || '');
  return notes.includes('[withings_import]');
}

/**
 * @param {object} profile — API /api/profile response nebo ekvivalent
 * @returns {boolean}
 */
export function shouldShowWithingsSection(profile) {
  if (profile?.has_withings_connection === true) return true;
  if (getWantsBodyTracking(profile)) return true;
  if (getSmartScaleProvider(profile) === 'withings') return true;
  if (hasWithingsImportInMetrics(profile)) return true;
  return false;
}
