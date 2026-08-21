// GET/POST /api/cron/system-health-alert
// Daily ops alert from view system_health_alerts (SQL owns detection logic).
import { supabaseServer } from '../../../lib/supabaseServer';
import { sendSystemHealthAlertEmail } from '../../../lib/mail';

function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET is not configured' };
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const startedAt = new Date().toISOString();
  console.log('[system-health-alert] start', startedAt);

  try {
    const { data: rows, error } = await supabaseServer
      .from('system_health_alerts')
      .select('severity, kod, popis, detail, pocet');

    if (error) {
      console.error('[system-health-alert] view query failed:', error.message);
      return res.status(500).json({ ok: false, error: error.message, started_at: startedAt });
    }

    const alerts = Array.isArray(rows) ? rows : [];
    if (alerts.length === 0) {
      console.log('[system-health-alert] empty view — no email', { started_at: startedAt });
      return res.status(200).json({
        ok: true,
        sent: false,
        reason: 'no_alerts',
        alert_count: 0,
        started_at: startedAt,
      });
    }

    const critical = alerts.filter((a) => String(a.severity || '').toLowerCase() === 'critical').length;
    const warning = alerts.filter((a) => String(a.severity || '').toLowerCase() === 'warning').length;

    const mailResult = await sendSystemHealthAlertEmail({ alerts, critical, warning });
    console.log('[system-health-alert] done', {
      started_at: startedAt,
      alert_count: alerts.length,
      critical,
      warning,
      sent: !!mailResult?.ok,
    });

    if (!mailResult?.ok) {
      return res.status(500).json({
        ok: false,
        sent: false,
        alert_count: alerts.length,
        critical,
        warning,
        error: mailResult?.message || 'email_failed',
        started_at: startedAt,
      });
    }

    return res.status(200).json({
      ok: true,
      sent: true,
      alert_count: alerts.length,
      critical,
      warning,
      started_at: startedAt,
    });
  } catch (err) {
    console.error('[system-health-alert] ERROR:', err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Chyba serveru',
      started_at: startedAt,
    });
  }
}
