// /lib/withingsServer.js
import crypto from 'crypto';
import { supabaseServer } from './supabaseServer.js';
import { getPublicAppUrl } from './siteUrls.js';

const DEFAULT_WITHINGS_API_URL = 'https://wbsapi.withings.net';
const DEFAULT_WITHINGS_AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';
const DEFAULT_WITHINGS_SCOPES = 'user.info,user.metrics,user.activity';
const OAUTH_STATE_TTL_MINUTES = 10;

const MEASURE_LABELS = {
  1: 'weight_kg',
  4: 'height_m',
  5: 'fat_free_mass_kg',
  6: 'fat_ratio_percent',
  8: 'fat_mass_kg',
  76: 'muscle_mass_kg',
  77: 'hydration_kg',
  88: 'bone_mass_kg',
};

const MEASURE_UNITS = {
  1: 'kg',
  4: 'm',
  5: 'kg',
  6: '%',
  8: 'kg',
  76: 'kg',
  77: 'kg',
  88: 'kg',
};

function envValue(...parts) {
  return process.env[parts.join('')];
}

function asSingle(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeBaseUrl(value, fallback) {
  const raw = String(value || fallback || '').trim().replace(/\/$/, '');
  return raw || fallback;
}

export function isWithingsOAuthConfigured() {
  const clientId = String(envValue('WITHINGS_CLIENT_', 'ID') || '').trim();
  const clientSecret = String(envValue('WITHINGS_CLIENT_', 'SECRET') || '').trim();
  return Boolean(clientId && clientSecret);
}

function getWithingsConfig() {
  const clientId = String(envValue('WITHINGS_CLIENT_', 'ID') || '').trim();
  const clientSecret = String(envValue('WITHINGS_CLIENT_', 'SECRET') || '').trim();
  const redirectUri = String(
    process.env.WITHINGS_REDIRECT_URI || `${getPublicAppUrl()}/api/withings/callback`
  ).trim();
  const apiUrl = normalizeBaseUrl(process.env.WITHINGS_API_URL, DEFAULT_WITHINGS_API_URL);
  const authorizeUrl = String(process.env.WITHINGS_AUTHORIZE_URL || DEFAULT_WITHINGS_AUTHORIZE_URL).trim();
  const scope = String(process.env.WITHINGS_SCOPES || DEFAULT_WITHINGS_SCOPES).trim();

  if (!clientId || !clientSecret) {
    const err = new Error('Withings OAuth není nakonfigurován. Chybí klientské údaje z Withings dashboardu.');
    err.statusCode = 500;
    throw err;
  }
  if (!redirectUri.startsWith('https://')) {
    const err = new Error('Withings redirect URI musí být veřejná HTTPS URL.');
    err.statusCode = 500;
    throw err;
  }

  return { clientId, clientSecret, redirectUri, apiUrl, authorizeUrl, scope };
}

function getEncryptionKey() {
  const raw = String(envValue('WITHINGS_TOKEN_', 'ENCRYPTION_KEY') || '').trim();
  if (!raw) {
    const err = new Error('Chybí šifrovací klíč pro bezpečné uložení Withings tokenů.');
    err.statusCode = 500;
    throw err;
  }

  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');

  try {
    const base64 = Buffer.from(raw, 'base64');
    if (base64.length === 32) return base64;
  } catch (_) {
    // pokračujeme na poslední validaci níže
  }

  const err = new Error('Withings šifrovací klíč musí mít 32 bajtů v base64 nebo 64 hex znaků.');
  err.statusCode = 500;
  throw err;
}

export function encryptWithingsToken(token) {
  const text = String(token || '');
  if (!text) throw new Error('Nelze uložit prázdný Withings token.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptWithingsToken(payload) {
  if (!payload || payload.v !== 1 || payload.alg !== 'aes-256-gcm') {
    throw new Error('Neplatný formát uloženého Withings tokenu.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function createStateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function signWithingsParams(params, clientSecret) {
  const paramsToSign = {
    action: params.action,
    client_id: params.client_id,
  };
  if (params.nonce) paramsToSign.nonce = params.nonce;
  if (params.timestamp) paramsToSign.timestamp = params.timestamp;

  const values = Object.keys(paramsToSign)
    .sort()
    .map((key) => String(paramsToSign[key]))
    .join(',');

  return crypto.createHmac('sha256', clientSecret).update(values).digest('hex');
}

async function parseWithingsResponse(response) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    const err = new Error(`Withings API vrátilo neplatnou odpověď (${response.status}).`);
    err.statusCode = 502;
    throw err;
  }

  if (!response.ok) {
    const err = new Error(json?.error || json?.body?.error || `Withings HTTP ${response.status}`);
    err.statusCode = 502;
    err.details = json;
    throw err;
  }

  const status = Number(json?.status ?? 0);
  if (status !== 0) {
    const err = new Error(json?.error || json?.body?.error || `Withings API status ${status}`);
    err.statusCode = 502;
    err.details = json;
    throw err;
  }

  return json?.body || {};
}

async function postWithings(path, params, accessToken = null) {
  const { apiUrl } = getWithingsConfig();
  const body = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
  });

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers,
    body,
  });
  return parseWithingsResponse(response);
}

