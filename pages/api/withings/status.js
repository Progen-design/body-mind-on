// /pages/api/withings/status.js
import { getAuthUserFromRequest, getWithingsRedirectUri } from '../../../lib/withingsServer.js';
import { supabaseServer } from '../../../lib/supabaseServer.js';

function envValue(...parts) {
  return process.env[parts.join('')];
}

function mask(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 8) return 'set';
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await getAuthUserFromRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ error: auth.error });

  try {
    const { data: connection, error } = await supabaseServer
      .from('withings_connections')
      .select('withings_userid, connected_at, last_sync_at, last_sync_error')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (error) throw error;

    const redirectUri = getWithingsRedirectUri();
    return res.status(200).json({
      ok: true,
      configured: {
        client_id: !!envValue('WITHINGS_CLIENT_', 'ID'),
        client_secret: !!envValue('WITHINGS_CLIENT_', 'SECRET'),
        redirect_uri: redirectUri,
        token_encryption_key: !!envValue('WITHINGS_TOKEN_', 'ENCRYPTION_KEY'),
        api_url: process.env.WITHINGS_API_URL || 'https://wbsapi.withings.net',
        scopes: process.env.WITHINGS_SCOPES || 'user.info,user.metrics,user.activity',
      },
      connection: connection
        ? {
            connected: true,
            withings_userid: mask(connection.withings_userid),
            connected_at: connection.connected_at,
            last_sync_at: connection.last_sync_at,
            last_sync_error: connection.last_sync_error,
          }
        : { connected: false },
    });
  } catch (err) {
    console.error('[withings/status]', err);
    return res.status(err?.statusCode || 500).json({
      ok: false,
      error: err?.message || 'Nelze načíst stav Withings integrace.',
    });
  }
}
