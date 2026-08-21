// POST /api/health/connections/rotate
// - with connection_id: rotate key (revoke old, create new)
// - without connection_id: create first Apple Health connection
import { getAuthUser } from '../../../../lib/health/apiAuth';
import { isUuid } from '../../../../lib/health/guards';
import {
  appleHealthApiKeyPrefix,
  generateAppleHealthApiKey,
  sha256HexAppleHealthKey,
} from '../../../../lib/appleHealthKey';
import { supabaseServer } from '../../../../lib/supabaseServer';

async function createConnection(userId, deviceLabel = 'iPhone') {
  const now = new Date().toISOString();
  const apiKey = generateAppleHealthApiKey();
  const apiKeyHash = sha256HexAppleHealthKey(apiKey);
  const apiKeyPrefix = appleHealthApiKeyPrefix(apiKey);

  const { data: created, error: insertErr } = await supabaseServer
    .from('apple_health_connections')
    .insert({
      user_id: userId,
      device_label: deviceLabel,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
      status: 'active',
      connected_at: now,
      updated_at: now,
    })
    .select('id, device_label, api_key_prefix, status, connected_at, last_sync_at')
    .single();

  if (insertErr) {
    return { error: insertErr.message || 'Nepodařilo se vytvořit připojení.' };
  }

  return {
    connection: created,
    api_key: apiKey,
    message: 'API klíč zobrazíme jen jednou. Ulož si ho do Health Auto Export.',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authResult = await getAuthUser(req);
    if (authResult.error) return res.status(authResult.status).json({ error: authResult.error });

    const connectionId = req.body?.connection_id ?? req.body?.connectionId ?? null;
    const deviceLabel = String(req.body?.device_label || req.body?.deviceLabel || 'iPhone').slice(0, 80);

    // First-time create (no existing connection id)
    if (!connectionId) {
      const created = await createConnection(authResult.user.id, deviceLabel);
      if (created.error) {
        console.error('[health/connections/rotate] create error');
        return res.status(500).json({ error: created.error });
      }
      return res.status(201).json({
        ok: true,
        connection: created.connection,
        api_key: created.api_key,
        message: created.message,
      });
    }

    if (!isUuid(connectionId)) {
      return res.status(400).json({ error: 'Neplatné connection_id.' });
    }

    const { data: existing, error: loadErr } = await supabaseServer
      .from('apple_health_connections')
      .select('id, user_id, device_label, status')
      .eq('id', connectionId)
      .eq('user_id', authResult.user.id)
      .maybeSingle();

    if (loadErr) {
      console.error('[health/connections/rotate] load error');
      return res.status(500).json({ error: loadErr.message || 'Nepodařilo se načíst připojení.' });
    }

    if (!existing?.id) {
      return res.status(404).json({ error: 'Připojení nenalezeno.' });
    }

    const created = await createConnection(authResult.user.id, existing.device_label || deviceLabel);
    if (created.error) {
      console.error('[health/connections/rotate] insert error');
      return res.status(500).json({ error: created.error });
    }

    const now = new Date().toISOString();
    const { error: revokeErr } = await supabaseServer
      .from('apple_health_connections')
      .update({
        status: 'revoked',
        revoked_at: now,
        updated_at: now,
      })
      .eq('id', connectionId)
      .eq('user_id', authResult.user.id);

    if (revokeErr) {
      console.error('[health/connections/rotate] revoke error');
      return res.status(201).json({
        ok: true,
        connection: created.connection,
        api_key: created.api_key,
        warning: 'Nový klíč byl vytvořen, ale starý se nepodařilo zrušit. Můžeš mít krátce dva aktivní klíče.',
        message: created.message,
      });
    }

    return res.status(201).json({
      ok: true,
      connection: created.connection,
      api_key: created.api_key,
      message: created.message,
    });
  } catch (err) {
    console.error('[health/connections/rotate] error');
    return res.status(500).json({ error: err?.message || 'Nepodařilo se vygenerovat nový klíč.' });
  }
}
