/**
 * CTA V PLAN E-MAILU MUSÍ VÉST DO PROFILU, NE NA HLAVNÍ STRÁNKU.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 14. 8. 2026 přišla stížnost, že tlačítko „Otevřít můj profil“ vede na hlavní
 * stránku. U odeslané šablony (V8) se to nepotvrdilo — vyrenderovaný e-mail
 * mířil na `/login?redirect=/profil` a celý řetěz včetně přihlášení skončil
 * v prohlížeči na `/profil`.
 *
 * Našla se ale latentní vada se stejným příznakem: V2, V4, V5 a V6 měly jako
 * VÝCHOZÍ `ctaUrl` kořen aplikace, tedy hlavní stránku. Dnes jim `mail.js`
 * vždycky `ctaUrl` předá, takže se to neprojevilo — ale fallback nemá mířit
 * jinam než hlavní cesta, a šablon je šest.
 *
 * Testuje se zdroj: vyrenderovat všech šest šablon by znamenalo šest sad
 * fixtur plánu. Hlídá se to jediné, na čem tady záleží — kam ukazuje default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getPlanEmailCtaUrl, getProfileUrl, getPublicAppUrl } from '../siteUrls.js';

const KOREN = join(import.meta.dirname, '..');

function sablony() {
  return readdirSync(KOREN)
    .filter((f) => /^weeklyPlanEmailV\d+\.js$/.test(f))
    .sort();
}

test('CTA URL míří na login s návratem do profilu, ne na kořen', () => {
  const cta = getPlanEmailCtaUrl();

  assert.match(cta, /\/login\?redirect=%2Fprofil|\/login\?redirect=\/profil/,
    'CTA musí nést návratovou cestu, jinak login neví, kam po přihlášení');
  assert.notEqual(cta, getPublicAppUrl(), 'CTA nesmí být holý kořen aplikace');
  assert.notEqual(cta, `${getPublicAppUrl()}/`, 'ani kořen s lomítkem');
  assert.ok(cta.startsWith(getPublicAppUrl()), 'CTA musí zůstat na doméně aplikace');
  assert.equal(getProfileUrl(), `${getPublicAppUrl()}/profil`);
});

test('žádná šablona nemá jako výchozí CTA kořen aplikace', () => {
  const provinilci = [];

  for (const f of sablony()) {
    const src = readFileSync(join(KOREN, f), 'utf8');
    const m = src.match(/const ctaUrl = String\(options\.ctaUrl \|\| ([^)]+)\)/);
    if (!m) continue;
    const vychozi = m[1].trim();
    // `appBaseUrl` je kořen aplikace = hlavní stránka.
    if (vychozi === 'appBaseUrl') provinilci.push(`${f} → ${vychozi}`);
  }

  assert.deepEqual(provinilci, [],
    'šablona by poslala uživatele na hlavní stránku místo do profilu');
});

test('všech šest šablon existuje a má výchozí CTA přes siteUrls', () => {
  const nalezene = sablony();
  assert.ok(nalezene.length >= 6, `čekáno aspoň 6 šablon, nalezeno ${nalezene.length}`);

  for (const f of nalezene) {
    const src = readFileSync(join(KOREN, f), 'utf8');
    if (!/const ctaUrl = String\(options\.ctaUrl \|\|/.test(src)) continue;
    assert.match(
      src,
      /options\.ctaUrl \|\| (getPlanEmailCtaUrl|getDefaultLoginUrl)\(\)/,
      `${f}: výchozí CTA se musí brát ze siteUrls, ne skládat ručně`
    );
  }
});

test('login stránka respektuje parametr redirect a jinak padá na /profil', () => {
  const login = readFileSync(join(KOREN, '..', 'pages', 'login.js'), 'utf8');

  assert.match(login, /router\.query\.redirect/, 'login musí parametr číst');
  assert.match(login, /startsWith\('\/'\)/,
    'redirect se musí omezit na vlastní cesty — jinak je to otevřený redirect');
  assert.match(login, /:\s*'\/profil'/, 'bez parametru se má jít do profilu');

  // Po úspěšném přihlášení i při už existující session se musí použít redirectTo.
  const pouziti = [...login.matchAll(/router\.replace\(redirectTo/g)];
  assert.ok(pouziti.length >= 2,
    'redirectTo se musí použít jak po přihlášení, tak při už existující session');
});
