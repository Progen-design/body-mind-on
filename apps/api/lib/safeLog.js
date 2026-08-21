/**
 * Bezpečné logování pro produkci — žádné e-maily, telefony, celé plan_html ani plné profily.
 * Používej u AI pipeline, cronů a dlouhých jobů.
 */

const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'phone_number',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'plan_html',
  'planHtml',
  'raw_html',
  'body',
  'notes',
  'allergies',
  'dietary_restrictions',
  'medical',
  'address',
  'prompt',
  'rawContent',
  'system_prompt',
  'userContent',
]);

const OPENAI_KEY_PATTERN = /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g;
const BEARER_TOKEN_PATTERN = /Bearer\s+[^\s]+/gi;

/**
 * Odstraní API klíče a bearer tokeny z error message před uložením do DB/logů.
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeErrorMessage(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(OPENAI_KEY_PATTERN, 'sk-[REDACTED]')
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED]');
}

/** Vynechá podezřelé klíče a zploští pro console (žádné vnořené body_metrics). */
function sanitizePayload(data) {
  if (data == null || typeof data !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(String(k).toLowerCase())) continue;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = '[object]';
      continue;
    }
    if (typeof v === 'string' && v.length > 500) {
      out[k] = `${sanitizeErrorMessage(v.slice(0, 200))}…(${v.length} chars)`;
      continue;
    }
    if (typeof v === 'string') {
      out[k] = sanitizeErrorMessage(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
export function safeLog(event, data = {}) {
  const safe = sanitizePayload(data);
  const line = {
    t: new Date().toISOString(),
    evt: event,
    ...safe,
  };
  try {
    console.log(JSON.stringify(line));
  } catch {
    console.log(`[safeLog] ${event}`);
  }
}
