/**
 * CALLBACK POŘÁD VYDÁVÁ ČTYŘI STAVY — ALE ŽIVÁ SPA JE NEČTE.
 *
 * PŮVODNÍ DŮVOD (13. 8. 2026): uživatel prošel Withings OAuth, callback ho
 * vrátil na `/profil?withings=error`, a tehdejší Next.js profil ten parametr
 * vůbec nečetl. Karta dál hlásila „Zatím nepřipojeno“, bez jediného slova
 * o tom, že se něco nepovedlo. Test to pinoval proti `_legacy-next/pages/profil.js`.
 *
 * PROMPT_UKLID.md (2026-09-17): `_legacy-next/pages/profil.js` je mrtvý kód,
 * profil dnes žije v `src/` (App.tsx + ProfileSection.tsx). Ověřeno greppem
 * přes celé `src/` — ŽÁDNÝ soubor nečte `parametry.get('withings')` ani
 * jinak nezpracovává `?withings=` z URL. `api/withings/callback.js` dál
 * posílá `appendWithingsStatus(...)` se čtyřmi stavy do `/profil`, ale SPA
 * ten parametr ignoruje stejně, jako to dělal starý profil před opravou —
 * bug se vrátil při přepisu na Vite SPA. Živý ekvivalent neexistuje, takže
 * se sem NEVYMÝŠLÍ — zbytek pokrytí (čtení parametru, hlášky pro 4 stavy,
 * bezpečná chybová zpráva s „napiš nám“, úklid URL po zobrazení) se smazal,
 * dokud frontend stranu withings statusu do `src/` někdo nepřenese. Nahlášeno
 * v reportu k PROMPT_UKLID.md jako živý gap, ne jako detail úklidu.
 *
 * Seznam stavů se proto NEOPISUJE. Vytáhne se z callbacku, aby budoucí
 * přidaný stav zase tiše nepropadl, až se frontend strana dopíše.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');
const callback = readFileSync(join(KOREN, 'api', 'withings', 'callback.js'), 'utf8');

/** Stavy, se kterými callback skutečně redirectuje na profil. */
function stavyZCallbacku() {
  const stavy = new Set();
  // appendWithingsStatus('/profil', 'denied') a spol.
  for (const [, s] of callback.matchAll(/appendWithingsStatus\([^,]+,\s*'([a-z_]+)'/g)) stavy.add(s);
  // syncStatus se přiřazuje proměnnou, ne literálem v volání
  for (const [, s] of callback.matchAll(/syncStatus = '([a-z_]+)'/g)) stavy.add(s);
  return [...stavy].sort();
}

test('callback pořád vydává čtyři known stavy', () => {
  assert.deepEqual(
    stavyZCallbacku(),
    ['connected', 'connected_sync_pending', 'denied', 'error'],
    'změnil se seznam stavů — až frontend stranu v src/ někdo dopíše, promítni je tam taky'
  );
});

test('GAP: žádný soubor v src/ nečte parametr ?withings= z URL', () => {
  const srcDir = join(KOREN, 'src');
  const soubory = [];
  (function projdi(d) {
    for (const jmeno of readdirSync(d)) {
      const p = join(d, jmeno);
      if (statSync(p).isDirectory()) projdi(p);
      else if (/\.(tsx?|jsx?)$/.test(jmeno) && !/\.test\./.test(jmeno)) soubory.push(p);
    }
  })(srcDir);

  const cteDoWithings = soubory.filter((p) => /['"]withings['"]/.test(readFileSync(p, 'utf8')) && /\.get\(/.test(readFileSync(p, 'utf8')));

  assert.deepEqual(
    cteDoWithings,
    [],
    'src/ teď withings query parametr nečte vůbec — pokud tenhle test spadl, ' +
    'frontend stranu už někdo dopsal a tenhle test je zastaralý, přepiš ho na kontrolu hlášek jako u starého profilu'
  );
});

test('callback zapisuje výsledek do DB, ne jen do console', () => {
  assert.match(callback, /zaznamenejWithingsCallback/, 'výsledek musí přistát v DB');

  // Z produkčních runtime logů se nepodařilo vytáhnout jediný řádek z console.*,
  // takže krok, ve kterém to spadlo, musí nést databázový záznam.
  for (const stage of ['token_exchange', 'save_connection', 'initial_sync', 'oauth_denied']) {
    assert.ok(callback.includes(stage), `callback musí umět pojmenovat krok "${stage}"`);
  }
});
