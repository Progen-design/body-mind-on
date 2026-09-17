#!/usr/bin/env node
/**
 * Ověření odkazů na právní texty (Obchodní podmínky, GDPR).
 *
 * PROMPT_UKLID.md (2026-09-17) — přepsáno z `_legacy-next/components/Footer.js`
 * (mrtvá Next.js komponenta, appka footer se stránkami /obchodni-podminky a
 * /gdpr už nemá) na živý zdroj pravdy `lib/pravniOdkazy.js`. Architektura se
 * změnila, ne jen soubor: podmínky a GDPR dnes žijí na veřejném webu
 * (bodyandmindon.cz), appka je SPA a interní /obchodni-podminky by vracelo
 * jen prázdnou skořápku nebo 404 — viz komentář přímo v pravniOdkazy.js.
 * Odkazy v appce (src/components/UcetASpravaSection.tsx) na ně jen míří.
 *
 * Statické kontroly (vždy):
 *   - lib/pravniOdkazy.js má absolutní URL na bodyandmindon.cz (ne SPA cestu)
 *   - UcetASpravaSection.tsx oba odkazy používá a otevírá v novém okně
 *
 * Runtime kontroly (jen s --runtime):
 *   - marketing web skutečně vrací HTTP 200 na obou URL
 *
 * Spuštění:
 *   npm run verify:footer-legal-links
 *   node scripts/verify-footer-legal-links.mjs --runtime
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const RUNTIME = process.argv.includes('--runtime');

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('--- Static legal link checks ---');
const odkazy = readFileSync(join(ROOT, 'lib', 'pravniOdkazy.js'), 'utf8');
const ucet = readFileSync(join(ROOT, 'src', 'components', 'UcetASpravaSection.tsx'), 'utf8');

check('ODKAZ_PODMINKY míří na veřejný web, ne na SPA cestu', /ODKAZ_PODMINKY\s*=\s*`?\$\{WEB\}\/obchodni-podminky/.test(odkazy) || /ODKAZ_PODMINKY\s*=\s*.https:\/\/bodyandmindon\.cz\/obchodni-podminky/.test(odkazy));
check('ODKAZ_GDPR míří na veřejný web, ne na SPA cestu', /ODKAZ_GDPR\s*=\s*`?\$\{WEB\}\/gdpr/.test(odkazy) || /ODKAZ_GDPR\s*=\s*.https:\/\/bodyandmindon\.cz\/gdpr/.test(odkazy));

check('appka odkazy nepočítá znovu, bere je z lib/pravniOdkazy.js', ucet.includes("from '@lib/pravniOdkazy.js'"));
check('odkaz na podmínky se otevírá v novém okně', /href=\{ODKAZ_PODMINKY\}[^>]*target="_blank"/.test(ucet));
check('odkaz na GDPR se otevírá v novém okně', /href=\{ODKAZ_GDPR\}[^>]*target="_blank"/.test(ucet));

const WEB_URL_MATCH = odkazy.match(/const WEB = '([^']+)'/);
const WEB_URL = WEB_URL_MATCH ? WEB_URL_MATCH[1] : 'https://bodyandmindon.cz';

if (RUNTIME) {
  console.log('--- Runtime legal link checks ---');
  for (const path of ['/obchodni-podminky', '/gdpr']) {
    const url = `${WEB_URL}${path}`;
    try {
      const res = await fetch(url, { redirect: 'manual' });
      check(`${url} vrací 200`, res.status === 200, `HTTP ${res.status}`);
    } catch (e) {
      check(`${url} vrací 200`, false, e.message);
    }
  }
} else {
  console.log('(runtime kontroly přeskočeny — spusť s --runtime)');
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
