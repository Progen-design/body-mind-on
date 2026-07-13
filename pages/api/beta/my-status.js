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

  const { data: cohort } = await supabaseServer
    .from('beta_cohorts')
    .select('name, status')
    .eq('id', participant.cohort_id)
    .maybeSingle();

  return res.status(200).json({
    is_beta_participant: true,
    cohort_code: participant.cohort_code,
    cohort_name: cohort?.name || 'START Beta',
    cohort_status: cohort?.status || null,
    participant_status: participant.status,
  });
}
