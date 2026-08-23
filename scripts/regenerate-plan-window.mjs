// Jednorazovy beh: pregenerovat plan pro konkretni okno, aby jidelnicek
// sedel na ULOZENY cil v body_metrics (B 185 / S 205 / T 67), ne na cil
// zamrzly v planu z 13. 8. (B 158 / S 232 / T 67).
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
  } catch { /* volitelne */ }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const token = process.env.ADMIN_TOKEN;
if (!token) { console.error('ADMIN_TOKEN chybi'); process.exit(1); }

const [email, validFrom, validUntil] = process.argv.slice(2);
if (!email || !validFrom || !validUntil) {
  console.error('pouziti: node scripts/_regen_okno.mjs <email> <YYYY-MM-DD> <YYYY-MM-DD>');
  process.exit(1);
}

const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const url = `${base}/api/admin/regenerate-user-plan`;

console.log(`-> ${email}  ${validFrom} .. ${validUntil}`);

const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email,
    skip_email: true,
    valid_from: validFrom,
    valid_until: validUntil,
    deactivate_old: false,
    generated_by: 'admin-regen-ulozeny-cil',
  }),
  signal: AbortSignal.timeout(300000),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text.slice(0, 2000));
process.exit(res.ok ? 0 : 1);
