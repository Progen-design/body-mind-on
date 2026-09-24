/**
 * KONTROLA E-MAILU V REGISTRACI — pořadí odpovědí a jediná hláška.
 *
 * CHYBA (24. 9. 2026): pod polem E-mail stálo současně „Tento e-mail už je
 * registrovaný" i „E-mail je volný". Dostupnost se ověřovala dvěma cestami
 * — při psaní (hook) a znovu po kliknutí na „Dál" — a ta druhá neměla žádnou
 * ochranu pořadí. Pomalá odpověď na STARÝ e-mail dorazila až po opravě
 * e-mailu, zapsala do pole chybu „obsazený" a hook mezitím pro NOVÝ e-mail
 * správně hlásil „volný". Obě hlášky se vykreslovaly nezávisle.
 *
 * TEĎ:
 * 1. Obě cesty jdou přes JEDNU `vytvorKontroluEmailu()`: každý nový dotaz
 *    zruší předchozí (AbortController) a odpověď na cokoli jiného než
 *    poslední dotaz se zahodí (pořadové číslo).
 * 2. Co se pod polem ukáže, rozhoduje jediná funkce `hlaskaEmailu()` — vždy
 *    nejvýš jedna hláška; nová odpověď starou hlášku nahradí.
 *
 * Čisté JS bez Reactu → testy v lib/__tests__/kontrolaEmailu.test.mjs.
 */
import { EMAIL_CHECK_FAILED_MESSAGE_CS, EMAIL_TAKEN_MESSAGE_CS } from './checkEmailAvailableClient.js';

/**
 * @typedef {{ available: boolean, rateLimited?: boolean, networkError?: boolean, aborted?: boolean }} VysledekDostupnosti
 * @typedef {'necinny' | 'overuji' | 'volny' | 'obsazeny' | 'nelze'} StavEmailu
 */

/**
 * Kontrola dostupnosti s ochranou pořadí.
 *
 * @param {(email: string, opts: { signal?: AbortSignal }) => Promise<VysledekDostupnosti>} zkontroluj
 * @returns {{ over: (email: string) => Promise<VysledekDostupnosti | null>, zrus: () => void }}
 *   `over` vrací výsledek, nebo `null`, když mezitím přišel novější dotaz
 *   (nebo `zrus()`) — takový výsledek se nesmí nikde zobrazit.
 */
export function vytvorKontroluEmailu(zkontroluj) {
  let posledni = 0;
  /** @type {AbortController | null} */
  let ovladac = null;

  const zrusBezici = () => {
    if (ovladac) ovladac.abort();
    ovladac = null;
  };

  return {
    async over(email) {
      const cislo = ++posledni;
      zrusBezici();
      const muj = typeof AbortController === 'function' ? new AbortController() : null;
      ovladac = muj;

      let vysledek;
      try {
        vysledek = await zkontroluj(email, { signal: muj?.signal });
      } catch {
        vysledek = { available: false, networkError: true };
      }

      // Mezitím přišel novější dotaz nebo zrušení — tahle odpověď už neplatí.
      if (cislo !== posledni || muj?.signal.aborted) return null;
      if (ovladac === muj) ovladac = null;
      return vysledek;
    },
    /** Zahodí běžící dotaz (e-mail se změnil nebo přestal být platný). */
    zrus() {
      posledni += 1;
      zrusBezici();
    },
  };
}

/**
 * Výsledek endpointu → stav pole. Výpadek ani rate limit NEJSOU obsazený
 * e-mail (autoritativní kontrola proběhne na serveru při odeslání).
 *
 * @param {VysledekDostupnosti} v
 * @returns {StavEmailu}
 */
export function stavZVysledku(v) {
  if (!v || v.networkError || v.rateLimited || v.aborted) return 'nelze';
  return v.available ? 'volny' : 'obsazeny';
}

/**
 * JEDINÁ hláška pod polem E-mail.
 *
 * - Chyba formátu apod. (`chybaPole`, jiná než „obsazený") má přednost —
 *   týká se toho, co je v poli teď.
 * - Jinak rozhoduje poslední stav kontroly. „Volný" přebíjí zastaralou chybu
 *   „obsazený" v `chybaPole` (tu mohla zapsat starší odpověď nebo server
 *   k e-mailu, který už v poli není).
 * - „Obsazený" ze serveru (odeslání registrace) se ukáže, dokud kontrola
 *   neřekne něco novějšího.
 *
 * @param {{ stav: StavEmailu, chybaPole?: string | null }} vstup
 * @returns {{ typ: 'chyba' | 'overuji' | 'ok' | 'varovani', text: string } | null}
 */
export function hlaskaEmailu({ stav, chybaPole = null }) {
  if (chybaPole && chybaPole !== EMAIL_TAKEN_MESSAGE_CS) return { typ: 'chyba', text: chybaPole };
  if (stav === 'obsazeny') return { typ: 'chyba', text: EMAIL_TAKEN_MESSAGE_CS };
  if (stav === 'overuji') return { typ: 'overuji', text: 'Ověřuji e-mail…' };
  if (stav === 'volny') return { typ: 'ok', text: 'E-mail je volný.' };
  if (stav === 'nelze') return { typ: 'varovani', text: EMAIL_CHECK_FAILED_MESSAGE_CS };
  if (chybaPole) return { typ: 'chyba', text: chybaPole };
  return null;
}
