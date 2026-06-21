import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(relPath) {
  try {
    const text = readFileSync(join(root, relPath), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // optional env file
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error('ADMIN_TOKEN missing');
  process.exit(1);
}

const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const ownerEmail = process.argv[2] || 'janprikopa@gmail.com';
const recipientEmail = process.argv[3] || 'prikopa@pro-security.cz';
const url = `${base}/api/admin/send-test-plan-email`;

let res;
try {
  res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner_email: ownerEmail,
        recipient_email: recipientEmail,
      }),
    },
    FETCH_TIMEOUT.ADMIN
  );
} catch (err) {
  console.error(formatFetchError(err, url));
  process.exit(1);
}

const body = await res.json().catch(() => ({}));
if (!res.ok || body?.ok !== true) {
  console.error('request failed', `HTTP ${res.status}`, url, body);
  process.exit(1);
}

console.log('ok', recipientEmail, body.plan_id || '');
