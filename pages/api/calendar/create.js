// POST /api/calendar/create – vytvoří událost v kalendáři trenéra (admin key NEBO přihlášený trenér)
// Body: { key?, date, time, title, userEmails?, durationMin? }. key = ADMIN_TOKEN, nebo Authorization: Bearer SESSION (trenér)
import { supabaseServer } from '../../../lib/supabaseServer';
import { createEvent } from '../../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const adminToken = process.env.ADMIN_TOKEN;
  const trainerEmail = (process.env.TRAINER_EMAIL || '').toLowerCase().trim();
  const authHeader = (req.headers.authorization || '').trim();
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  const keyFromBody = req.body?.key;

  let allowed = false;
  if (adminToken && (keyFromBody === adminToken || bearer === adminToken)) {
    allowed = true;
  } else if (trainerEmail && bearer && bearer !== adminToken) {
    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(bearer);
    if (!userErr && user?.email && (user.email.toLowerCase() === trainerEmail)) allowed = true;
  }
  if (!allowed) {
    return res.status(403).json({ error: 'Neoprávněný přístup. Pouze admin nebo trenér (přihlášený) může přidávat tréninky.' });
  }

  try {
    const { data: rows, error: fetchErr } = await supabaseServer
      .from('trainer_calendar_tokens')
      .select('id, access_token, refresh_token, expires_at, calendar_id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchErr || !rows?.length) {
      return res.status(400).json({ error: 'Kalendář trenéra není propojen. Nejprve propoj kalendář (connect URL).' });
    }

    const row = rows[0];
    let accessToken = row.access_token;
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    const now = Date.now();
    if (!accessToken || expiresAt < now + 60 * 1000) {
      const { refreshAccessToken } = await import('../../../lib/googleCalendar');
      const refreshed = await refreshAccessToken(row.refresh_token);
      accessToken = refreshed.access_token;
      const newExpires = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null;
      await supabaseServer
        .from('trainer_calendar_tokens')
        .update({ access_token: accessToken, expires_at: newExpires, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }

    const { date, time, title, userEmails, durationMin } = req.body || {};
    if (!date || !time) {
      return res.status(400).json({ error: 'Chybí datum nebo čas (date, time).' });
    }

    const duration = Math.max(15, Math.min(480, Number(durationMin) || 60));
    const startStr = `${date}T${time.includes(':') ? time : time + ':00'}`;
    const startDate = new Date(startStr);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'Neplatné datum nebo čas. Použij např. date: 2026-02-28, time: 10:00' });
    }
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
    const start = startDate.toISOString();
    const end = endDate.toISOString();

    const calendarId = row.calendar_id || 'primary';
    const attendeeEmails = Array.isArray(userEmails)
      ? userEmails
      : typeof userEmails === 'string'
        ? userEmails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)
        : [];

    await createEvent(accessToken, calendarId, {
      summary: title || 'Trénink',
      start,
      end,
      attendeeEmails,
    });

    return res.status(200).json({ ok: true, message: 'Trénink byl přidán do kalendáře.' });
  } catch (err) {
    console.error('[calendar/create]', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se přidat událost.' });
  }
}
