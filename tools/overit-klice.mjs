// Overi, jestli Supabase klice z produkce doopravdy funguji.
// Tiskne jen stavovy kod a kratkou zpravu - nikdy hodnotu klice.
import fs from 'node:fs';

const soubor = process.argv[2] || '.env.vercel-prod.tmp';
const env = {};
for (const radek of fs.readFileSync(soubor, 'utf8').split(/\r?\n/)) {
  const m = radek.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL: ' + url);
console.log('publishable delka: ' + (anon?.length ?? 0) + ', service delka: ' + (svc?.length ?? 0));

async function zkus(popis, cesta, klic, sBearer = false) {
  try {
    const r = await fetch(url + cesta, {
      headers: { apikey: klic, ...(sBearer ? { Authorization: 'Bearer ' + klic } : {}) }
    });
    const text = (await r.text()).slice(0, 130);
    console.log(`${popis.padEnd(34)} HTTP ${r.status}  ${r.ok ? 'OK' : text}`);
  } catch (e) {
    console.log(`${popis.padEnd(34)} CHYBA ${e.message}`);
  }
}

await zkus('settings + publishable', '/auth/v1/settings', anon);
await zkus('settings + service', '/auth/v1/settings', svc);
await zkus('admin/users + service', '/auth/v1/admin/users?page=1&per_page=1', svc, true);
await zkus('rest tabulka + service', '/rest/v1/recipes_catalog?select=id&limit=1', svc, true);
