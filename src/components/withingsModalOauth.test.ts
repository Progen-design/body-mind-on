// WITHINGS SE NESMÍ „PŘIPOJIT" BEZ SERVERU.
//
// Do 22. 9. 2026 byl WithingsSyncModal kulisa: `handleAuthorize()` přijal
// jakýkoli řetězec ≥ 12 znaků bez mezer, počkal 1200 ms na `wait()` a nastavil
// `isConnected: true` v local-storage stavu. Na backend nešlo nic, žádný token
// se neověřoval — proto měla `withings_connections` nula řádků, přestože
// OAuth (`/api/withings/connect` → callback) fungoval.
//
// Testuje se zdroj, ne render: jde o to, že v komponentě neexistuje ŽÁDNÁ
// cesta, jak stav připojení nastavit lokálně, a že stav přichází ze serveru.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const MODAL = cti('src/components/WithingsSyncModal.tsx');
const APP = cti('src/App.tsx');
const TYPY = cti('src/types.ts');

/** Kód bez komentářů — o té staré chybě se v nich píše. */
const kod = (zdroj: string) => zdroj.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MODAL_KOD = kod(MODAL);

test('fake token flow je pryč celý', () => {
  for (const zbytek of ['MIN_TOKEN_LENGTH', 'maskToken', 'tokenInput', 'handleAuthorize', 'maskedToken', 'lastAuthorizedAt']) {
    assert.doesNotMatch(MODAL_KOD, new RegExp(zbytek), `v modalu zůstal ${zbytek}`);
  }
  assert.doesNotMatch(MODAL_KOD, /<input/, 'políčko na ruční token se vrátilo');
});

test('žádná cesta v modalu nenastaví připojeno lokálně', () => {
  // Stav smí pouze PŘIJÍT propem. Kdyby se `isConnected` někde přiřazovalo,
  // je to zase kulisa.
  assert.doesNotMatch(MODAL_KOD, /isConnected:\s*true/, 'stav připojení se nastavuje v komponentě');
  assert.doesNotMatch(MODAL_KOD, /setIsConnected/, 'stav připojení má být prop, ne vlastní state');
  assert.doesNotMatch(MODAL_KOD, /useLocalStorage/, 'stav připojení nesmí žít v prohlížeči');
  assert.match(MODAL_KOD, /isConnected: boolean;/, 'stav připojení musí být povinný prop');
});

test('„Připojit" jde přes skutečný OAuth endpoint', () => {
  // POST, ne navigace na /api/withings/connect: endpoint čte přihlášení
  // z hlavičky Authorization, kterou navigace prohlížeče neposílá.
  assert.match(
    MODAL_KOD,
    /apiFetch<\{ url\?: string \}>\('\/api\/withings\/connect', \{ method: 'POST' \}\)/,
    'připojení musí volat /api/withings/connect',
  );
  assert.match(MODAL_KOD, /window\.location\.href = odpoved\.url/, 'na adresu z serveru se má přesměrovat');
  assert.match(MODAL_KOD, /apiFetch\('\/api\/withings\/disconnect', \{ method: 'POST' \}\)/, 'odpojení musí být taky reálné');
});

test('„Aktivní & Spárováno" visí na propu ze serveru', () => {
  assert.match(MODAL_KOD, /\{isConnected \? \([\s\S]{0,400}Aktivní &amp; Spárováno/);
});

test('„Stáhnout data teď" je zakázané bez reálného připojení', () => {
  assert.match(MODAL_KOD, /disabled=\{!isConnected \|\| isSyncing\}/);
  assert.match(MODAL_KOD, /if \(!isConnected \|\| isSyncing\) return;/, 'i handler musí držet stejnou podmínku');
});

test('vymyšlená baterie a Wi-Fi signál jsou pryč', () => {
  for (const vymysl of ['92 %', '5 GHz', 'Battery', 'Wifi']) {
    assert.doesNotMatch(MODAL_KOD, new RegExp(vymysl), `v modalu zůstal vymyšlený údaj ${vymysl}`);
  }
  // A stejně tak vyprávění o krocích, které server nehlásí.
  assert.doesNotMatch(MODAL_KOD, /DOWNLOAD_STEPS/, 'fiktivní průběh stahování se vrátil');
});

test('App.tsx plní modal ze serveru a mrtvý local-storage stav je uklizený', () => {
  assert.match(APP, /isConnected=\{profilData\?\.has_withings_connection === true\}/);
  assert.match(APP, /lastSyncedAt=\{profilData\?\.withings_last_sync_at \?\? null\}/);
  assert.match(APP, /onConnectionChanged=\{znovuNacistProfil\}/);

  assert.doesNotMatch(APP, /withings-connection/, 'local-storage klíč zůstal');
  assert.doesNotMatch(APP, /initialWithingsConnection/, 'mrtvý výchozí stav zůstal');
  assert.doesNotMatch(TYPY, /interface WithingsConnection/, 'nepoužitý typ zůstal v types.ts');
});
