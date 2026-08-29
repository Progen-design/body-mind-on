/**
 * KARTA WITHINGS NESMÍ TVRDIT NIC, CO NEMÁ Z DAT.
 *
 * PROČ TENHLE TEST EXISTUJE
 * Změřeno 29. 8. 2026 na účtu bez jediného řádku ve `withings_connections`:
 * `src/components/WithingsCard.tsx` přesto ukazovalo odznak „Online" natvrdo
 * z JSX, čas poslední synchronizace měl vymyšlený výchozí text
 * (`dnes v 08:45`) a tlačítko po kliknutí vždycky napsalo „Aktualizováno!",
 * i když se nic nestáhlo — animace čekala 1200 ms a pak nastavila úspěch bez
 * ohledu na výsledek `onSync()`.
 *
 * Karta je JSX a nejde naimportovat do testu v holém Node, proto rozhodovací
 * logika bydlí v `lib/withingsCardStav.js` a testuje se tady, bez React.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { withingsCardStav, withingsSyncOutcome } from '../withingsCardStav.js';

test('bez připojení: odznak offline, žádný vymyšlený čas, tlačítko sync se nekreslí', () => {
  const stav = withingsCardStav({ hasConnection: false, lastSyncedText: null });
  assert.equal(stav.badge, 'offline');
  assert.equal(stav.showSyncButton, false, '„Synchronizovat teď" bez připojení nedává smysl');
  assert.notEqual(stav.statusLine, 'dnes v 08:45', 'starý natvrdo vepsaný výchozí text nesmí přežít');
});

test('bez připojení se ignoruje i cizí naformátovaný čas — nepřipojenému se čas nezobrazuje', () => {
  // I kdyby volající omylem poslal naformátovaný odstup, karta bez připojení
  // nesmí tvrdit, že něco synchronizovala.
  const stav = withingsCardStav({ hasConnection: false, lastSyncedText: 'před 5 min' });
  assert.equal(stav.badge, 'offline');
  assert.notEqual(stav.statusLine, 'před 5 min');
});

test('připojeno, ale server ještě nikdy nestahoval: čas je „—", ne vymyšlený', () => {
  const stav = withingsCardStav({ hasConnection: true, lastSyncedText: null });
  assert.equal(stav.badge, 'online');
  assert.equal(stav.showSyncButton, true);
  assert.equal(stav.statusLine, '—', 'null musí zůstat pomlčkou, ne polknout nulu ani vymyšlené datum');
});

test('připojeno a server naposled stahoval: karta ukáže skutečný odstup', () => {
  const stav = withingsCardStav({ hasConnection: true, lastSyncedText: 'před 17 min' });
  assert.equal(stav.badge, 'online');
  assert.equal(stav.showSyncButton, true);
  assert.equal(stav.statusLine, 'před 17 min');
});

test('onSync() vrátí výsledek → „Aktualizováno!" smí naskočit', () => {
  const outcome = withingsSyncOutcome({ syncedAt: '08:45', weight: 82.4 });
  assert.equal(outcome, 'success');
});

test('onSync() vrátí null → tlačítko musí říct, že selhalo, ne že se aktualizovalo', () => {
  // Přesně tenhle případ karta dřív hlásila jako úspěch — čekala 1200 ms
  // a nastavila `syncSuccess = true` bez ohledu na návratovou hodnotu.
  const outcome = withingsSyncOutcome(null);
  assert.equal(outcome, 'error');
});

test('onSync() vrátí undefined → taky selhalo, ne polotichý úspěch', () => {
  const outcome = withingsSyncOutcome(undefined);
  assert.equal(outcome, 'error');
});
