// POST /api/internal/beta-email/evaluate — queue beta lifecycle emails (cron/internal)
import { verifyCronSecret } from '../../../../lib/betaEmailCronAuth';
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
} from '../../../../lib/betaEmailAutomation';

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
      evaluated: 0,
      queued: 0,
      skipped: 0,
      errors: 0,
    });
  }

  const stats = { evaluated: 0, queued: 0, skipped: 0, errors: 0 };

  try {
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

        const action = pickNextBetaEmailAction(p, {
          planGenerationCompletedAt: planAt,
          messages,
        });

        if (!action) {
          stats.skipped += 1;
          continue;
        }

        const existing = messages.find((m) => m.trigger_key === action.triggerKey);
        if (existing) {
          stats.skipped += 1;
          continue;
        }

        const result = await queueBetaEmail(
          p.id,
          p.user_id,
          action.triggerKey,
          action.scheduledAt,
        );
        if (result?.queued) stats.queued += 1;
        else if (result?.already_exists) stats.skipped += 1;
        else stats.errors += 1;
      } catch {
        stats.errors += 1;
      }
    }

    return res.status(200).json(stats);
  } catch {
    console.error('[beta-email/evaluate] failed');
    return res.status(500).json({ error: 'Evaluation failed', ...stats });
  }
}
