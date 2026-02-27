/**
 * Google Calendar – kalendář trenéra (info@).
 * OAuth 2.0: build URL, výměna kódu za tokeny, refresh, načtení událostí.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

function getClientId() {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!id) throw new Error('Chybí GOOGLE_CALENDAR_CLIENT_ID');
  return id;
}

function getClientSecret() {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
}

function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) || 'http://localhost:3000';
  return base.replace(/\/$/, '') + '/api/auth/google-calendar/callback';
}

/**
 * Vygeneruje URL pro přihlášení uživatele k Google (OAuth consent).
 * @param {string} state - Opaque hodnota vrácená v callbacku (např. nonce nebo admin token)
 */
export function getAuthUrl(state = '') {
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: state || 'trainer',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Vymění autorizační kód za access_token a refresh_token.
 * @param {string} code - Kód z query parametru ?code=...
 * @returns {Promise<{ access_token, refresh_token, expires_in }>}
 */
export async function exchangeCodeForTokens(code) {
  const redirectUri = getRedirectUri();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Google token exchange failed: ' + err);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

/**
 * Získá nový access_token pomocí refresh_token.
 * @param {string} refreshToken
 * @returns {Promise<{ access_token, expires_in }>}
 */
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Google refresh token failed: ' + err);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
  };
}

/**
 * Načte události z kalendáře v daném rozmezí.
 * @param {string} accessToken - Platný access_token
 * @param {string} [calendarId] - Např. 'primary'
 * @param {string} timeMin - ISO 8601 (např. 2026-02-20T00:00:00Z)
 * @param {string} timeMax - ISO 8601
 * @returns {Promise<Array<{ start, end, summary }>>}
 */
export async function listEvents(accessToken, calendarId = 'primary', timeMin, timeMax) {
  const params = new URLSearchParams();
  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);
  params.set('singleEvents', 'true');
  params.set('orderBy', 'startTime');
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Calendar API failed: ' + err);
  }
  const data = await res.json();
  const items = (data.items || []).map((ev) => {
    const start = ev.start?.dateTime || ev.start?.date;
    const end = ev.end?.dateTime || ev.end?.date;
    const allAttendees = (ev.attendees || []).map((a) => (a.email || '').toLowerCase()).filter(Boolean);
    const organizer = (ev.organizer?.email || '').toLowerCase();
    const attendees = allAttendees.filter((e) => e !== organizer);
    return {
      id: ev.id,
      summary: ev.summary || '(Bez názvu)',
      start,
      end,
      htmlLink: ev.htmlLink,
      description: ev.description || '',
      attendees,
      organizer,
    };
  });
  return items;
}

/**
 * Vytvoří událost v kalendáři (zápis z aplikace).
 * @param {string} accessToken
 * @param {string} calendarId - např. 'primary'
 * @param {{ summary: string, description?: string, start: string, end: string, attendeeEmails?: string[] }} opts
 * @returns {Promise<{ id, htmlLink }>}
 */
export async function createEvent(accessToken, calendarId = 'primary', opts) {
  const { summary, description = '', start, end, attendeeEmails = [] } = opts;
  const timeZone = 'Europe/Prague';
  const body = {
    summary: summary || 'Trénink',
    start: { dateTime: start, timeZone },
    end: { dateTime: end, timeZone },
  };
  if (description) body.description = description;
  else if (attendeeEmails.length > 0) {
    body.description = 'Pro: ' + attendeeEmails.map((e) => e.trim()).filter(Boolean).join(', ');
  }
  if (attendeeEmails.length > 0) {
    body.attendees = attendeeEmails.map((email) => ({ email: email.trim() })).filter((a) => a.email);
  }
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Calendar create failed: ' + err);
  }
  const data = await res.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

/**
 * Určí, zda má být událost zobrazena danému uživateli.
 * Pravidla: pokud v popisu je "Pro: email" (nebo více e-mailů), zobraz jen těm; pokud jsou attendees, zobraz jen jim; jinak událost pro všechny.
 */
export function eventIsForUser(ev, userEmail) {
  const email = (userEmail || '').toLowerCase().trim();
  if (!email) return true;

  // Organizátor události (vlastník kalendáře) vždy vidí svou událost
  const organizer = (ev.organizer || '').toLowerCase();
  if (organizer && organizer === email) return true;

  const desc = (ev.description || '').trim();
  const hasPro = /Pro:\s*/i.test(desc);
  const attendees = ev.attendees || [];

  if (hasPro) {
    const proMatch = desc.match(/Pro:\s*([^\n]+)/i);
    const proEmails = (proMatch ? proMatch[1] : '')
      .split(/[,;]/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (proEmails.length > 0) return proEmails.includes(email);
  }

  if (attendees.length > 0) {
    return attendees.includes(email);
  }

  return true;
}
