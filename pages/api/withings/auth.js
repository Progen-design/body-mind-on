// /pages/api/withings/auth.js
import {
  buildWithingsAuthorizeUrl,
  createWithingsOAuthState,
  getAuthUserFromRequest,
  getWithingsRedirectUri,
  sanitizeWithingsReturnTo,
} from '../../../lib/withingsServer.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await getAuthUserFromRequest(req);
    if (auth.error) {
      if (req.method === 'GET') {
        return res.redirect(302, `/login?withings=login_required&next=${encodeURIComponent('/withings-connect')}`);
      }
      return res.status(auth.status || 401).json({ error: auth.error });
    }

    const returnTo = sanitizeWithingsReturnTo(req.query.return_to || '/profil');
    const state = await createWithingsOAuthState(auth.user.id, returnTo);
    const mode = req.query.demo === '1' ? 'demo' : undefined;
    const url = buildWithingsAuthorizeUrl(state, { mode });

    if (req.method === 'POST' || req.query.format === 'json') {
      return res.status(200).json({
        ok: true,
        url,
        redirect_uri: getWithingsRedirectUri(),
        return_to: returnTo,
      });
    }

    return res.redirect(302, url);
  } catch (err) {
    console.error('[withings/auth]', err);
    const status = err?.statusCode || 500;
    return res.status(status).json({ error: err?.message || 'Chyba při startu Withings OAuth.' });
  }
}
