// GET /api/trainer-schedule – vrací plánované tréninky z kalendáře trenéra (info@)
// Query: from (YYYY-MM-DD), to (YYYY-MM-DD). Volitelně Authorization pro přihlášené.
import { supabaseServer } from '../../lib/supabaseServer';
import { refreshAccessToken, listEvents } from '../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { data: rows, error: fetchErr } = await supabaseServer
      .from('trainer_calendar_tokens')
      .select('id, access_token, refresh_token, expires_at, calendar_id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchErr || !rows?.length) {
      return res.status(200).json({ events: [], connected: false });
    }

    const row = rows[0];
    let accessToken = row.access_token;
    let expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    const now = Date.now();
    if (!accessToken || expiresAt < now + 60 * 1000) {
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

    const fromQuery = req.query?.from || '';
    const toQuery = req.query?.to || '';
    const timeMin = fromQuery ? new Date(fromQuery + 'T00:00:00Z').toISOString() : new Date().toISOString();
    const timeMax = toQuery
      ? new Date(toQuery + 'T23:59:59Z').toISOString()
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const calendarId = row.calendar_id || 'primary';
    const events = await listEvents(accessToken, calendarId, timeMin, timeMax);

    return res.status(200).json({ events, connected: true });
  } catch (err) {
    console.error('[trainer-schedule]', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst rozvrh', events: [], connected: true });
  }
}
