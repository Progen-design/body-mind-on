/**
 * PLATNE_CESTY je jediny zdroj pravdy pro to, kterou cestu App.tsx obsluhuje
 * misto 404 (viz komentar v routing.ts a App.tsx). Test dva veci:
 *
 * 1) jePlatnaCesta() sedi na cesty, ktere App.tsx opravdu vetvi jinak nez
 *    <StrankaNeexistuje /> — cteno primo ze zdrojaku App.tsx, aby test
 *    spadl, kdyby nekdo pridal vetveni na cestu bez pridani do PLATNE_CESTY
 *    (nebo naopak).
 * 2) App.tsx pouziva jePlatnaCesta() jako uplne prvni branchovaci podminku
 *    a odkaz zpet ve StrankaNeexistuje miri na platnou cestu (jinak by
 *    404 vedla na dalsi 404).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CESTY_REGISTRACE,
  CESTA_KOMUNITA,
  CESTA_PRIHLASENI,
  CESTA_PROFIL,
  PLATNE_CESTY,
  jePlatnaCesta,
  bezpecnyRedirect,
  cestaProZalozku,
  zalozkaZCesty
} from './routing.ts';

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('zname cesty projdou', () => {
  for (const cesta of ['/', CESTA_PRIHLASENI, CESTA_PROFIL, CESTA_KOMUNITA, ...CESTY_REGISTRACE]) {
    assert.equal(jePlatnaCesta(cesta), true, `${cesta} musí být platná`);
  }
});

test('neznama cesta neprojde', () => {
  for (const cesta of ['/gdpr', '/trener', '/cokoliv-neexistujici', '/Profil', '/login/extra']) {
    assert.equal(jePlatnaCesta(cesta), false, `${cesta} nesmí být platná`);
  }
});

test('App.tsx overuje jePlatnaCesta() jako prvni vetev pred rendrem registrace/loginu/profilu', () => {
  const app = cti('./App.tsx');

  const poziceKontroly = app.indexOf('if (!jePlatnaCesta(cesta))');
  assert.ok(poziceKontroly >= 0, 'App.tsx musí volat jePlatnaCesta() jako strážce');

  const poziceRegistrace = app.indexOf('CESTY_REGISTRACE as readonly string[]).includes(cesta)');
  const poziceLogin = app.indexOf('if (!isAuthenticated)');
  assert.ok(poziceRegistrace >= 0 && poziceLogin >= 0, 'očekávaná vetvení musí v App.tsx existovat');
  assert.ok(
    poziceKontroly < poziceRegistrace && poziceKontroly < poziceLogin,
    '404 kontrola musí běžet dřív než větvení na registraci a přihlášení'
  );

  assert.match(app, /return <StrankaNeexistuje \/>/);
});

test('App.tsx vetvi registraci pres sdileny seznam CESTY_REGISTRACE, ne pres natvrdo psane retezce', () => {
  const app = cti('./App.tsx');
  assert.match(app, /CESTY_REGISTRACE as readonly string\[\]\)\.includes\(cesta\)/);
});

test('odkaz zpet ve StrankaNeexistuje miri na platnou cestu', () => {
  const komponenta = cti('./components/StrankaNeexistuje.tsx');
  const shoda = komponenta.match(/naviguj\(('|")([^'"]*)\1\)/);
  assert.ok(shoda, 'StrankaNeexistuje musí volat naviguj() s pevnou cestou');
  assert.equal(jePlatnaCesta(shoda![2]), true, 'cíl odkazu zpět nesmí sám skončit na 404');
});

test('PLATNE_CESTY obsahuje presne ocekavanou mnozinu — zadna navic, zadna chybi', () => {
  // `/admin/integrace` (22. 9. 2026) je v seznamu schvalne, prestoze na ni
  // nevede zadny odkaz: bez toho by ji App.tsx poslala na 404 driv, nez by
  // se vykreslila. Opravneni resi ADMIN_TOKEN na serveru, ne tenhle seznam.
  assert.deepEqual(
    [...PLATNE_CESTY].sort(),
    ['/', '/admin/integrace', '/instalace', '/komunita', '/login', '/profil', '/register', '/signup', '/start'].sort()
  );
});

test('na admin integrace nevede odkaz z bezne navigace', () => {
  // Stranka neni tajna (opravneni drzi server), ale patri mimo produktovou
  // cestu — odkaz v UI by ji nabidl lidem, pro ktere neni.
  const app = cti('./App.tsx');
  assert.match(app, /cesta === CESTA_ADMIN_INTEGRACE/, 'vetev pro admin stranku chybi');
  assert.doesNotMatch(app, /naviguj\((['"])\/admin\/integrace\)/, 'z appky vede odkaz na admin stranku');
});

// PROMPT_UKLID.md (2026-09-17) — `naviguj()` udělá `window.location.href = kam`
// pro cokoli, co začíná `http`. `?redirect=` z URL na `/login` je uživatelský
// vstup, takže bez tohohle filtru je to otevřený redirect: `/login?redirect=
// http://zly.cz` by po přihlášení poslalo prohlížeč na cizí doménu.
test('bezpecnyRedirect: pustí jen vlastní cesty, cizí URL a protokol-relativní // nahradí výchozí', () => {
  assert.equal(bezpecnyRedirect('/plan'), '/plan');
  assert.equal(bezpecnyRedirect(null), CESTA_PROFIL);
  assert.equal(bezpecnyRedirect(undefined), CESTA_PROFIL);
  assert.equal(bezpecnyRedirect(''), CESTA_PROFIL);
  assert.equal(bezpecnyRedirect('http://zly.cz'), CESTA_PROFIL);
  assert.equal(bezpecnyRedirect('https://zly.cz'), CESTA_PROFIL);
  assert.equal(bezpecnyRedirect('//zly.cz'), CESTA_PROFIL, 'protokol-relativní // je taky cizí origin');
  assert.equal(bezpecnyRedirect('profil-bez-lomitka'), CESTA_PROFIL);
  assert.equal(bezpecnyRedirect('/plan', '/jina-vychozi'), '/plan');
  assert.equal(bezpecnyRedirect(null, '/jina-vychozi'), '/jina-vychozi');
});

// ---------------------------------------------------------------- /komunita
//
// REGRESE 23. 9. 2026: app.bodyandmindon.cz/komunita vracela „Stránka
// neexistuje". Komunita byla jen záložka uvnitř /profil bez vlastní adresy,
// ale middleware.ts ji vedl mezi aplikačními cestami — odkaz tam posílal,
// App.tsx ji neznal. Testy níž hlídají celý řetěz: middleware → PLATNE_CESTY
// → výchozí záložka → vykreslení feedu.

test('/komunita je platná cesta a otevře záložku Komunita', () => {
  assert.equal(CESTA_KOMUNITA, '/komunita');
  assert.equal(jePlatnaCesta(CESTA_KOMUNITA), true, '/komunita skončí na 404');
  assert.equal(zalozkaZCesty(CESTA_KOMUNITA), 'komunita');
  assert.equal(zalozkaZCesty(CESTA_PROFIL), null);
  assert.equal(zalozkaZCesty('/'), null);
});

test('přepnutí záložky přepíše adresu jen mezi /profil a /komunita', () => {
  assert.equal(cestaProZalozku('komunita', CESTA_PROFIL), CESTA_KOMUNITA);
  assert.equal(cestaProZalozku('vaha', CESTA_KOMUNITA), CESTA_PROFIL);
  assert.equal(cestaProZalozku('profil', CESTA_KOMUNITA), CESTA_PROFIL);
  // Už tam jsme — žádný zbytečný záznam v historii.
  assert.equal(cestaProZalozku('komunita', CESTA_KOMUNITA), null);
  assert.equal(cestaProZalozku('vaha', CESTA_PROFIL), null);
  // Na loginu nebo registraci záložky adresu neřídí.
  assert.equal(cestaProZalozku('komunita', CESTA_PRIHLASENI), null);
  assert.equal(cestaProZalozku('komunita', '/'), null);
});

test('každá cesta, kterou middleware vede jako aplikační a App.tsx vykresluje, je v PLATNE_CESTY', () => {
  // Middleware má v seznamu i historické prefixy (/trener, /vip…), které
  // App.tsx schválně neobsluhuje. Hlídá se proto cesta, na kterou se
  // App.tsx sám odkazuje — ta nesmí vést na 404.
  const middleware = cti('../middleware.ts');
  assert.match(middleware, /'\/komunita'/, 'middleware /komunita nevede do appky');

  const app = cti('./App.tsx');
  for (const [, konstanta] of app.matchAll(/\b(CESTA_[A-Z_]+)\b/g)) {
    if (konstanta === 'CESTA_ADMIN_INTEGRACE') continue;
    // Každá cesta, se kterou App.tsx pracuje, musí projít strážcem 404.
    const hodnota = cti('./routing.ts').match(new RegExp(`export const ${konstanta} = '([^']+)'`));
    assert.ok(hodnota, `${konstanta} v routing.ts chybí`);
    assert.equal(jePlatnaCesta(hodnota![1]), true, `${konstanta} (${hodnota![1]}) skončí na 404`);
  }
});

test('App.tsx: /komunita otevře feed i při přímém načtení a přihlášení se na ni vrátí', () => {
  const app = cti('./App.tsx');

  // Výchozí záložka se bere z URL, ne natvrdo 'profil'.
  assert.match(app, /useState<ActiveTab>\(\(\) => zalozkaZCesty\(cesta\) \?\? 'profil'\)/);
  // Záložka Komunita opravdu vykresluje feed z komunita/CommunityPage.
  assert.match(app, /import \{ CommunityPage \} from '\.\/components\/komunita\/CommunityPage'/);
  assert.match(app, /activeTab === 'komunita' && \(\s*<CommunityPage/);
  // Navigace přepíná přes vyberZalozku (mění i URL), ne holým setActiveTab.
  assert.doesNotMatch(app, /onSelectTab=\{setActiveTab\}/);
  // Nepřihlášený na /komunita se po loginu vrátí zpátky.
  assert.match(app, /cesta === CESTA_KOMUNITA \? CESTA_KOMUNITA : CESTA_PROFIL/);

  const tabs = cti('./components/NavigationTabs.tsx');
  assert.match(tabs, /\{ id: 'komunita', label: 'Komunita'/);
});
