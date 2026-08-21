// /pages/api/withings/history.js
import {
  getAuthUserFromRequest,
  getWithingsMeasurementHistory,
  isWithingsOAuthConfigured,
} from '../../../lib/withingsServer.js';
import { supabaseServer } from '../../../lib/supabaseServer.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await getAuthUserFromRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ error: auth.error });

  try {
    if (!isWithingsOAuthConfigured()) {
      return res.status(503).json({ ok: false, error: 'Withings integrace není aktivní.' });
    }

    const { data: connection, error: connError } = await supabaseServer
      .from('withings_connections')
      .select('id')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (connError) throw connError;
    if (!connection?.id) {
      return res.status(200).json({
        ok: true,
        connected: false,
        measurements: [],
      });
    }

    const history = await getWithingsMeasurementHistory(auth.user.id, {
      limit: req.query.limit,
      from: req.query.from,
      to: req.query.to,
    });

    return res.status(200).json({
      ok: true,
      connected: true,
      ...history,
    });
  } catch (err) {
    console.error('[withings/history]', err);
    return res.status(err?.statusCode || 500).json({
      ok: false,
      error: err?.message || 'Nelze načíst historii Withings měření.',
    });
  }
}
