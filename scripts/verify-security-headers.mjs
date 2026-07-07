#!/usr/bin/env node
/**
 * Ověření security response headers (P3 hardening).
 *
 * Statické kontroly (vždy):
 *   - next.config.js definuje headers() se všemi požadovanými security headers
 *
 * Runtime kontroly (jen s --runtime, po deployi):
 *   - klíčové produkční URL vrací X-Content-Type-Options, Referrer-Policy,
 *     X-Frame-Options, Permissions-Policy, CSP frame-ancestors a HSTS
 *
 * Spuštění:
 *   npm run verify:security-headers
 *   node scripts/verify-security-headers.mjs --runtime
 */
import { readFileSync } from 'fs';
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

console.log('--- Static security header checks ---');
const nextConfig = readFileSync(join(ROOT, 'next.config.js'), 'utf8');

check('next.config.js má headers()', /async headers\(\)/.test(nextConfig));
check('headers platí pro všechny routy', nextConfig.includes("source: '/:path*'"));
check('X-Content-Type-Options nosniff', nextConfig.includes("'X-Content-Type-Options'") && nextConfig.includes("'nosniff'"));
check('Referrer-Policy strict-origin-when-cross-origin', nextConfig.includes("'Referrer-Policy'") && nextConfig.includes("'strict-origin-when-cross-origin'"));
check('X-Frame-Options SAMEORIGIN', nextConfig.includes("'X-Frame-Options'") && nextConfig.includes("'SAMEORIGIN'"));
check('Permissions-Policy omezuje camera/microphone/geolocation', nextConfig.includes("'Permissions-Policy'") && nextConfig.includes('camera=()') && nextConfig.includes('microphone=()') && nextConfig.includes('geolocation=()'));
check('CSP frame-ancestors self', nextConfig.includes("'Content-Security-Policy'") && nextConfig.includes("frame-ancestors 'self'"));
check('CSP bez script-src (nerozbíjí Next inline skripty)', !/script-src/.test(nextConfig));

if (RUNTIME) {
  console.log('--- Runtime security header checks ---');
  const paths = ['/login', '/register', '/profil', '/obchodni-podminky', '/gdpr', '/api/integrations-status'];
  const isLocal = /localhost|127\.0\.0\.1/.test(BASE_URL);
  const expected = [
    ['x-content-type-options', /^nosniff$/i],
    ['referrer-policy', /strict-origin-when-cross-origin/i],
    ['x-frame-options', /^SAMEORIGIN$/i],
    ['permissions-policy', /camera=\(\)/i],
    ['content-security-policy', /frame-ancestors 'self'/i],
    // HSTS přidává Vercel edge — na localhost není a nemá být
    ...(isLocal ? [] : [['strict-transport-security', /max-age=\d+/i]]),
  ];
  for (const path of paths) {
    const url = `${BASE_URL}${path}`;
    try {
      const res = await fetch(url, { redirect: 'manual' });
      for (const [key, re] of expected) {
        const value = res.headers.get(key);
        check(`${path} ${key}`, value !== null && re.test(value), value || 'missing');
      }
    } catch (e) {
      check(`${url} dosažitelná`, false, e.message);
    }
  }
} else {
  console.log('(runtime kontroly přeskočeny — spusť s --runtime po deployi)');
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
