import fs from 'node:fs';

const env = {};
for (const r of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
  if (m && !r.trim().startsWith('#')) env[m[1]] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
}
const TOKEN = env.ADMIN_TOKEN;
if (!TOKEN) { console.error('ADMIN_TOKEN nenalezen'); process.exit(1); }

const BASE = process.env.BMON_BASE || 'https://app.bodyandmindon.cz';
const dry = process.argv.includes('--dry');
const ids = process.argv.filter((a) => /^\d+$/.test(a)).map(Number);

for (const id of ids) {
  const url = `${BASE}/api/admin/generate-recipes?queue_id=${id}&dry_run=${dry}`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await r.json().catch(() => ({ parse_error: true }));
  console.log(`\n=== queue ${id} | HTTP ${r.status} | dry_run=${dry} ===`);
  console.log(JSON.stringify({
    ok: j.ok, dry_run: j.dry_run, zapsano: j.zapsano,
    cena_usd: j.cena_usd, error: j.error,
    plan: j.plan, zahozeno: j.zahozeno,
  }, null, 2));
}
