/**
 * KAŽDÝ STAV Z CALLBACKU MUSÍ PROFIL UMĚT ZOBRAZIT.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 13. 8. 2026 prošel uživatel dvakrát celým Withings OAuth. Callback ho vrátil
 * na `/profil?withings=error` — a profil ten parametr vůbec nečetl. Karta dál
 * hlásila „Zatím nepřipojeno“, bez jediného slova o tom, že se něco nepovedlo.
 * Callback uměl čtyři stavy, profil ani jeden.
 *
 * Seznam stavů se proto NEOPISUJE. Vytáhne se z callbacku a proti němu se
 * kontroluje profil — jinak by příští přidaný stav zase tiše propadl.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');
const callback = readFileSync(join(KOREN, 'pages', 'api', 'withings', 'callback.js'), 'utf8');
const profil = readFileSync(join(KOREN, 'pages', 'profil.js'), 'utf8');

/** Stavy, se kterými callback skutečně redirectuje na profil. */
function stavyZCallbacku() {
  const stavy = new Set();
  // appendWithingsStatus('/profil', 'denied') a spol.
  for (const [, s] of callback.matchAll(/appendWithingsStatus\([^,]+,\s*'([a-z_]+)'/g)) stavy.add(s);
  // syncStatus se přiřazuje proměnnou, ne literálem v volání
  for (const [, s] of callback.matchAll(/syncStatus = '([a-z_]+)'/g)) stavy.add(s);
  return [...stavy].sort();
}

test('callback pořád vydává čtyři známé stavy', () => {
  assert.deepEqual(
    stavyZCallbacku(),
    ['connected', 'connected_sync_pending', 'denied', 'error'],
    'změnil se seznam stavů — projdi i zobrazení v profilu'
  );
});

test('profil čte parametr withings z URL', () => {
  assert.match(
    profil,
    /router\.query\?\.withings/,
    'profil musí parametr vůbec číst — tohle byla ta chyba'
  );
});

test('profil má hlášku pro KAŽDÝ stav, který callback umí vrátit', () => {
  const i = profil.indexOf('router.query?.withings');
  assert.ok(i > 0, 'blok pro withings se nenašel');
  const blok = profil.slice(i - 1500, i + 2000);

  for (const stav of stavyZCallbacku()) {
    assert.match(
      blok,
      new RegExp(`\\b${stav}\\b\\s*:`),
      `stav "${stav}" nemá v profilu hlášku — uživatel by zase nevěděl, co se stalo`
    );
  }
});

test('chybové stavy mají srozumitelnou hlášku bez technického důvodu', () => {
  const i = profil.indexOf('router.query?.withings');
  const blok = profil.slice(i - 1500, i + 2000);

  // Technikálie do UI nepatří, patří do withings_callback_events.
  for (const zakazane of ['statusCode', 'stack', 'token_exchange', 'save_connection', 'error_message']) {
    assert.ok(
      !blok.includes(zakazane),
      `hláška nesmí prozrazovat technický důvod (${zakazane})`
    );
  }

  assert.match(blok, /napiš nám/i, 'u chyby musí být cesta ven, ne jen konstatování');
});

test('parametr se po zobrazení uklidí z URL', () => {
  const i = profil.indexOf('router.query?.withings');
  const blok = profil.slice(i, i + 2000);

  assert.match(
    blok,
    /router\.replace\('\/profil',\s*undefined,\s*\{\s*shallow:\s*true\s*\}\)/,
    'bez úklidu by hláška naskočila znovu po každém refreshi'
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
