/**
 * Spoonacular HTTP — klasifikace chyb a retry (402/4xx permanent, 5xx/transient max 3).
 */

export class SpoonacularHttpError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, permanent?: boolean, code?: string }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'SpoonacularHttpError';
    this.status = opts.status ?? null;
    this.permanent = opts.permanent === true;
    this.code = opts.code ?? (opts.permanent ? 'SPOONACULAR_PERMANENT' : 'SPOONACULAR_TRANSIENT');
  }
}

/**
 * @param {number} status
 * @returns {boolean}
 */
export function isSpoonacularPermanentHttpStatus(status) {
  const s = Number(status);
  if (!Number.isFinite(s)) return false;
  if (s === 402) return true;
  if (s >= 400 && s < 500) return true;
  return false;
}

/**
 * @param {number} status
 * @returns {boolean}
 */
export function isSpoonacularTransientHttpStatus(status) {
  const s = Number(status);
  if (!Number.isFinite(s)) return false;
  if (s >= 500) return true;
  if (s === 408 || s === 429) return true;
  return false;
}

/**
 * @param {Response} res
 * @param {string} [bodyText]
 */
export function throwIfSpoonacularResponseNotOk(res, bodyText = '') {
  if (res.ok) return;
  const status = res.status;
  const snippet = String(bodyText || '').slice(0, 240);
  if (status === 402) {
    throw new SpoonacularHttpError(`Spoonacular kvóta vyčerpána (402). ${snippet}`.trim(), {
      status,
      permanent: true,
      code: 'SPOONACULAR_QUOTA_EXCEEDED',
    });
  }
  if (isSpoonacularPermanentHttpStatus(status)) {
    throw new SpoonacularHttpError(`Spoonacular HTTP ${status} (permanent). ${snippet}`.trim(), {
      status,
      permanent: true,
      code: 'SPOONACULAR_4XX',
    });
  }
  throw new SpoonacularHttpError(`Spoonacular HTTP ${status} (transient). ${snippet}`.trim(), {
    status,
    permanent: false,
    code: 'SPOONACULAR_TRANSIENT',
  });
}

/**
 * @param {() => Promise<Response>} fetchFn
 * @param {{ maxAttempts?: number, baseDelayMs?: number, onAttempt?: (n: number) => void }} [opts]
 * @returns {Promise<Response>}
 */
export async function fetchSpoonacularWithRetry(fetchFn, opts = {}) {
  const maxAttempts = Math.min(3, Math.max(1, opts.maxAttempts ?? 3));
  const baseDelayMs = opts.baseDelayMs ?? 500;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (typeof opts.onAttempt === 'function') opts.onAttempt(attempt);
    try {
      const res = await fetchFn();
      if (res.ok) return res;
      const bodyText = await res.text().catch(() => '');
      if (isSpoonacularPermanentHttpStatus(res.status)) {
        throwIfSpoonacularResponseNotOk(res, bodyText);
      }
      if (attempt >= maxAttempts || !isSpoonacularTransientHttpStatus(res.status)) {
        throwIfSpoonacularResponseNotOk(res, bodyText);
      }
      lastErr = new SpoonacularHttpError(`Spoonacular HTTP ${res.status}`, {
        status: res.status,
        permanent: false,
      });
    } catch (e) {
      if (e instanceof SpoonacularHttpError && e.permanent) throw e;
      lastErr = e;
      if (attempt >= maxAttempts) break;
    }
    const delay = baseDelayMs * 2 ** (attempt - 1);
    await new Promise((r) => setTimeout(r, delay));
  }

  if (lastErr instanceof SpoonacularHttpError) throw lastErr;
  throw new SpoonacularHttpError(lastErr?.message || 'Spoonacular fetch failed', { permanent: false });
}

/**
 * @param {Error|unknown} err
 * @returns {boolean}
 */
export function isPermanentSpoonacularOrTaskError(err) {
  if (!err) return false;
  if (err.permanent === true) return true;
  if (err instanceof SpoonacularHttpError && err.permanent) return true;
  const msg = String(err.message || err);
  return (
    /SPOONACULAR_(QUOTA|PERMANENT|4XX)/i.test(msg) ||
    /recipes_catalog.*(prázdn|empty|nedostate)/i.test(msg) ||
    /CATALOG_EMPTY/i.test(msg) ||
    /permanent_failure/i.test(msg)
  );
}
