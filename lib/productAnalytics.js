/**
 * Client-side product analytics — fails silently, no PII, no cookies.
 */
import { getSafeAttribution, readAttributionFromStorage } from './productAttribution';

const ANON_KEY = 'bmo_anonymous_id';
const UTM_KEY = 'bmo_first_touch_utm';
const UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TRACK_TIMEOUT_MS = 3000;

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `a_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function getAnonymousId() {
  if (typeof window === 'undefined') return null;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function getSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    let id = sessionStorage.getItem('bmo_session_id');
    if (!id) {
      id = randomId();
      sessionStorage.setItem('bmo_session_id', id);
    }
    return id;
  } catch {
    return null;
  }
}

function captureFirstTouchUtm() {
  if (typeof window === 'undefined') return;
  try {
    const existing = localStorage.getItem(UTM_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed?.saved_at && Date.now() - parsed.saved_at < UTM_TTL_MS) return;
    }
    const params = new URLSearchParams(window.location.search);
    const utm = {
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
      saved_at: Date.now(),
    };
    if (utm.utm_source || utm.utm_medium || utm.utm_campaign) {
      localStorage.setItem(UTM_KEY, JSON.stringify(utm));
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  captureFirstTouchUtm();
}

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [properties]
 * @param {{ pagePath?: string, source?: string }} [options]
 * @returns {Promise<{ success: boolean }>}
 */
export async function trackProductEvent(eventName, properties = {}, options = {}) {
  try {
    const attribution = readAttributionFromStorage();
    const body = {
      event_name: eventName,
      event_version: 1,
      properties: properties || {},
      page_path: options.pagePath || (typeof window !== 'undefined' ? window.location.pathname : null),
      source: options.source || null,
      anonymous_id: getAnonymousId(),
      session_id: getSessionId(),
      ...attribution,
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TRACK_TIMEOUT_MS);

    const headers = { 'Content-Type': 'application/json' };
    try {
      const { supabase } = await import('./supabaseClient');
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      /* anonymous */
    }

    const res = await fetch('/api/events', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return { success: res.ok };
  } catch {
    return { success: false };
  }
}

export { getSafeAttribution };
