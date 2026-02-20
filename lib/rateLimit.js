const store = new Map();

const MAX_KEYS = 10_000;

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
