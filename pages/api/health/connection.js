import { getAuthUser } from '../../../lib/health/apiAuth';
import { getConnectionStatus } from '../../../lib/health/queries';
import { formatRelativeSyncCs } from '../../../lib/health/formatters';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authResult = await getAuthUser(req);
    if (authResult.error) return res.status(authResult.status).json({ error: authResult.error });

    const result = await getConnectionStatus(authResult.user.id);

    return res.status(200).json({
      ...result,
      meta: {
        last_sync_relative: formatRelativeSyncCs(result.active?.last_sync_at ?? null),
      },
    });
  } catch (err) {
    console.error('[health/connection] error');
    return res.status(500).json({ error: err?.message || 'Nepodařilo se načíst stav připojení.' });
  }
}
