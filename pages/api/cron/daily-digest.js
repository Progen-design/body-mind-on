// /pages/api/cron/daily-digest.js – Denní e-mail pro všechny uživatele (voláno cronem)
import { supabaseServer } from '../../../lib/supabaseServer';
import { buildDigestPayload, sendDailyDigestEmail } from '../../../lib/dailyDigest';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const bearer = secret ? `Bearer ${secret}` : '';
  if (secret && authHeader !== bearer) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
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
    let sent = 0;
    const errors = [];

    for (const user of withEmail) {
      try {
        const email = user.email.trim().toLowerCase();
        const userName = user.user_metadata?.name || null;
        const payload = await buildDigestPayload(supabaseServer, user.id, email, userName);
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
      sent,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('[daily-digest] ERROR:', err);
    return res.status(500).json({ error: err.message || 'Chyba serveru' });
  }
}
