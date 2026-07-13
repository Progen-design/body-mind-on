// POST /api/internal/beta-email/dispatch — send queued beta lifecycle emails
import { verifyCronSecret } from '../../../../lib/betaEmailCronAuth';
import {
  isBetaEmailAutomationEnabled,
  claimQueuedEmails,
  markEmailSent,
  markEmailFailed,
  getUserEmailById,
  isSyntheticBetaEmailUser,
} from '../../../../lib/betaEmailAutomation';
import { supabaseServer } from '../../../../lib/supabaseServer';
import { sendBetaLifecycleEmail } from '../../../../lib/sendBetaLifecycleEmail';
import { BETA_EMAIL_DISPATCH_BATCH } from '../../../../lib/betaEmailAutomationConstants';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = verifyCronSecret(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (!isBetaEmailAutomationEnabled()) {
    return res.status(200).json({
      disabled: true,
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
  }

  const limit = Math.min(Number(req.body?.limit) || BETA_EMAIL_DISPATCH_BATCH, 50);
  const stats = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  try {
    const batch = await claimQueuedEmails(limit);
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

    return res.status(200).json(stats);
  } catch {
    console.error('[beta-email/dispatch] failed');
    return res.status(500).json({ error: 'Dispatch failed', ...stats });
  }
}
