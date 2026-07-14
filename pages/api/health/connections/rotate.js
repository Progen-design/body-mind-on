import { getAuthUser } from '../../../../lib/health/apiAuth';
import { isUuid } from '../../../../lib/health/guards';
import {
  appleHealthApiKeyPrefix,
  generateAppleHealthApiKey,
  sha256HexAppleHealthKey,
} from '../../../../lib/appleHealthKey';
import { supabaseServer } from '../../../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authResult = await getAuthUser(req);
    if (authResult.error) return res.status(authResult.status).json({ error: authResult.error });

    const connectionId = req.body?.connection_id ?? req.body?.connectionId ?? null;
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

    const now = new Date().toISOString();
    const apiKey = generateAppleHealthApiKey();
    const apiKeyHash = sha256HexAppleHealthKey(apiKey);
    const apiKeyPrefix = appleHealthApiKeyPrefix(apiKey);

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
      return res.status(500).json({ error: revokeErr.message || 'Nepodařilo se zrušit starý klíč.' });
    }

    const { data: created, error: insertErr } = await supabaseServer
      .from('apple_health_connections')
      .insert({
        user_id: authResult.user.id,
        device_label: existing.device_label || 'iPhone',
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        status: 'active',
        connected_at: now,
        updated_at: now,
      })
      .select('id, device_label, api_key_prefix, status, connected_at')
      .single();

    if (insertErr) {
      console.error('[health/connections/rotate] insert error');
      return res.status(500).json({ error: insertErr.message || 'Nepodařilo se vytvořit nový klíč.' });
    }

    return res.status(201).json({
      ok: true,
      connection: created,
      api_key: apiKey,
      message: 'API klíč zobrazíme jen jednou. Ulož si ho do Health Auto Export.',
    });
  } catch (err) {
    console.error('[health/connections/rotate] error');
    return res.status(500).json({ error: err?.message || 'Nepodařilo se vygenerovat nový klíč.' });
  }
}
