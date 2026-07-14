import { getAuthUser } from '../../../lib/health/apiAuth';
import { isUuid } from '../../../lib/health/guards';
import { supabaseServer } from '../../../lib/supabaseServer';

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

    const now = new Date().toISOString();
    const { data, error } = await supabaseServer
      .from('apple_health_connections')
      .update({
        status: 'revoked',
        revoked_at: now,
        updated_at: now,
      })
      .eq('id', connectionId)
      .eq('user_id', authResult.user.id)
      .select('id, device_label, status, revoked_at')
      .maybeSingle();

    if (error) {
      console.error('[health/connections/revoke] error');
      return res.status(500).json({ error: error.message || 'Nepodařilo se odpojit zařízení.' });
    }

    if (!data?.id) {
      return res.status(404).json({ error: 'Připojení nenalezeno.' });
    }

    return res.status(200).json({
      ok: true,
      connection: data,
    });
  } catch (err) {
    console.error('[health/connections/revoke] error');
    return res.status(500).json({ error: err?.message || 'Nepodařilo se odpojit zařízení.' });
  }
}
