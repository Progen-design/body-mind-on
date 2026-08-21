// /pages/api/withings/disconnect.js
import {
  disconnectWithingsForUser,
  getAuthUserFromRequest,
  isWithingsOAuthConfigured,
} from '../../../lib/withingsServer.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await getAuthUserFromRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ error: auth.error });

  try {
    if (!isWithingsOAuthConfigured()) {
      return res.status(503).json({ ok: false, error: 'Withings integrace není aktivní.' });
    }

    const result = await disconnectWithingsForUser(auth.user.id);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[withings/disconnect]', err);
    return res.status(err?.statusCode || 500).json({
      ok: false,
      error: err?.message || 'Nelze odpojit Withings účet.',
    });
  }
}
