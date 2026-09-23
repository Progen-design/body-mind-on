/**
 * Banner „Přidat na plochu" — kdy se ukáže (standalone / zavřeno / platforma).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  INFO_APPKA_KRATCE,
  INFO_APPKA_VE_VYVOJI,
  KLIC_ZAVRENO,
  KROKY,
  PODNADPIS_INSTALACE,
  KROK_INAPP,
  PLATNOST_ZAVRENI_DNI,
  POZNAMKA_ZNOVU,
  URL_NAVODU,
  jeStandalone,
  jeZavreno,
  maZobrazitBanner,
  nabidnoutNavod,
  pocetKrokuNavodu,
  popisekTlacitkaBanneru,
  prohlizecZParametru,
  rozpoznejProhlizec,
  umiTlacitkoInstalace,
  urciPlatformu,
  uvodKroku,
  type Prohlizec,
  type RozpoznanyProhlizec,
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

test('trvalé vstupy: menu a login vedou na /instalace', () => {
  const header = cti('../components/Header.tsx');
  assert.match(header, /!beziZPlochy\(\) && \(/);
  assert.match(header, /naviguj\(CESTA_INSTALACE\)/);
  assert.match(header, /<span>Přidat na plochu<\/span>/);

  const login = cti('../components/LoginScreen.tsx');
  assert.match(login, /nabidnoutNavod\(osTohotoZarizeni\(\), beziZPlochy\(\)\)/);
  assert.match(login, /Chceš BMON jako appku\? Návod →/);
});

test('banner: „Nainstalovat" jen Android s výzvou, jinak „Návod (N kroky)" → /instalace', () => {
  const banner = cti('../components/InstallBanner.tsx');
  assert.match(banner, /const instalujRovnou = platforma === 'android' && maVyzvu;/);
  assert.match(banner, /popisekTlacitkaBanneru\(\s*instalujRovnou,/);
  assert.doesNotMatch(banner, /'Jak na to'/);
  assert.match(banner, /if \(!instalujRovnou \|\| !vyzva\) \{\s*naviguj\(CESTA_INSTALACE\)/);
  assert.doesNotMatch(banner, /navodIos/, 'iOS popup se vrátil');
});

test('QR se kreslí lokálně z balíčku qrcode, ne z cizího endpointu', () => {
  const navod = cti('../components/InstalaceNavod.tsx');
  assert.match(navod, /import\('qrcode'\)/);
  assert.doesNotMatch(navod, /api\.qrserver|chart\.googleapis|quickchart|<img[^>]+qr/i);
});

// ---------------------------------------------------------------- prohlížeč z user-agenta
//
// Reálné UA z 09/2026. iOS 26 Safari má v UA zmražené „iPhone OS 18_6"
// a „Version/26.0".

const UA_PROHLIZECU: Array<[string, string, RozpoznanyProhlizec]> = [
  ['iOS 26 Safari',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    { platforma: 'ios', prohlizec: 'safari' }],
  ['iOS Chrome (CriOS)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1',
    { platforma: 'ios', prohlizec: 'chrome' }],
  ['iOS Firefox (FxiOS)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
    { platforma: 'ios', prohlizec: 'firefox' }],
  ['iOS Edge (EdgiOS)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/140.0.3485.54 Version/18.0 Mobile/15E148 Safari/604.1',
    { platforma: 'ios', prohlizec: 'edge' }],
  ['Instagram iOS',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 398.0.0.28.93 (iPhone15,3; iOS 18_6; cs_CZ; cs; scale=3.00; 1290x2796; 745216874)',
    { platforma: 'ios', prohlizec: 'inapp' }],
  ['Facebook Android (FB_IAB/FBAV)',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.7339.51 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/490.0.0.44.109;]',
    { platforma: 'android', prohlizec: 'inapp' }],
  ['Android Chrome',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    { platforma: 'android', prohlizec: 'chrome' }],
  ['Samsung Internet',
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
    { platforma: 'android', prohlizec: 'samsung' }],
  ['Android Edge (EdgA)',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0',
    { platforma: 'android', prohlizec: 'edge' }],
  ['Firefox Android',
    'Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
    { platforma: 'android', prohlizec: 'firefox' }],
];

for (const [nazev, ua, ocekavano] of UA_PROHLIZECU) {
  test(`rozpoznejProhlizec: ${nazev}`, () => {
    assert.deepEqual(rozpoznejProhlizec(ua), ocekavano);
  });
}

test('rozpoznejProhlizec: FBAN (Facebook iOS), Messenger, TikTok, LinkedIn jsou in-app', () => {
  const zaklad = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  for (const znacka of ['[FBAN/FBIOS;FBAV/490.0]', 'Messenger', 'musical_ly_40.1.0 TikTok', 'LinkedInApp', 'MicroMessenger/8.0']) {
    assert.equal(rozpoznejProhlizec(`${zaklad} ${znacka}`).prohlizec, 'inapp', znacka);
  }
  // „Linux" v Android UA není aplikace Line.
  assert.equal(rozpoznejProhlizec(UA.android).prohlizec, 'chrome');
});

test('rozpoznejProhlizec: počítač je desktop, iPadOS (Mac s dotykem) iOS', () => {
  assert.equal(rozpoznejProhlizec(UA.desktop).platforma, 'desktop');
  assert.equal(rozpoznejProhlizec(UA.ipadOs, 5).platforma, 'ios');
  assert.equal(rozpoznejProhlizec(UA.ipadOs, 0).platforma, 'desktop', 'Mac bez dotyku dostane QR');
});

// ---------------------------------------------------------------- kroky

const PROHLIZECE: Prohlizec[] = ['safari', 'chrome', 'firefox', 'edge', 'samsung', 'inapp', 'jiny'];

test('pro každou kombinaci platformy a prohlížeče existují kroky', () => {
  for (const platforma of ['ios', 'android'] as const) {
    for (const prohlizec of PROHLIZECE) {
      const kroky = KROKY[platforma][prohlizec];
      assert.ok(kroky.length > 0, `${platforma}/${prohlizec} nemá kroky`);
      for (const k of kroky) assert.ok(k.text.trim().length > 0 && k.ikona, `${platforma}/${prohlizec}: prázdný krok`);
    }
  }
});

test('in-app: zvýrazněný krok „Otevřít v prohlížeči", pod ním kroky Safari / Chromu', () => {
  for (const platforma of ['ios', 'android'] as const) {
    const [prvni, ...zbytek] = KROKY[platforma].inapp;
    assert.equal(prvni, KROK_INAPP);
    assert.equal(prvni.zvyrazneny, true);
    assert.match(prvni.text, /Otevřít v prohlížeči/);
    assert.deepEqual(zbytek, KROKY[platforma][platforma === 'ios' ? 'safari' : 'chrome']);
  }
});

test('iOS Safari: 4 kroky, první do menu vedle adresy (iOS 26)', () => {
  const kroky = KROKY.ios.safari.map((k) => k.text);
  assert.equal(kroky.length, 4);
  assert.match(kroky[0], /vedle adresy/);
  assert.match(kroky[0], /na starším iOS na ikonu Sdílet dole/);
  assert.equal(kroky[1], 'Vyber Sdílet.');
  assert.match(kroky[2], /Přidat na plochu/);
  assert.match(kroky[3], /Otevřít jako webovou aplikaci/);
});

test('iOS Chrome / Firefox / Edge mají vlastní kroky, ne Safari', () => {
  assert.match(KROKY.ios.chrome[0].text, /Sdílet \(nahoře vpravo nebo v menu ⋯\)/);
  assert.match(KROKY.ios.firefox[0].text, /Otevři menu ≡ \/ ⋯/);
  assert.equal(KROKY.ios.edge, KROKY.ios.firefox);
});

test('Android: Chrome/Edge přes ⋮ nahoře, Samsung přes ≡ dole, Firefox přes ⋮', () => {
  assert.match(KROKY.android.chrome[0].text, /⋮ vpravo nahoře/);
  assert.match(KROKY.android.chrome[1].text, /Přidat na plochu \/ Nainstalovat aplikaci/);
  assert.equal(KROKY.android.edge, KROKY.android.chrome);
  assert.match(KROKY.android.samsung[0].text, /≡ vpravo dole/);
  assert.match(KROKY.android.firefox[0].text, /⋮/);
  assert.match(KROKY.android.jiny[0].text, /V menu prohlížeče najdi Sdílet nebo Přidat na plochu/);
});

test('tlačítko „Nainstalovat aplikaci" jen Android Chrome / Edge / Samsung', () => {
  assert.equal(umiTlacitkoInstalace({ platforma: 'android', prohlizec: 'chrome' }), true);
  assert.equal(umiTlacitkoInstalace({ platforma: 'android', prohlizec: 'edge' }), true);
  assert.equal(umiTlacitkoInstalace({ platforma: 'android', prohlizec: 'samsung' }), true);
  assert.equal(umiTlacitkoInstalace({ platforma: 'android', prohlizec: 'firefox' }), false);
  assert.equal(umiTlacitkoInstalace({ platforma: 'android', prohlizec: 'inapp' }), false);
  assert.equal(umiTlacitkoInstalace({ platforma: 'ios', prohlizec: 'chrome' }), false);
});

test('nadpis nad kroky podle prohlížeče', () => {
  assert.equal(uvodKroku('safari'), 'Postup v Safari (nic tady neklikáš):');
  assert.equal(uvodKroku('firefox'), 'Postup ve Firefoxu (nic tady neklikáš):');
  assert.equal(uvodKroku('samsung'), 'Postup v Samsung Internetu (nic tady neklikáš):');
});

test('poznámka o Safari je pryč (iOS Chrome/Firefox/Edge to umí od 16.4), zůstává „smaž a přidej znovu"', () => {
  assert.match(POZNAMKA_ZNOVU, /smaž ikonu z plochy a přidej ji znovu/);
  for (const soubor of ['./instalace.ts', '../components/InstalaceNavod.tsx']) {
    const kod = cti(soubor).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(kod, /Funguje jen v Safari/, `${soubor}: vrátila se špatná poznámka`);
  }
});

test('?ua= přepíše detekci jen známými hodnotami', () => {
  assert.deepEqual(prohlizecZParametru('ios-chrome'), { platforma: 'ios', prohlizec: 'chrome' });
  assert.deepEqual(prohlizecZParametru('inapp-android'), { platforma: 'android', prohlizec: 'inapp' });
  assert.equal(prohlizecZParametru('desktop')?.platforma, 'desktop');
  for (const hodnota of ['ios-safari', 'ios-firefox', 'ios-edge', 'android-chrome', 'android-firefox', 'android-samsung', 'inapp-ios']) {
    assert.ok(prohlizecZParametru(hodnota), hodnota);
  }
  assert.equal(prohlizecZParametru('nesmysl'), null);
  assert.equal(prohlizecZParametru(null), null);
});

test('kroky návodu nevypadají jako tlačítka (kromě zvýrazněného in-app kroku)', () => {
  const navod = cti('../components/InstalaceNavod.tsx');
  const krok = navod.slice(navod.indexOf('const Krok: React.FC'), navod.indexOf('const KopirovatOdkaz'));
  assert.ok(krok.length > 0, 'komponenta Krok nenalezena');
  assert.doesNotMatch(krok, /hover:|active:|cursor-pointer|<button|onClick/, 'krok vypadá nebo se chová jako tlačítko');
  assert.match(krok, /border-b/, 'kroky dělí tenká linka');
  // Rámeček a pozadí smí mít jen zvýrazněný krok 0 v in-app prohlížeči.
  assert.match(krok, /krok\.zvyrazneny \? '[^']*rounded-xl[^']*' : ''/);
});

test('návod i banner berou výzvu ze společného posluchače (main.tsx), ne z vlastního', () => {
  const navod = cti('../components/InstalaceNavod.tsx');
  assert.match(navod, /odebirejVyzvu\(/);
  assert.match(navod, /spotrebujVyzvu\(\)/);
  assert.doesNotMatch(navod, /addEventListener\('beforeinstallprompt'/);
  assert.match(cti('../main.tsx'), /zachytVyzvuInstalace\(\)/);
});

// ---------------------------------------------------------------- nativní appka ve vývoji

test('/instalace: podnadpis bez slibu „jedno klepnutí" a box „ve vývoji" nad kroky', () => {
  assert.equal(PODNADPIS_INSTALACE, 'Zatím bez App Storu — přidáš si ji na plochu z prohlížeče.');
  assert.match(INFO_APPKA_VE_VYVOJI, /App Store a Google Play je ve vývoji/);

  const navod = cti('../components/InstalaceNavod.tsx');
  assert.match(navod, /\{PODNADPIS_INSTALACE\}/);
  assert.doesNotMatch(navod, /Jedno klepnutí/, 'vrátil se starý podnadpis');
  assert.match(navod, /\{INFO_APPKA_VE_VYVOJI\}/, '/instalace neříká, že appka je ve vývoji');
  // Na Androidu s tlačítkem je box až pod tlačítkem, jinak nad kroky.
  const tlacitko = navod.indexOf('{tlacitko && <TlacitkoInstalace />}');
  const box = navod.indexOf('<InfoAppka />', tlacitko);
  const kroky = navod.indexOf('{uvodKroku(prohlizec.prohlizec)}');
  assert.ok(tlacitko > -1 && box > tlacitko && box < kroky, 'box musí být pod tlačítkem a nad kroky');
  // Neutrální, ne varovný.
  const info = navod.slice(navod.indexOf('const InfoAppka'), navod.indexOf('const Hotovo'));
  assert.doesNotMatch(info, /amber|red-|rose-/, 'box vypadá jako varování');
});

test('login: pod odkazem na návod krátká poznámka „ve vývoji"', () => {
  assert.match(INFO_APPKA_KRATCE, /ve vývoji/);
  const login = cti('../components/LoginScreen.tsx');
  const odkaz = login.indexOf('Chceš BMON jako appku? Návod →');
  const poznamka = login.indexOf('{INFO_APPKA_KRATCE}');
  assert.ok(odkaz > -1 && poznamka > odkaz, 'poznámka chybí nebo je nad odkazem');
  // Jen v bloku podmíněném mobilem mimo standalone.
  const blok = login.slice(login.indexOf('nabidnoutNavod(osTohotoZarizeni(), beziZPlochy()) && ('), poznamka);
  assert.ok(blok.length > 0 && !blok.includes(')}\n\n'), 'poznámka je mimo podmínku mobil / prohlížeč');
});

test('popisek tlačítka banneru: Nainstalovat, nebo Návod s počtem kroků prohlížeče', () => {
  assert.equal(popisekTlacitkaBanneru(true, 4), 'Nainstalovat');
  assert.equal(popisekTlacitkaBanneru(false, pocetKrokuNavodu({ platforma: 'ios', prohlizec: 'safari' })), 'Návod (4 kroky)');
  assert.equal(popisekTlacitkaBanneru(false, pocetKrokuNavodu({ platforma: 'ios', prohlizec: 'chrome' })), 'Návod (3 kroky)');
  assert.equal(popisekTlacitkaBanneru(false, 5), 'Návod (5 kroků)');
  assert.equal(popisekTlacitkaBanneru(false, 0), 'Návod');
});
