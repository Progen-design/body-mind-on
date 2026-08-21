// GET /api/cron/lifecycle-email — aktivační a trial e-maily
//
// Běží každou hodinu. Dva kroky:
//   evaluate → komu co dlužíme, zařadit do fronty
//   dispatch → co je ve frontě splatné, odeslat
//
// Rozdělení je záměrné: kdyby odesílání spadlo, fronta zůstane a příští
// běh to dožene. Nic se neztratí a nic se neposílá dvakrát.
import { verifyCronSecret } from '../../../lib/betaEmailCronAuth';
import {
  isLifecycleEmailEnabled,
  isSyntheticEmail,
  pickNextLifecycleEmail,
} from '../../../lib/lifecycleEmailRules';
import {
  listCandidateMemberships,
  getUserEmailHistory,
  queueLifecycleEmail,
  claimQueuedEmails,
  markSent,
  markFailed,
  markSkipped,
  getUserEmail,
} from '../../../lib/lifecycleEmailStore';
import { sendLifecycleEmail } from '../../../lib/sendLifecycleEmail';

async function runEvaluate() {
  const stats = { evaluated: 0, queued: 0, skipped: 0, errors: 0 };
  const memberships = await listCandidateMemberships();
  stats.evaluated = memberships.length;

  for (const m of memberships) {
    try {
      const { allKeys, lastSentAt } = await getUserEmailHistory(m.user_id);

      const action = pickNextLifecycleEmail(m, {
        now: new Date(),
        alreadySent: allKeys,
        lastSentAt,
      });

      if (!action) {
        stats.skipped += 1;
        continue;
      }

      // E-mail ověřujeme až tady — ne u každého členství, ať zbytečně
      // neděláme dotaz do auth pro lidi, kterým stejně nic neposíláme.
      const email = await getUserEmail(m.user_id);
      if (!email || isSyntheticEmail(email)) {
        stats.skipped += 1;
        continue;
      }

      const result = await queueLifecycleEmail(m.user_id, action.triggerKey, action.scheduledAt);
      if (result.queued) stats.queued += 1;
      else if (result.already_exists) stats.skipped += 1;
      else stats.errors += 1;
    } catch (err) {
      console.error('[cron/lifecycle-email] evaluate error:', err?.message);
      stats.errors += 1;
    }
  }

  return stats;
}

async function runDispatch() {
  const stats = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  const batch = await claimQueuedEmails();
  stats.claimed = batch.length;

  for (const msg of batch) {
    try {
      const email = await getUserEmail(msg.user_id);
      if (!email || isSyntheticEmail(email)) {
        await markSkipped(msg.id, 'synthetic_or_missing');
        stats.skipped += 1;
        continue;
      }

      const result = await sendLifecycleEmail(email, msg.trigger_key);
      if (result.ok) {
        await markSent(msg.id, result.message_id);
        stats.sent += 1;
      } else {
        await markFailed(msg.id, result.error_code, msg.attempt_count);
        stats.failed += 1;
      }
    } catch (err) {
      console.error('[cron/lifecycle-email] dispatch error:', err?.message);
      await markFailed(msg.id, 'dispatch_error', msg.attempt_count);
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

  if (!isLifecycleEmailEnabled()) {
    return res.status(200).json({ ok: true, disabled: true });
  }

  try {
    const evaluate = await runEvaluate();
    const dispatch = await runDispatch();
    console.info('[cron/lifecycle-email] done', { evaluate, dispatch });
    return res.status(200).json({ ok: true, evaluate, dispatch });
  } catch (err) {
    console.error('[cron/lifecycle-email] failed:', err?.message);
    return res.status(500).json({ error: 'Lifecycle email cron failed' });
  }
}
