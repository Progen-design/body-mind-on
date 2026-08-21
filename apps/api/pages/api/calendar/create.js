// POST /api/calendar/create – vytvoří událost v kalendáři trenéra s účastníky (klienty).
// Událost se vytvoří s attendeeEmails – Google Kalendář pak pošle klientům skutečnou pozvánku na událost (Přijmout/Odmítnout).
// Náš vlastní e-mail s odkazem „Přidat do kalendáře“ se posílá jen při chybě zápisu do kalendáře jako záloha.
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
  const trainerEmail = (process.env.TRAINER_EMAIL || process.env.TRAINER_GMAIL || '').toLowerCase().trim();
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
    const timeNorm = (time || '00:00').includes(':') ? time.trim() : time.trim() + ':00';
    const startDate = parseDateTimeAsPrague(date, timeNorm);
    if (!startDate || isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'Neplatné datum nebo čas. Použij např. date: 2026-02-28, time: 10:00' });
    }
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    // Pro Google Calendar posílat čas jako lokální Prague (YYYY-MM-DDTHH:mm:ss), aby se 18:00 zobrazilo jako 18:00, ne o hodinu dřív
    const startLocalStr = new Date(startDate.getTime() + getPragueOffsetHours(date) * 3600000).toISOString().slice(0, 19);
    const endLocalStr = new Date(endDate.getTime() + getPragueOffsetHours(endDate.toISOString().slice(0, 10)) * 3600000).toISOString().slice(0, 19);

    const calendarId = row.calendar_id || 'primary';
    const attendeeEmails = Array.isArray(userEmails)
      ? userEmails
      : typeof userEmails === 'string'
        ? userEmails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)
        : [];

    const eventTitle = title || 'Trénink';

    // Nejdřív vytvořit událost v kalendáři s účastníky – Google pak pošle klientům skutečnou pozvánku na událost (Přijmout/Odmítnout)
    try {
      await createEvent(accessToken, calendarId, {
        summary: eventTitle,
        start: startLocalStr,
        end: endLocalStr,
        attendeeEmails,
      });
      const inviteMsg = attendeeEmails.length > 0
        ? ` Klientům byla odeslána pozvánka na událost (e-mail od Google Kalendáře) – mohou ji přijmout nebo odmítnout.`
        : '';
      return res.status(200).json({
        ok: true,
        message: `Trénink byl přidán do kalendáře.${inviteMsg}`,
      });
    } catch (calendarErr) {
      const msg = calendarErr.message || '';
      if (msg.includes('insufficient') || msg.includes('scope') || msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        // Záloha: poslat vlastní e-mail s odkazem „Přidat do kalendáře“, když zápis do kalendáře selže
        let invitationsSent = 0;
        if (attendeeEmails.length > 0) {
          const invitationResults = await Promise.allSettled(
            attendeeEmails.map((email) => sendTrainingInvitationEmail(email, { title: eventTitle, start, end }))
          );
          invitationsSent = invitationResults.filter((r) => r.status === 'fulfilled' && r.value?.ok).length;
        }
        if (invitationsSent > 0) {
          return res.status(200).json({
            ok: true,
            message: `Pozvánky byly odeslány na ${invitationsSent} e-mail${invitationsSent === 1 ? '' : invitationsSent < 5 ? 'y' : 'ů'} (odkaz na přidání do kalendáře). Trénink se nepodařilo zapsat do tvého Google Kalendáře – klienti teď nedostanou pozvánku s „Přijmout/Odmítnout“. Postup opravy: docs/KALENDAR_TRENER_NASTAVENI.md`,
            fixChecklist: [
              '1. Google Cloud Console → OAuth consent screen → Edit app → Scopes',
              '2. Přidat scope: See, edit, share… Google Calendar (https://www.googleapis.com/auth/calendar)',
              '3. Admin → Propojit Google Kalendář znovu (přihlásit se jako info@)',
              '4. Ověřit, že Google Calendar API je v Library zapnutá (Enable)',
            ],
          });
        }
        return res.status(403).json({
          error: 'Kalendář nemá oprávnění pro zápis. Postup: 1) Google Cloud Console → OAuth consent screen → Scopes → přidat scope Google Calendar (See, edit, share…). 2) Admin → Propojit Google Kalendář znovu (info@). Viz docs/KALENDAR_TRENER_NASTAVENI.md',
          fixChecklist: [
            '1. Google Cloud Console → OAuth consent screen → Edit app → Scopes',
            '2. Přidat scope: See, edit, share… Google Calendar',
            '3. Admin → Propojit Google Kalendář znovu (přihlásit se jako info@)',
          ],
        });
      }
      throw calendarErr;
    }
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
