// POST /api/events — low-risk product funnel events
import { supabaseServer } from '../../lib/supabaseServer';
import {
  isAllowedProductEvent,
  isAnonymousAllowedEvent,
} from '../../lib/productEventAllowlist';
import { validateEventProperties, jsonByteLength } from '../../lib/productEventPiiGuard';
import { getClientIp, isAnyRateLimited } from '../../lib/rateLimit';

const MAX_BODY_BYTES = 10 * 1024;
const ANON_RATE_LIMIT = 30;
const ANON_WINDOW_MS = 15 * 60 * 1000;

function readRawBodyLimit(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let raw;
  try {
    raw = await readRawBodyLimit(req);
  } catch (e) {
    if (e?.message === 'body_too_large') {
      return res.status(400).json({ error_code: 'body_too_large' });
    }
    return res.status(400).json({ error: 'Invalid body' });
  }

  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventName = String(body.event_name || '').trim();
  if (!isAllowedProductEvent(eventName)) {
    return res.status(400).json({ error_code: 'unknown_event' });
  }

  const properties = body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
    ? body.properties
    : {};

  const guard = validateEventProperties(properties);
  if (!guard.ok) {
    return res.status(400).json({ error_code: guard.reason || 'event_properties_rejected' });
  }
  if (jsonByteLength(properties) > 5 * 1024) {
    return res.status(400).json({ error_code: 'event_properties_rejected' });
  }

  let userId = null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (token) {
    const { data: { user }, error } = await supabaseServer.auth.getUser(token);
    if (!error && user?.id) userId = user.id;
  }

  // Never trust client-supplied user_id
  if (body.user_id) {
    /* ignored */
  }

  if (!userId) {
    if (!isAnonymousAllowedEvent(eventName)) {
      return res.status(401).json({ error_code: 'auth_required' });
    }
    const anonymousId = String(body.anonymous_id || '').trim();
    const sessionId = String(body.session_id || '').trim();
    if (!anonymousId || !sessionId) {
      return res.status(400).json({ error_code: 'anonymous_session_required' });
    }
    const ip = getClientIp(req);
    const limited = isAnyRateLimited(
      [`events:anon:${ip}`, `events:anon:${anonymousId}`, `events:anon:${sessionId}`],
      ANON_RATE_LIMIT,
      ANON_WINDOW_MS,
    );
    if (limited) {
      return res.status(429).json({ error_code: 'rate_limited' });
    }
  }

  const row = {
    user_id: userId,
    anonymous_id: userId ? null : String(body.anonymous_id || '').slice(0, 64) || null,
    session_id: userId ? null : String(body.session_id || '').slice(0, 64) || null,
    event_name: eventName,
    event_version: Number(body.event_version) || 1,
    properties,
    page_path: body.page_path ? String(body.page_path).slice(0, 200) : null,
    source: body.source ? String(body.source).slice(0, 100) : null,
    utm_source: body.utm_source ? String(body.utm_source).slice(0, 150) : null,
    utm_medium: body.utm_medium ? String(body.utm_medium).slice(0, 150) : null,
    utm_campaign: body.utm_campaign ? String(body.utm_campaign).slice(0, 150) : null,
  };

  const { error: insErr } = await supabaseServer.from('product_events').insert(row);
  if (insErr) {
    console.error('[api/events] insert failed');
    return res.status(200).json({ received: true, stored: false });
  }

  return res.status(200).json({ received: true, stored: true });
}

export const config = {
  api: { bodyParser: false },
};
