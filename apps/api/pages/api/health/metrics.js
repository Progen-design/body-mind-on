import { getAuthUser } from '../../../lib/health/apiAuth';
import { clampDays } from '../../../lib/health/guards';
import { getAllMetrics } from '../../../lib/health/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authResult = await getAuthUser(req);
    if (authResult.error) return res.status(authResult.status).json({ error: authResult.error });

    const days = clampDays(req.query?.days, 30);
    const rows = await getAllMetrics(authResult.user.id, days);

    return res.status(200).json({ days, rows });
  } catch (err) {
    console.error('[health/metrics] error');
    return res.status(500).json({ error: err?.message || 'Nepodařilo se načíst metriky Apple Watch.' });
  }
}
