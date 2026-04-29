// /pages/api/cron/daily-digest.js – Denní e-mail pro všechny uživatele (voláno cronem)
import { supabaseServer } from '../../../lib/supabaseServer';
import { buildDigestPayload, sendDailyDigestEmail } from '../../../lib/dailyDigest';
import { sendTrainerAlertEmail } from '../../../lib/mail';

/** Domény a vzory, na které se denní digest neposílá (RFC 2606 / neplatné MX, test účty z IDE). */
function shouldSkipDigestEmail(rawEmail) {
  const e = String(rawEmail || '').trim().toLowerCase();
  if (!e.includes('@')) return true;
  const local = e.slice(0, e.indexOf('@'));
  const domain = e.slice(e.indexOf('@') + 1);
  if (local.startsWith('cursor-final-')) return true;
  if (
    domain === 'example.com' ||
    domain === 'example.net' ||
    domain === 'example.org' ||
    domain.endsWith('.example')
  ) {
    return true;
  }
  if (domain === 'test' || domain.endsWith('.test')) return true;
  if (domain === 'invalid' || domain.endsWith('.invalid')) return true;
  if (domain === 'localhost' || domain.endsWith('.localhost')) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Autopilot safety: scheduled jobs must not be callable publicly.
    return res.status(500).json({ error: 'CRON_SECRET is not configured' });
  }
  const authHeader = req.headers.authorization || '';
  const bearer = `Bearer ${secret}`;
  if (authHeader !== bearer) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Upozornění trenéra – kalendář nepropojen nebo token brzy vyprší (max 1× za 24 h)
    const alertKey = 'last_trainer_calendar_alert';
    const { data: alertRow } = await supabaseServer.from('trainer_alert_state').select('value, updated_at').eq('key', alertKey).maybeSingle();
    const lastAlert = alertRow?.updated_at ? new Date(alertRow.updated_at).getTime() : 0;
    const now = Date.now();
    if (now - lastAlert > 24 * 60 * 60 * 1000) {
      const { data: tokenRows } = await supabaseServer.from('trainer_calendar_tokens').select('id, expires_at, refresh_token').order('created_at', { ascending: false }).limit(1);
      let shouldAlert = false;
      let alertReason = '';
      if (!tokenRows?.length) {
        shouldAlert = true;
        alertReason = 'no_tokens';
      } else {
        const row = tokenRows[0];
        const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
        const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
        if (!row.refresh_token || expiresAt < sevenDaysFromNow) {
          shouldAlert = true;
          alertReason = 'expiring_soon';
        }
      }
      if (shouldAlert && alertReason) {
        const result = await sendTrainerAlertEmail(alertReason);
        if (result?.ok) {
          await supabaseServer.from('trainer_alert_state').upsert({ key: alertKey, value: alertReason, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        }
      }
    }

    const { data: { users }, error: listError } = await supabaseServer.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      console.error('[daily-digest] listUsers error:', listError);
      return res.status(500).json({ error: 'Nepodařilo se načíst uživatele', detail: listError.message });
    }

    const list = users || [];
    const withEmail = list.filter((u) => u.email && String(u.email).trim());
    const eligible = withEmail.filter((u) => !shouldSkipDigestEmail(u.email));
    let sent = 0;
    const errors = [];

    for (const user of eligible) {
      try {
        const email = user.email.trim().toLowerCase();
        const userName = user.user_metadata?.name || null;
        const payload = await buildDigestPayload(supabaseServer, user.id, email, userName);
        if (payload?.skip === true) continue;
        await sendDailyDigestEmail(email, payload);
        sent += 1;
      } catch (err) {
        console.error('[daily-digest] send failed for', user.email, err);
        errors.push({ email: user.email, message: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      total: withEmail.length,
      skippedUndeliverable: withEmail.length - eligible.length,
      sent,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('[daily-digest] ERROR:', err);
    return res.status(500).json({ error: err.message || 'Chyba serveru' });
  }
}
