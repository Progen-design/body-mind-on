// /pages/api/withings/sync.js
import {
  getAuthUserFromRequest,
  markWithingsSyncError,
  syncWithingsForUser,
} from '../../../lib/withingsServer.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await getAuthUserFromRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ error: auth.error });

  try {
    const full = req.query.full === '1' || req.body?.full === true;
    const startdate = req.query.startdate || req.body?.startdate || null;
    const result = await syncWithingsForUser(auth.user.id, { full, startdate });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[withings/sync]', err);
    await markWithingsSyncError(auth.user.id, err).catch(() => {});
    return res.status(err?.statusCode || 500).json({
      ok: false,
      error: err?.message || 'Withings sync selhal.',
    });
  }
}
