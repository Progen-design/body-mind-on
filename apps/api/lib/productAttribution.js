/** First-touch UTM attribution — no referrer, no ad click IDs. */

const UTM_KEY = 'bmo_first_touch_utm';
const UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @returns {{ utm_source: string|null, utm_medium: string|null, utm_campaign: string|null }}
 */
export function readAttributionFromStorage() {
  if (typeof window === 'undefined') {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
  try {
    const raw = localStorage.getItem(UTM_KEY);
    if (!raw) return { utm_source: null, utm_medium: null, utm_campaign: null };
    const parsed = JSON.parse(raw);
    if (!parsed?.saved_at || Date.now() - parsed.saved_at > UTM_TTL_MS) {
      return { utm_source: null, utm_medium: null, utm_campaign: null };
    }
    return {
      utm_source: parsed.utm_source ? String(parsed.utm_source).slice(0, 150) : null,
      utm_medium: parsed.utm_medium ? String(parsed.utm_medium).slice(0, 150) : null,
      utm_campaign: parsed.utm_campaign ? String(parsed.utm_campaign).slice(0, 150) : null,
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

export function getSafeAttribution() {
  return readAttributionFromStorage();
}
