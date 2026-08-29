/**
 * KARTA WITHINGS NESMÍ TVRDIT NIC, CO NEMÁ Z DAT.
 *
 * PROČ TENHLE MODUL EXISTUJE
 * `src/components/WithingsCard.tsx` lhalo 29. 8. 2026 třikrát — změřeno na
 * účtu, který nemá jediný řádek ve `withings_connections`:
 *   a) odznak „Online" byl natvrdo v JSX, svítil i bez připojení,
 *   b) čas poslední synchronizace měl vymyšlený výchozí text (`dnes v 08:45`),
 *   c) tlačítko po synchronizaci vždycky napsalo „Aktualizováno!", i když
 *      `onSync()` nic nestáhl.
 *
 * Karta je JSX a nejde naimportovat do testu v holém Node (viz stejný důvod
 * u `lib/planRenewalRules.js`) — rozhodovací logika proto bydlí tady.
 */

/**
 * Co karta zobrazí podle skutečného stavu připojení.
 *
 * `lastSyncedText` je už naformátovaný odstup (`odstupText()` z
 * `src/lib/odstup.ts`) — tahle funkce datum sama nepočítá, jen rozhoduje,
 * co s ním karta smí tvrdit. Bez připojení se čas nezobrazuje vůbec, tlačítko
 * „Synchronizovat teď" nedává smysl, když není co synchronizovat.
 *
 * @param {{ hasConnection: boolean, lastSyncedText: string|null }} vstup
 * @returns {{ badge: 'online'|'offline', statusLine: string, showSyncButton: boolean }}
 */
export function withingsCardStav({ hasConnection, lastSyncedText }) {
  if (!hasConnection) {
    return {
      badge: 'offline',
      statusLine: 'Zatím nepřipojeno — propoj Withings, ať se váha stahuje sama.',
      showSyncButton: false,
    };
  }
  // `null` je „—", nikdy vymyšlený čas — i s aktivním připojením server
  // někdy ještě nestahoval ani jednou.
  return {
    badge: 'online',
    statusLine: lastSyncedText || '—',
    showSyncButton: true,
  };
}

/**
 * Smí tlačítko po dokončení `onSync()` napsat „Aktualizováno!"?
 *
 * `onSync()` v `src/App.tsx` (`handleManualWithingsSync`) chybu sám odchytává
 * a vrací `null` — tlačítko tedy nepozná neúspěch z vyhozené výjimky, jen
 * z návratové hodnoty. Cokoli, co není skutečný výsledek synchronizace, je
 * neúspěch.
 *
 * @param {unknown} syncResult návratová hodnota `onSync()`.
 * @returns {'success'|'error'}
 */
export function withingsSyncOutcome(syncResult) {
  return syncResult ? 'success' : 'error';
}
