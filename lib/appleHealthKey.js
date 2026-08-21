import crypto from 'crypto';

/** Stejný algoritmus jako sha256Hex v supabase/functions/apple-health-ingest/index.ts */
export function sha256HexAppleHealthKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey)).digest('hex');
}

export function generateAppleHealthApiKey() {
  return `bmon_ah_${crypto.randomBytes(16).toString('hex')}`;
}

export function appleHealthApiKeyPrefix(apiKey) {
  return String(apiKey).slice(0, 16);
}
