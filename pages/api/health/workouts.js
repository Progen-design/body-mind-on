import { getAuthUser } from '../../../lib/health/apiAuth';
import { clampLimit } from '../../../lib/health/guards';
import { getWorkouts } from '../../../lib/health/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authResult = await getAuthUser(req);
    if (authResult.error) return res.status(authResult.status).json({ error: authResult.error });

    const limit = clampLimit(req.query?.limit, 20, 100);
    const rows = await getWorkouts(authResult.user.id, limit);

    return res.status(200).json({ limit, rows });
  } catch (err) {
    console.error('[health/workouts] error');
    return res.status(500).json({ error: err?.message || 'Nepodařilo se načíst tréninky.' });
  }
}
