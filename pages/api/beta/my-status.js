// GET /api/beta/my-status — beta participant banner info (authenticated)
import { supabaseServer } from '../../../lib/supabaseServer';
import { getActiveParticipant } from '../../../lib/betaParticipantMilestones';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Nejste přihlášen' });
  }

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user?.id) {
    return res.status(401).json({ error: 'Neplatná session' });
  }

  const participant = await getActiveParticipant(user.id);
  if (!participant?.cohort_code) {
    return res.status(200).json({ is_beta_participant: false });
  }

  return res.status(200).json({
    is_beta_participant: true,
    cohort_code: participant.cohort_code,
    cohort_name: participant.cohort_name || 'START Beta',
    cohort_status: participant.cohort_status || null,
    participant_status: participant.status,
  });
}
