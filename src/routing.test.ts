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
import { CESTY_REGISTRACE, CESTA_PRIHLASENI, CESTA_PROFIL, PLATNE_CESTY, jePlatnaCesta, bezpecnyRedirect } from './routing.ts';

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('zname cesty projdou', () => {
  for (const cesta of ['/', CESTA_PRIHLASENI, CESTA_PROFIL, ...CESTY_REGISTRACE]) {
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
    ['/', '/admin/integrace', '/login', '/profil', '/register', '/signup', '/start'].sort()
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
