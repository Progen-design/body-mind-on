// POST /api/calendar/create – vytvoří událost v kalendáři trenéra (admin key NEBO přihlášený trenér)
// Pokud jsou vyplněné userEmails, vždy se odešle e-mail s pozvánkou (odkaz „Přidat do kalendáře“) – potvrzení záleží na uživateli.
// Body: { key?, date, time, title, userEmails?, durationMin? }. key = ADMIN_TOKEN, nebo Authorization: Bearer SESSION (trenér)
import { supabaseServer } from '../../../lib/supabaseServer';
import { createEvent } from '../../../lib/googleCalendar';
import { sendTrainingInvitationEmail } from '../../../lib/mail';

/** Vrací počet hodin oproti UTC pro Europe/Prague v daný den (1 = CET zima, 2 = CEST léto). */
function getPragueOffsetHours(dateStr) {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return 1;
  const [y, m, d] = parts;
  const lastSundayMarch = 31 - new Date(y, 2, 31).getDay();
  const lastSundayOct = 31 - new Date(y, 9, 31).getDay();
  if (m < 3 || (m === 3 && d < lastSundayMarch)) return 1;
  if (m > 10 || (m === 10 && d > lastSundayOct)) return 1;
  if (m >= 4 && m <= 9) return 2;
  if (m === 3) return d >= lastSundayMarch ? 2 : 1;
  if (m === 10) return d <= lastSundayOct ? 2 : 1;
  return 1;
}

/** Parsuje datum (YYYY-MM-DD) a čas (HH:mm) jako lokální čas v Europe/Prague; vrací Date (UTC). */
function parseDateTimeAsPrague(dateStr, timeStr) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(day)) return null;
  const offset = getPragueOffsetHours(dateStr);
  return new Date(Date.UTC(y, m - 1, day, hh - offset, mm || 0, 0, 0));
}

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
    // Interpretovat datum a čas jako Europe/Prague (CET/CEST), ne jako server UTC – aby 10:00 zůstalo 10:00 v kalendáři
    const startDate = parseDateTimeAsPrague(date, time.includes(':') ? time : time + ':00');
    if (!startDate || isNaN(startDate.getTime())) {
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

    const eventTitle = title || 'Trénink';
    let calendarCreated = false;

    // E-mailové pozvánky – vždy odeslat při vyplněných e-mailech; uživatel si může přidat do kalendáře (potvrdit)
    const invitationResults = await Promise.allSettled(
      attendeeEmails.map((email) => sendTrainingInvitationEmail(email, { title: eventTitle, start, end }))
    );
    const invitationsSent = invitationResults.filter((r) => r.status === 'fulfilled' && r.value?.ok).length;

    try {
      await createEvent(accessToken, calendarId, {
        summary: eventTitle,
        start,
        end,
        attendeeEmails,
      });
      calendarCreated = true;
    } catch (calendarErr) {
      const msg = calendarErr.message || '';
      if (msg.includes('insufficient') || msg.includes('scope') || msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        if (invitationsSent > 0) {
          return res.status(200).json({
            ok: true,
            message: `Pozvánky odeslány na ${invitationsSent} e-mail${invitationsSent === 1 ? '' : invitationsSent < 5 ? 'y' : 'ů'} – příjemce si může přidat trénink do kalendáře. Pro zápis i do kalendáře trenéra: v Google Cloud Console (OAuth consent screen → Scopes) přidej scope Google Calendar API, pak Admin → Propojit Google Kalendář (přihlásit se jako info@).`,
          });
        }
        return res.status(403).json({
          error: 'Kalendář nemá oprávnění pro zápis. V Google Cloud Console (OAuth consent screen → Scopes) přidej scope „Google Calendar API“ (See, edit, share… calendars). Pak znovu propoj kalendář: Admin → Propojit Google Kalendář, přihlas se jako info@. Viz docs/KALENDAR_TRENER_NASTAVENI.md.',
        });
      }
      throw calendarErr;
    }

    let message = 'Trénink byl přidán do kalendáře.';
    if (invitationsSent > 0) {
      message += ` Pozvánky odeslány na ${invitationsSent} e-mail${invitationsSent === 1 ? '' : invitationsSent < 5 ? 'y' : 'ů'} – záleží na nich, jestli si událost přidají.`;
    }
    return res.status(200).json({ ok: true, message });
  } catch (err) {
    console.error('[calendar/create]', err);
    const msg = err.message || '';
    if (msg.includes('insufficient') || msg.includes('scope') || msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
      return res.status(403).json({
        error: 'Kalendář nemá oprávnění pro zápis. Propoj kalendář znovu: Admin → „Propojit Google Kalendář (info@)“ nebo otevři odkaz na propojení a přihlas se účtem info@. Nový token bude mít oprávnění pro přidávání tréninků.',
      });
    }
    return res.status(500).json({ error: err.message || 'Nepodařilo se přidat událost.' });
  }
}
