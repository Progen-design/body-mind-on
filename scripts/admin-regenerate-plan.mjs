import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch {
    /* optional */
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
const email = process.argv[2] || 'prikopa@pro-security.cz';
const skipEmail = process.argv.includes('--send') ? false : true;

const res = await fetch(`${base}/api/admin/regenerate-user-plan`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, skip_email: skipEmail }),
});

const body = await res.json().catch(() => ({}));
console.log(JSON.stringify({ status: res.status, ok: body.ok, plan_id: body.plan_id, valid_from: body.valid_from, valid_until: body.valid_until, message: body.message }, null, 2));
if (!res.ok || body?.ok !== true) process.exit(1);
