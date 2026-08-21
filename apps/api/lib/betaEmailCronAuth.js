/** Shared CRON_SECRET auth for internal beta email endpoints. */

/**
 * @param {import('http').IncomingMessage} req
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
export function verifyCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: 'CRON_SECRET is not configured' };
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}
