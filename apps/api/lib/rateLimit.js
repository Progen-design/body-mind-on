import { createHash } from 'crypto';
import { writeAILog } from './aiOps';

const store = new Map();

const MAX_KEYS = 10_000;

export const RATE_LIMIT_MESSAGE_CS =
  'Příliš mnoho pokusů o registraci. Zkus to prosím za chvíli znovu.';

function cleanupExpired(now) {
  if (store.size < MAX_KEYS) return;
  for (const [k, v] of store.entries()) {
    if (!v || now > v.resetAt) store.delete(k);
    if (store.size < MAX_KEYS) break;
  }
}

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0].trim();
  }
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * SHA-256 prefix — bez raw e-mailu v logu / rate-limit klíčích pro audit.
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
export function hashNormalizedEmailForRateLimit(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return null;
  return createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

export function isRateLimited(key, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  cleanupExpired(now);
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (entry.count >= limit) {
    return true;
  }

  entry.count += 1;
  store.set(key, entry);
  return false;
}

/**
 * In-memory rate limit (Vercel serverless — per-instance; bez DB migrace).
 * Klíče: IP + volitelný hash e-mailu.
 * @param {string[]} keys
 * @param {number} limit
 * @param {number} windowMs
 */
export function isAnyRateLimited(keys, limit = 10, windowMs = 60_000) {
  const list = (keys || []).filter(Boolean);
  return list.some((key) => isRateLimited(key, limit, windowMs));
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {{ scope: string, email?: string|null, limit?: number, windowMs?: number }} opts
 * @returns {Promise<{ limited: boolean, message?: string, retryAfterSec?: number }>}
 */
export async function enforcePublicEndpointRateLimit(req, opts = {}) {
  const scope = String(opts.scope || 'public').trim();
  const limit = opts.limit ?? 8;
  const windowMs = opts.windowMs ?? 15 * 60 * 1000;
  const ip = getClientIp(req);
  const emailHash = hashNormalizedEmailForRateLimit(opts.email);
  const keys = [`${scope}:ip:${ip}`];
  if (emailHash) keys.push(`${scope}:email:${emailHash}`);

  if (!isAnyRateLimited(keys, limit, windowMs)) {
    return { limited: false };
  }

  const retryAfterSec = Math.ceil(windowMs / 1000);
  try {
    await writeAILog({
      action: 'rate_limit_exceeded',
      agent_slug: 'system',
      result: {
        scope,
        ip_prefix: String(ip).slice(0, 12),
        has_email_hash: !!emailHash,
      },
    });
  } catch {
    // non-blocking
  }

  return {
    limited: true,
    message: RATE_LIMIT_MESSAGE_CS,
    retryAfterSec,
  };
}
