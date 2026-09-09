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
import { CESTY_REGISTRACE, CESTA_PRIHLASENI, CESTA_PROFIL, PLATNE_CESTY, jePlatnaCesta } from './routing.ts';

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
  assert.deepEqual(
    [...PLATNE_CESTY].sort(),
    ['/', '/login', '/profil', '/register', '/signup', '/start'].sort()
  );
});
