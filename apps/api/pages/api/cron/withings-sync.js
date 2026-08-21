// /pages/api/cron/withings-sync.js
import { supabaseServer } from '../../../lib/supabaseServer.js';
import { syncWithingsForUser, markWithingsSyncError } from '../../../lib/withingsServer.js';
import { importLatestWithingsToProfile } from '../../../lib/withingsProfileImport.js';

function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET is not configured' };
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

function needsSync(connection) {
  if (!connection?.last_sync_at) return true;
  const last = new Date(connection.last_sync_at).getTime();
  if (!Number.isFinite(last)) return true;
  const maxAgeHours = Math.max(1, Number(process.env.WITHINGS_CRON_MAX_AGE_HOURS || 6));
  return Date.now() - last > maxAgeHours * 60 * 60 * 1000;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const startedAt = new Date().toISOString();
  const maxUsers = Math.min(Math.max(Number(req.query.limit || process.env.WITHINGS_CRON_MAX_USERS || 50), 1), 200);

  try {
    const { data: connections, error } = await supabaseServer
      .from('withings_connections')
      .select('user_id, last_sync_at, last_sync_error')
      .order('last_sync_at', { ascending: true, nullsFirst: true })
      .limit(maxUsers);

    if (error) throw error;

    const candidates = (connections || []).filter(needsSync);
    const results = [];

    for (const connection of candidates) {
      try {
        const syncResult = await syncWithingsForUser(connection.user_id, { full: false });
        const profileImport = await importLatestWithingsToProfile(connection.user_id);
        results.push({
          user_id: connection.user_id,
          ok: true,
          measurements_stored: syncResult.measurements_stored || 0,
          profile_import: profileImport,
        });
      } catch (err) {
        console.error('[withings-cron] sync failed', connection.user_id, err);
        await markWithingsSyncError(connection.user_id, err).catch(() => {});
        results.push({
          user_id: connection.user_id,
          ok: false,
          error: err?.message || 'Withings sync failed',
        });
      }
    }

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
      checked: connections?.length || 0,
      synced: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      skipped_fresh: (connections?.length || 0) - candidates.length,
      results,
    });
  } catch (err) {
    console.error('[withings-cron] ERROR:', err);
    return res.status(500).json({ error: err?.message || 'Withings cron failed' });
  }
}
