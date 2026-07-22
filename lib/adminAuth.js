/**
 * Admin API auth — Bearer ADMIN_TOKEN only (never query/body token).
 * @param {import('next').NextApiRequest} req
 * @returns {boolean}
 */
export function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return Boolean(process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
}

/**
 * Vercel cron auth — Bearer CRON_SECRET.
 * @param {import('next').NextApiRequest} req
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
export function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET is not configured' };
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}