async function getNonce() {
  const { clientId, clientSecret } = getWithingsConfig();
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    action: 'getnonce',
    client_id: clientId,
    timestamp,
  };
  params.signature = signWithingsParams(params, clientSecret);
  const body = await postWithings('/v2/signature', params);
  if (!body?.nonce) throw new Error('Withings nevrátil nonce.');
  return body.nonce;
}

async function requestWithingsToken(extraParams) {
  const { clientId, clientSecret, redirectUri } = getWithingsConfig();
  const nonce = await getNonce();
  const params = {
    action: 'requesttoken',
    client_id: clientId,
    redirect_uri: redirectUri,
    nonce,
    ...extraParams,
  };
  params.signature = signWithingsParams(params, clientSecret);
  return postWithings('/v2/oauth2', params);
}

export async function exchangeWithingsAuthorizationCode(code) {
  return requestWithingsToken({
    code,
    grant_type: 'authorization_code',
  });
}

export async function refreshWithingsTokens(refreshToken) {
  return requestWithingsToken({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
}

export function getWithingsRedirectUri() {
  return getWithingsConfig().redirectUri;
}

export function buildWithingsAuthorizeUrl(state, options = {}) {
  const { clientId, redirectUri, authorizeUrl, scope } = getWithingsConfig();
  const url = new URL(authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', scope);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  const demoAllowed = process.env.WITHINGS_ALLOW_DEMO_MODE === 'true' || process.env.VERCEL_ENV !== 'production';
  if (options.mode === 'demo' && demoAllowed) url.searchParams.set('mode', 'demo');

  return url.toString();
}

export function sanitizeWithingsReturnTo(value) {
  const raw = String(asSingle(value) || '').trim();
  if (!raw) return '/profil';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;

  try {
    const app = new URL(getPublicAppUrl());
    const parsed = new URL(raw);
    if (parsed.origin === app.origin) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_) {
    // neplatné URL ignorujeme
  }
  return '/profil';
}

export function toPublicAppUrl(pathOrUrl) {
  const safePath = sanitizeWithingsReturnTo(pathOrUrl || '/profil');
  return `${getPublicAppUrl()}${safePath.startsWith('/') ? safePath : `/${safePath}`}`;
}

export async function getAuthUserFromRequest(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return { error: 'Nejste přihlášen.', status: 401 };

  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data?.user) return { error: 'Nejste přihlášen.', status: 401 };
  return { user: data.user, token };
}

export async function createWithingsOAuthState(userId, returnTo = '/profil') {
  const state = createStateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabaseServer.from('withings_oauth_states').insert({
    state_hash: sha256(state),
    user_id: userId,
    return_to: sanitizeWithingsReturnTo(returnTo),
    expires_at: expiresAt,
  });

  if (error) throw error;
  return state;
}

export async function consumeWithingsOAuthState(state) {
  const stateHash = sha256(state);
  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from('withings_oauth_states')
    .select('id, user_id, return_to, expires_at, consumed_at')
    .eq('state_hash', stateHash)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    const err = new Error('Neplatný nebo expirovaný Withings OAuth state.');
    err.statusCode = 400;
    throw err;
  }

  const { error: updateError } = await supabaseServer
    .from('withings_oauth_states')
    .update({ consumed_at: now })
    .eq('id', data.id)
    .is('consumed_at', null);

  if (updateError) throw updateError;
  return data;
}

function tokenExpiresAt(expiresInSeconds) {
  const seconds = Number(expiresInSeconds || 10800);
  return new Date(Date.now() + Math.max(60, seconds) * 1000).toISOString();
}

function refreshTokenExpiresAt() {
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
}

export async function saveWithingsConnection(userId, tokenBody, existingConnection = null) {
  if (!tokenBody?.access_token || !tokenBody?.refresh_token) {
    throw new Error('Withings nevrátil access_token nebo refresh_token.');
  }

  const now = new Date().toISOString();
  const withingsUserid = String(tokenBody.userid || existingConnection?.withings_userid || '').trim();
  const row = {
    user_id: userId,
    withings_userid: withingsUserid,
    scope: tokenBody.scope || existingConnection?.scope || null,
    token_type: tokenBody.token_type || existingConnection?.token_type || 'Bearer',
    access_token_ciphertext: encryptWithingsToken(tokenBody.access_token),
    refresh_token_ciphertext: encryptWithingsToken(tokenBody.refresh_token),
    expires_at: tokenExpiresAt(tokenBody.expires_in),
    refresh_token_expires_at: refreshTokenExpiresAt(),
    csrf_token: tokenBody.csrf_token || existingConnection?.csrf_token || null,
    connected_at: existingConnection?.connected_at || now,
    updated_at: now,
    last_sync_error: null,
  };

  const { data, error } = await supabaseServer
    .from('withings_connections')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getFreshWithingsConnection(userId) {
  const { data: connection, error } = await supabaseServer
    .from('withings_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!connection?.id) {
    const err = new Error('Withings účet není propojený.');
    err.statusCode = 404;
    throw err;
  }

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60 * 1000) {
    return { connection, accessToken: decryptWithingsToken(connection.access_token_ciphertext), refreshed: false };
  }

  const refreshToken = decryptWithingsToken(connection.refresh_token_ciphertext);
  const tokenBody = await refreshWithingsTokens(refreshToken);
  const updated = await saveWithingsConnection(userId, tokenBody, connection);
  return { connection: updated, accessToken: tokenBody.access_token, refreshed: true };
}

function unixSeconds(dateValue) {
  const time = new Date(dateValue).getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

function measurementValue(measure) {
  const value = Number(measure?.value);
  const unit = Number(measure?.unit);
  if (!Number.isFinite(value) || !Number.isFinite(unit)) return null;
  return value * Math.pow(10, unit);
}

function normalizeMeasureGroup(group, userId, withingsUserid) {
  const measures = Array.isArray(group?.measures) ? group.measures : [];
  const measuredUnix = Number(group?.date || group?.created || 0);
  const measuredAt = measuredUnix ? new Date(measuredUnix * 1000).toISOString() : new Date().toISOString();
  const groupId = String(group?.grpid || `${withingsUserid || userId}-${measuredUnix || Date.now()}`);

  return measures
    .map((measure) => {
      const type = Number(measure?.type);
      const value = measurementValue(measure);
      if (!Number.isFinite(type) || value == null) return null;
      return {
        user_id: userId,
        withings_userid: withingsUserid || null,
        withings_measure_group_id: groupId,
        measure_type: type,
        measure_type_label: MEASURE_LABELS[type] || `measure_${type}`,
        unit: MEASURE_UNITS[type] || null,
        value,
        measured_at: measuredAt,
        category: Number.isFinite(Number(group?.category)) ? Number(group.category) : null,
        attrib: Number.isFinite(Number(group?.attrib)) ? Number(group.attrib) : null,
        raw: {
          group: {
            grpid: group?.grpid ?? null,
            attrib: group?.attrib ?? null,
            date: group?.date ?? null,
            created: group?.created ?? null,
            category: group?.category ?? null,
            deviceid: group?.deviceid ?? null,
          },
          measure,
        },
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export async function syncWithingsForUser(userId, options = {}) {
  const { connection, accessToken, refreshed } = await getFreshWithingsConnection(userId);
  const params = {
    action: 'getmeas',
    category: 1,
  };

  const full = options.full === true;
  const initialDays = Math.max(1, Number(process.env.WITHINGS_INITIAL_SYNC_DAYS || 365));
  if (options.startdate) {
    const start = unixSeconds(options.startdate);
    if (start) params.startdate = start;
  } else if (!full && connection.last_sync_at) {
    const last = unixSeconds(connection.last_sync_at);
    if (last) params.lastupdate = Math.max(0, last - 300);
  } else {
    params.startdate = Math.floor(Date.now() / 1000) - initialDays * 24 * 60 * 60;
  }

  const body = await postWithings('/measure', params, accessToken);
  const groups = Array.isArray(body?.measuregrps) ? body.measuregrps : [];
  const rows = groups.flatMap((group) => normalizeMeasureGroup(group, userId, connection.withings_userid));

  if (rows.length) {
    const { error: upsertError } = await supabaseServer
      .from('withings_measurements')
      .upsert(rows, { onConflict: 'user_id,withings_measure_group_id,measure_type' });
    if (upsertError) throw upsertError;
  }

  const syncedAt = new Date().toISOString();
  await supabaseServer
    .from('withings_connections')
    .update({ last_sync_at: syncedAt, last_sync_error: null, updated_at: syncedAt })
    .eq('user_id', userId);

  return {
    ok: true,
    refreshed,
    groups_fetched: groups.length,
    measurements_stored: rows.length,
    last_sync_at: syncedAt,
    requested: params,
  };
}

export async function markWithingsSyncError(userId, error) {
  const message = error?.message || String(error || 'Neznámá chyba syncu');
  await supabaseServer
    .from('withings_connections')
    .update({ last_sync_error: message, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export async function getLatestWithingsMeasurements(userId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { data: rows, error } = await supabaseServer
    .from('withings_measurements')
    .select('measure_type, measure_type_label, value, unit, measured_at, withings_measure_group_id, created_at')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  const latestByType = {};
  (rows || []).forEach((row) => {
    const key = row.measure_type_label || `measure_${row.measure_type}`;
    if (!latestByType[key]) latestByType[key] = { ...row, value: Number(row.value) };
  });

  return {
    rows: (rows || []).map((row) => ({ ...row, value: Number(row.value) })),
    latest_by_type: latestByType,
    latest_weight_kg: latestByType.weight_kg?.value ?? null,
  };
}

const HISTORY_FIELD_MAP = {
  weight_kg: 'weight_kg',
  fat_ratio_percent: 'fat_percent',
  fat_mass_kg: 'fat_mass_kg',
  muscle_mass_kg: 'muscle_mass_kg',
  bone_mass_kg: 'bone_mass_kg',
  hydration_kg: 'hydration_kg',
};

function parseWithingsHistoryDate(value, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (endOfDay) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

function roundHistoryNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

export async function getWithingsMeasurementHistory(userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const from = parseWithingsHistoryDate(options.from, false);
  const to = parseWithingsHistoryDate(options.to, true);

  let query = supabaseServer
    .from('withings_measurements')
    .select('measure_type_label, value, measured_at, withings_measure_group_id')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false });

  if (from) query = query.gte('measured_at', from);
  if (to) query = query.lte('measured_at', to);

  const { data: rows, error } = await query.limit(limit * 12);
  if (error) throw error;

  const grouped = new Map();
  for (const row of rows || []) {
    const groupKey = `${row.withings_measure_group_id || 'unknown'}:${row.measured_at}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        measured_at: row.measured_at,
        weight_kg: null,
        fat_percent: null,
        fat_mass_kg: null,
        muscle_mass_kg: null,
        bone_mass_kg: null,
        hydration_kg: null,
        source: 'withings',
      });
    }
    const entry = grouped.get(groupKey);
    const field = HISTORY_FIELD_MAP[row.measure_type_label];
    if (field) entry[field] = roundHistoryNumber(row.value);
  }

  const measurements = [...grouped.values()]
    .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())
    .slice(0, limit);

  return { measurements, count: measurements.length, limit };
}
