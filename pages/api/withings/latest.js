// /pages/api/withings/latest.js
import {
  getAuthUserFromRequest,
  getLatestWithingsMeasurements,
} from '../../../lib/withingsServer.js';
import { supabaseServer } from '../../../lib/supabaseServer.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await getAuthUserFromRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ error: auth.error });

  try {
    const { data: connection, error: connError } = await supabaseServer
      .from('withings_connections')
      .select('withings_userid, connected_at, last_sync_at, last_sync_error, expires_at')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (connError) throw connError;
    if (!connection) {
      return res.status(200).json({
        ok: true,
        connected: false,
        connection: null,
        latest_by_type: {},
        latest_weight_kg: null,
        rows: [],
      });
    }

    const measurements = await getLatestWithingsMeasurements(auth.user.id, req.query.limit || 50);
    return res.status(200).json({
      ok: true,
      connected: true,
      connection,
      ...measurements,
    });
  } catch (err) {
    console.error('[withings/latest]', err);
    return res.status(err?.statusCode || 500).json({
      ok: false,
      error: err?.message || 'Nelze načíst poslední Withings měření.',
    });
  }
}
