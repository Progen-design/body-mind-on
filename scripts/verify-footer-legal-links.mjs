#!/usr/bin/env node
/**
 * Ověření footer legal odkazů (Obchodní podmínky, GDPR).
 *
 * Statické kontroly (vždy):
 *   - Footer odkazuje na app-local /obchodni-podminky a /gdpr
 *   - stránky pages/obchodni-podminky.js a pages/gdpr.js existují
 *
 * Runtime kontroly (jen s --runtime, po deployi):
 *   - BASE_URL/obchodni-podminky a BASE_URL/gdpr vrací HTTP 200
 *
 * Spuštění:
 *   npm run verify:footer-legal-links
 *   BASE_URL=https://app.bodyandmindon.cz node scripts/verify-footer-legal-links.mjs --runtime
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
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

console.log('--- Static footer legal link checks ---');
const footer = readFileSync(join(ROOT, 'components', 'Footer.js'), 'utf8');

check('footer odkazuje na /obchodni-podminky', /href="\/obchodni-podminky"/.test(footer));
check('footer odkazuje na /gdpr', /href="\/gdpr"/.test(footer));
check('footer bez odkazu na main-site obchodni-podminky', !/bodyandmindon\.cz\/obchodni-podminky|\$\{main\}\/obchodni-podminky/.test(footer));
check('footer bez odkazu na main-site gdpr', !/bodyandmindon\.cz\/gdpr|\$\{main\}\/gdpr/.test(footer));
check('footer má kontakt mailto', /mailto:info@bodyandmindon\.cz/.test(footer));

check('stránka pages/obchodni-podminky.js existuje', existsSync(join(ROOT, 'pages', 'obchodni-podminky.js')));
check('stránka pages/gdpr.js existuje', existsSync(join(ROOT, 'pages', 'gdpr.js')));

const podminkyPage = readFileSync(join(ROOT, 'pages', 'obchodni-podminky.js'), 'utf8');
const gdprPage = readFileSync(join(ROOT, 'pages', 'gdpr.js'), 'utf8');
check('obchodni-podminky má český obsah', /Obchodní podmínky/.test(podminkyPage));
check('gdpr má český obsah', /osobních údajů/.test(gdprPage));

if (RUNTIME) {
  console.log('--- Runtime legal link checks ---');
  for (const path of ['/obchodni-podminky', '/gdpr']) {
    const url = `${BASE_URL}${path}`;
    try {
      const res = await fetch(url, { redirect: 'manual' });
      check(`${url} vrací 200`, res.status === 200, `HTTP ${res.status}`);
    } catch (e) {
      check(`${url} vrací 200`, false, e.message);
    }
  }
} else {
  console.log('(runtime kontroly přeskočeny — spusť s --runtime po deployi)');
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
