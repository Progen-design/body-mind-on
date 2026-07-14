import { runAppleHealthDailyReviewBatch } from '../../../lib/appleHealthDailyReview';
import { sanitizeErrorMessage } from '../../../lib/safeLog';

export const config = { maxDuration: 300 };

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
    const result = await runAppleHealthDailyReviewBatch();
    console.info('[cron/apple-health-daily-review] completed', {
      users_total: result.users_total,
      coach_tasks_created: result.coach_tasks_created,
      trainer_triggers: result.trainer_triggers,
      coach_processed: result.coach_processed,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err?.message || String(err));
    console.error('[cron/apple-health-daily-review] error', safeMessage);
    return res.status(500).json({ error: safeMessage || 'Apple Health daily review failed' });
  }
}
