import { runDailyAdherenceSyncBatch } from '../../../lib/dailyAdherenceSync';
import { sanitizeErrorMessage } from '../../../lib/safeLog';

export const config = { maxDuration: 120 };

function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET is not configured' };
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const result = await runDailyAdherenceSyncBatch();
    console.info('[cron/daily-adherence-sync] completed', result);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err?.message || String(err));
    console.error('[cron/daily-adherence-sync] error', safeMessage);
    return res.status(500).json({ error: safeMessage || 'Daily adherence sync failed' });
  }
}
