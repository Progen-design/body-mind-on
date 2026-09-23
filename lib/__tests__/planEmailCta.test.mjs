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

// PROMPT_UKLID.md (2026-09-17) — přepsáno z `_legacy-next/pages/login.js`
// (mrtvá Next.js stránka) na živou SPA v `src/`. Cestou se ukázalo, že
// `bezpecnyRedirect()` v `src/routing.ts` NEEXISTOVALA — `App.tsx` posílal
// `?redirect=` rovnou do `naviguj()`, která pro cokoli začínající `http`
// udělá `window.location.href = kam`. `/login?redirect=http://zly.cz` by
// tedy po přihlášení poslalo prohlížeč na cizí doménu (otevřený redirect).
// Doplněno teď, zvlášť viz `src/routing.test.ts`.
test('login screen: redirect parametr míří do profilu, ne na kořen, a App.tsx ho vede přes bezpecnyRedirect', () => {
  const routing = readFileSync(join(KOREN, '..', 'src', 'routing.ts'), 'utf8');
  assert.match(routing, /export function bezpecnyRedirect/, 'bezpecnyRedirect musí existovat a být exportovaná');
  assert.match(routing, /startsWith\('\/'\)/, 'musí odmítnout cokoli, co nezačíná lomítkem');
  assert.match(routing, /startsWith\('\/\/'\)/, 'musí odmítnout i protokol-relativní `//cizi-domena`');

  const app = readFileSync(join(KOREN, '..', 'src', 'App.tsx'), 'utf8');
  assert.match(
    app,
    // Druhý argument je výchozí cíl (/komunita vrací na /komunita, jinak /profil).
    /redirectTo=\{bezpecnyRedirect\(\s*parametry\.get\('redirect'\)\s*[,)]/,
    'App.tsx musí redirect parametr posílat přes bezpecnyRedirect, ne surový'
  );
  assert.match(app, /import \{[^}]*bezpecnyRedirect[^}]*\} from '\.\/routing'/, 'bezpecnyRedirect musí být importovaná');
});
