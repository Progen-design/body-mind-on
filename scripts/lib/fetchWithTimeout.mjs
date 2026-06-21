/**
 * Bezpečný fetch s AbortController pro verify/smoke skripty.
 * Každý HTTP request musí mít konečný timeout — žádné neomezené čekání.
 */

export const FETCH_TIMEOUT = {
  HEALTH: 10_000,
  GET: 15_000,
  POST: 30_000,
  BODY_METRICS: 90_000,
  SCHEDULER: 120_000,
  ADMIN: 60_000,
  /** Admin regenerate může trvat několik minut — stále konečný limit. */
  ADMIN_LONG: 300_000,
};

export class FetchTimeoutError extends Error {
  constructor(url, timeoutMs) {
    super(`Request timed out after ${timeoutMs} ms: ${url}`);
    this.name = 'FetchTimeoutError';
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export function formatFetchError(err, url) {
  if (err instanceof FetchTimeoutError) return err.message;
  if (err?.name === 'AbortError') return `Request timed out: ${url}`;
  const msg = err?.message || String(err);
  return msg.includes(url) ? msg : `${msg}: ${url}`;
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT.GET) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw err;
  }
}
