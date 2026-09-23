/**
 * Banner „Přidat na plochu" — kdy se ukáže (standalone / zavřeno / platforma).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  KLIC_ZAVRENO,
  PLATNOST_ZAVRENI_DNI,
  URL_NAVODU,
  jeStandalone,
  jeZavreno,
  maZobrazitBanner,
  nabidnoutNavod,
  urciOs,
  urciPlatformu,
  variantaNavodu,
  type StavInstalace,
} from './instalace.ts';
import { CESTA_INSTALACE, jePlatnaCesta } from '../routing.ts';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0',
};

const DEN = 24 * 60 * 60 * 1000;
const TED = Date.parse('2026-09-24T12:00:00Z');

const zaklad: StavInstalace = { prihlasen: true, platforma: 'android', standalone: false, zavreno: false, maVyzvu: true };

// ---------------------------------------------------------------- platforma

test('platforma: iPhone i iPadOS (Mac s dotykem) jsou iOS', () => {
  assert.equal(urciPlatformu(UA.iphone), 'ios');
  assert.equal(urciPlatformu(UA.ipadOs, 5), 'ios');
  assert.equal(urciPlatformu(UA.ipadOs, 0), 'jine', 'skutečný Mac bez dotyku není iOS');
});

test('platforma: Android, desktop, vestavěný prohlížeč Instagramu', () => {
  assert.equal(urciPlatformu(UA.android), 'android');
  assert.equal(urciPlatformu(UA.desktop), 'jine');
  assert.equal(urciPlatformu(UA.instagram), 'jine', 'in-app prohlížeč na plochu přidat neumí');
  assert.equal(urciPlatformu(''), 'jine');
});

// ---------------------------------------------------------------- standalone

test('standalone: display-mode nebo navigator.standalone (starší iOS)', () => {
  assert.equal(jeStandalone(true), true);
  assert.equal(jeStandalone(false, true), true);
  assert.equal(jeStandalone(false, false), false);
  assert.equal(jeStandalone(false, undefined), false);
});

// ---------------------------------------------------------------- zavřeno

test(`zavřeno: platí ${PLATNOST_ZAVRENI_DNI} dní, pak se banner vrátí`, () => {
  assert.equal(KLIC_ZAVRENO, 'bmon_install_dismissed');
  assert.equal(jeZavreno(String(TED - 1 * DEN), TED), true);
  assert.equal(jeZavreno(String(TED - 29 * DEN), TED), true);
  assert.equal(jeZavreno(String(TED - 30 * DEN), TED), false);
  assert.equal(jeZavreno(String(TED - 45 * DEN), TED), false);
});

test('zavřeno: prázdná nebo nečitelná hodnota = nezavřeno', () => {
  assert.equal(jeZavreno(null, TED), false);
  assert.equal(jeZavreno('', TED), false);
  assert.equal(jeZavreno('ano', TED), false);
  assert.equal(jeZavreno('0', TED), false);
});

// ---------------------------------------------------------------- rozhodnutí

test('Android se zachycenou výzvou: ukázat', () => {
  assert.equal(maZobrazitBanner(zaklad), true);
});

test('Android bez výzvy (Firefox, nebo už nainstalováno): neukázat — tlačítko by nic neudělalo', () => {
  assert.equal(maZobrazitBanner({ ...zaklad, maVyzvu: false }), false);
});

test('iOS: ukázat i bez výzvy (Safari žádnou nemá, jde návod)', () => {
  assert.equal(maZobrazitBanner({ ...zaklad, platforma: 'ios', maVyzvu: false }), true);
});

test('už běží z plochy: neukázat', () => {
  assert.equal(maZobrazitBanner({ ...zaklad, standalone: true }), false);
  assert.equal(maZobrazitBanner({ ...zaklad, platforma: 'ios', standalone: true }), false);
});

test('zavřeno „Teď ne": neukázat', () => {
  assert.equal(maZobrazitBanner({ ...zaklad, zavreno: true }), false);
  assert.equal(maZobrazitBanner({ ...zaklad, platforma: 'ios', zavreno: true }), false);
});

test('nepřihlášený: neukázat', () => {
  assert.equal(maZobrazitBanner({ ...zaklad, prihlasen: false }), false);
});

test('desktop: neukázat ani s výzvou (Chrome ji pošle i na počítači)', () => {
  assert.equal(maZobrazitBanner({ ...zaklad, platforma: 'jine' }), false);
});

// ---------------------------------------------------------------- soubory PWA

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('manifest: povinná pole a ikony 192, 512 a 512 maskable', () => {
  const m = JSON.parse(cti('../../public/manifest.webmanifest'));
  assert.equal(m.name, 'Body & Mind ON');
  assert.equal(m.short_name, 'BMON');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'cs');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  const ikony = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  assert.deepEqual(ikony.sort(), ['192x192:any', '512x512:any', '512x512:maskable']);
  for (const i of m.icons) readFileSync(new URL(`../../public${i.src}`, import.meta.url));
});

test('Vercel: manifest a sw.js nejdou na index.html a mají správný Content-Type', () => {
  const vercel = JSON.parse(cti('../../vercel.json'));
  const spa = new RegExp(`^${vercel.rewrites[0].source}$`);
  assert.equal(spa.test('/manifest.webmanifest'), false, 'manifest by vracel SPA');
  assert.equal(spa.test('/sw.js'), false, 'sw.js by vracel SPA');
  assert.equal(spa.test('/komunita'), true, 'SPA cesty dál na index.html');

  const hlavicky = (cesta: string) =>
    vercel.headers.find((h: { source: string }) => h.source === cesta)?.headers ?? [];
  assert.ok(
    hlavicky('/manifest.webmanifest').some((h: { key: string; value: string }) => h.key === 'Content-Type' && h.value.startsWith('application/manifest+json')),
  );
  assert.ok(hlavicky('/sw.js').some((h: { key: string; value: string }) => h.key === 'Cache-Control' && /no-cache/.test(h.value)));
});

test('sw.js nic necachuje a nevolá respondWith', () => {
  const sw = cti('../../public/sw.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(sw, /caches\./);
  assert.doesNotMatch(sw, /respondWith/);
  assert.doesNotMatch(sw, /addEventListener\('push'/);
});

test('index.html má manifest, apple-touch-icon a meta pro iOS', () => {
  const html = cti('../../index.html');
  for (const vzor of [
    /<link rel="manifest" href="\/manifest\.webmanifest"/,
    /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/,
    /<meta name="theme-color"/,
    /<meta name="apple-mobile-web-app-capable" content="yes"/,
    /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/,
    /<meta name="apple-mobile-web-app-title" content="BMON"/,
  ]) assert.match(html, vzor);
});

// ---------------------------------------------------------------- trvalý návod /instalace

test('varianta návodu: iOS, Android, desktop', () => {
  assert.equal(variantaNavodu(urciOs(UA.iphone), false), 'ios');
  assert.equal(variantaNavodu(urciOs(UA.ipadOs, 5), false), 'ios');
  assert.equal(variantaNavodu(urciOs(UA.android), false), 'android');
  assert.equal(variantaNavodu(urciOs(UA.desktop), false), 'desktop');
  assert.equal(variantaNavodu(urciOs(UA.ipadOs, 0), false), 'desktop', 'Mac bez dotyku dostane QR');
});

test('varianta návodu: standalone přebíjí platformu — „Máš hotovo"', () => {
  for (const os of ['ios', 'android', 'desktop'] as const) {
    assert.equal(variantaNavodu(os, true), 'standalone');
  }
});

test('varianta návodu: Instagram na iPhonu je iOS (s poznámkou o Safari), ne QR pro počítač', () => {
  assert.equal(urciOs(UA.instagram), 'ios');
  assert.equal(variantaNavodu(urciOs(UA.instagram), false), 'ios');
  // Banner ho naopak vynechává — přidat na plochu v in-app prohlížeči nejde.
  assert.equal(urciPlatformu(UA.instagram), 'jine');
});

test('odkaz na návod (login, profil): jen mobil mimo standalone', () => {
  assert.equal(nabidnoutNavod('ios', false), true);
  assert.equal(nabidnoutNavod('android', false), true);
  assert.equal(nabidnoutNavod('desktop', false), false);
  assert.equal(nabidnoutNavod('ios', true), false);
});

test('/instalace je platná veřejná cesta a QR na ni míří', () => {
  assert.equal(CESTA_INSTALACE, '/instalace');
  assert.equal(jePlatnaCesta(CESTA_INSTALACE), true);
  assert.equal(URL_NAVODU, `https://app.bodyandmindon.cz${CESTA_INSTALACE}`);

  // Veřejná = App.tsx ji vykreslí DŘÍV, než se ptá na přihlášení.
  const app = cti('../App.tsx');
  const navod = app.indexOf('if (cesta === CESTA_INSTALACE)');
  assert.ok(navod > -1, 'App.tsx /instalace nevykresluje');
  assert.ok(navod < app.indexOf('if (!isAuthenticated) {'), '/instalace by chtěla přihlášení');
  assert.match(cti('../../middleware.ts'), /'\/instalace'/, 'bodyandmindon.cz/instalace by nevedla do appky');
});

test('trvalé vstupy: menu, login, banner na iOS vede na /instalace', () => {
  const header = cti('../components/Header.tsx');
  assert.match(header, /!beziZPlochy\(\) && \(/);
  assert.match(header, /naviguj\(CESTA_INSTALACE\)/);
  assert.match(header, /<span>Přidat na plochu<\/span>/);

  const login = cti('../components/LoginScreen.tsx');
  assert.match(login, /nabidnoutNavod\(osTohotoZarizeni\(\), beziZPlochy\(\)\)/);
  assert.match(login, /Chceš BMON jako appku\? Návod →/);

  const banner = cti('../components/InstallBanner.tsx');
  assert.match(banner, /if \(platforma === 'ios'\) \{\s*naviguj\(CESTA_INSTALACE\)/);
  assert.doesNotMatch(banner, /navodIos/, 'iOS popup se vrátil');
});

test('QR se kreslí lokálně z balíčku qrcode, ne z cizího endpointu', () => {
  const navod = cti('../components/InstalaceNavod.tsx');
  assert.match(navod, /import\('qrcode'\)/);
  assert.doesNotMatch(navod, /api\.qrserver|chart\.googleapis|quickchart|<img[^>]+qr/i);
});
