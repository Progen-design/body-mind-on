// /pages/api/withings/callback.js
import {
  consumeWithingsOAuthState,
  exchangeWithingsAuthorizationCode,
  saveWithingsConnection,
  syncWithingsForUser,
  toPublicAppUrl,
} from '../../../lib/withingsServer.js';
import { importLatestWithingsToProfile } from '../../../lib/withingsProfileImport.js';

function appendWithingsStatus(returnTo, status, extra = {}) {
  const url = new URL(toPublicAppUrl(returnTo));
  url.searchParams.set('withings', status);
  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const error = Array.isArray(req.query.error) ? req.query.error[0] : req.query.error;
  const errorDescription = Array.isArray(req.query.error_description)
    ? req.query.error_description[0]
    : req.query.error_description;
  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;

  try {
    if (error) {
      console.warn('[withings/callback] OAuth denied', { error, errorDescription });
      return res.redirect(302, appendWithingsStatus('/profil', 'denied'));
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Chybí code nebo state z Withings callbacku.' });
    }

    const oauthState = await consumeWithingsOAuthState(state);
    const tokenBody = await exchangeWithingsAuthorizationCode(code);
    await saveWithingsConnection(oauthState.user_id, tokenBody);

    let syncStatus = 'connected';
    try {
      await syncWithingsForUser(oauthState.user_id, { full: false });
      await importLatestWithingsToProfile(oauthState.user_id);
    } catch (syncErr) {
      console.error('[withings/callback] initial sync failed', syncErr);
      syncStatus = 'connected_sync_pending';
    }

    return res.redirect(302, appendWithingsStatus(oauthState.return_to || '/profil', syncStatus));
  } catch (err) {
    console.error('[withings/callback]', err);
    const status = err?.statusCode || 500;
    if (status >= 500) {
      return res.redirect(302, appendWithingsStatus('/profil', 'error'));
    }
    return res.status(status).json({ error: err?.message || 'Chyba při Withings callbacku.' });
  }
}
