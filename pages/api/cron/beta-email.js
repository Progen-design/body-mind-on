// GET /api/cron/beta-email — hourly beta lifecycle email automation
import { verifyCronSecret } from '../../../lib/betaEmailCronAuth';
import {
  isBetaEmailAutomationEnabled,
  listEmailParticipants,
  evaluateBetaEmailActions,
  pickNextBetaEmailAction,
  queueBetaEmail,
  getPlanGenerationCompletedAt,
  getParticipantMessages,
  isSyntheticBetaEmailUser,
  getUserEmailById,
  claimQueuedEmails,
  markEmailSent,
  markEmailFailed,
} from '../../../lib/betaEmailAutomation';
import { sendBetaLifecycleEmail } from '../../../lib/sendBetaLifecycleEmail';
import { supabaseServer } from '../../../lib/supabaseServer';
import { BETA_EMAIL_DISPATCH_BATCH } from '../../../lib/betaEmailAutomationConstants';

async function runEvaluate() {
  const stats = { evaluated: 0, queued: 0, skipped: 0, errors: 0 };
  const participants = await listEmailParticipants();
  stats.evaluated = participants.length;

  for (const p of participants) {
    try {
      const authUser = await getUserEmailById(p.user_id);
      if (isSyntheticBetaEmailUser(authUser)) {
        stats.skipped += 1;
        continue;
      }

      const [planAt, messages] = await Promise.all([
        getPlanGenerationCompletedAt(p.user_id),
        getParticipantMessages(p.id),
      ]);

      const action = pickNextBetaEmailAction(p, { planGenerationCompletedAt: planAt, messages });
      if (!action) {
        stats.skipped += 1;
        continue;
      }

      const existing = messages.find((m) => m.trigger_key === action.triggerKey);
      if (existing) {
        stats.skipped += 1;
        continue;
      }

      const result = await queueBetaEmail(p.id, p.user_id, action.triggerKey, action.scheduledAt);
      if (result?.queued) stats.queued += 1;
      else if (result?.already_exists) stats.skipped += 1;
      else stats.errors += 1;
    } catch {
      stats.errors += 1;
    }
  }
  return stats;
}

async function runDispatch() {
  const stats = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  const batch = await claimQueuedEmails(BETA_EMAIL_DISPATCH_BATCH);
  stats.claimed = batch.length;

  for (const msg of batch) {
    try {
      const authUser = await getUserEmailById(msg.user_id);
      if (!authUser?.email || isSyntheticBetaEmailUser(authUser)) {
        await supabaseServer.rpc('mark_beta_email_skipped', {
          p_message_id: msg.id,
          p_error_code: 'synthetic_skipped',
        });
        stats.skipped += 1;
        continue;
      }

      const result = await sendBetaLifecycleEmail(authUser.email, msg.trigger_key);
      if (result.ok) {
        await markEmailSent(msg.id, result.message_id || null);
        stats.sent += 1;
      } else {
        await markEmailFailed(msg.id, result.error_code || 'send_failed', msg.attempt_count);
        stats.failed += 1;
      }
    } catch {
      await markEmailFailed(msg.id, 'dispatch_error', msg.attempt_count);
      stats.failed += 1;
    }
  }
  return stats;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = verifyCronSecret(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (!isBetaEmailAutomationEnabled()) {
    return res.status(200).json({
      ok: true,
      disabled: true,
      evaluate: { evaluated: 0, queued: 0, skipped: 0, errors: 0 },
      dispatch: { claimed: 0, sent: 0, failed: 0, skipped: 0 },
    });
  }

  try {
    const evaluate = await runEvaluate();
    const dispatch = await runDispatch();
    return res.status(200).json({ ok: true, evaluate, dispatch });
  } catch {
    console.error('[cron/beta-email] failed');
    return res.status(500).json({ error: 'Beta email cron failed' });
  }
}
