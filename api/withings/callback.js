// /api/withings/callback.js
import {
  consumeWithingsOAuthState,
  exchangeWithingsAuthorizationCode,
  saveWithingsConnection,
  syncWithingsForUser,
  toPublicAppUrl,
} from '../../lib/withingsServer.js';
import { importLatestWithingsToProfile } from '../../lib/withingsProfileImport.js';
import { zaznamenejWithingsCallback } from '../../lib/withingsCallbackLog.js';

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

  // KTERÝ KROK PRÁVĚ BĚŽÍ. 13. 8. 2026 skončil callback dvakrát na 302 a
  // `withings_connections` zůstala prázdná. Oba state řádky byly spotřebované,
  // takže se vědělo, že pád nastal někde za ověřením state — ale ne kde.
  // Z produkčních runtime logů se nepodařilo vytáhnout jediný řádek z
  // `console.*`, takže diagnostika nesmí stát na stdout funkce. Tahle proměnná
  // se ukládá do `withings_callback_events` a rovnou pojmenuje krok.
  let stage = 'consume_state';
  let userId = null;

  try {
    if (error) {
      console.warn('[withings/callback] OAuth denied', { error, errorDescription });
      await zaznamenejWithingsCallback({
        status: 'denied',
        stage: 'oauth_denied',
        errorMessage: [error, errorDescription].filter(Boolean).join(': ') || null,
      });
      return res.redirect(302, appendWithingsStatus('/profil', 'denied'));
    }

    if (!code || !state) {
      await zaznamenejWithingsCallback({
        status: 'bad_request',
        stage: 'missing_code_or_state',
        errorMessage: `code=${code ? 'ano' : 'ne'} state=${state ? 'ano' : 'ne'}`,
      });
      return res.status(400).json({ error: 'Chybí code nebo state z Withings callbacku.' });
    }

    const oauthState = await consumeWithingsOAuthState(state);
    userId = oauthState?.user_id || null;

    stage = 'token_exchange';
    const tokenBody = await exchangeWithingsAuthorizationCode(code);

    stage = 'save_connection';
    await saveWithingsConnection(oauthState.user_id, tokenBody);

    stage = 'initial_sync';
    let syncStatus = 'connected';
    try {
      await syncWithingsForUser(oauthState.user_id, { full: false });
      await importLatestWithingsToProfile(oauthState.user_id);
    } catch (syncErr) {
      console.error('[withings/callback] initial sync failed', syncErr);
      syncStatus = 'connected_sync_pending';
      await zaznamenejWithingsCallback({
        userId,
        status: 'connected_sync_pending',
        stage: 'initial_sync',
        errorMessage: syncErr?.message || String(syncErr),
      });
    }

    if (syncStatus === 'connected') {
      await zaznamenejWithingsCallback({ userId, status: 'connected', stage: 'done' });
    }

    return res.redirect(302, appendWithingsStatus(oauthState.return_to || '/profil', syncStatus));
  } catch (err) {
    console.error('[withings/callback]', err);
    const status = err?.statusCode || 500;

    await zaznamenejWithingsCallback({
      userId,
      status: status >= 500 ? 'error' : 'bad_request',
      stage,
      errorMessage: err?.message || String(err),
    });

    if (status >= 500) {
      return res.redirect(302, appendWithingsStatus('/profil', 'error'));
    }
    return res.status(status).json({ error: err?.message || 'Chyba při Withings callbacku.' });
  }
}
