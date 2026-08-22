// Druhy pokus. Minule jsem hodnoty z .env souboru nerozbaloval spravne:
// vercel env pull zapisuje hodnoty v uvozovkach a escapuje v nich \n, takze
// jsem publishable klic testoval vcetne zpetnych lomitek a vysel jako neplatny.
// Tady se hodnota nejdriv rozbali a az pak testuje.
import fs from 'node:fs';

const soubor = process.argv[2] || '.env.vercel-prod.tmp';

function rozbal(surova) {
  let v = surova.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
}

const env = {};
for (const radek of fs.readFileSync(soubor, 'utf8').split(/\r?\n/)) {
  const m = radek.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = rozbal(m[2]);
}

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const svc = env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('po rozbaleni — publishable delka: ' + anon.length + ', service delka: ' + svc.length);
console.log('publishable se shoduje s klicem projektu: ' +
  (anon === 'sb_publishable_yLi5pRxdO4tRa9ICz2XHfw_6TMH7zXx'));

async function zkus(popis, cesta, klic, bearer = false) {
  const r = await fetch(url + cesta, {
    headers: { apikey: klic, ...(bearer ? { Authorization: 'Bearer ' + klic } : {}) }
  });
  const t = (await r.text()).slice(0, 120);
  console.log(`${popis.padEnd(30)} HTTP ${r.status}  ${r.ok ? 'OK' : t}`);
}

await zkus('publishable /auth/settings', '/auth/v1/settings', anon);
await zkus('service /auth/settings', '/auth/v1/settings', svc);
await zkus('service admin/users', '/auth/v1/admin/users?page=1&per_page=1', svc, true);
