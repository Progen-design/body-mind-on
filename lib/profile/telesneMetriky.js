/**
 * Čistá logika karet tělesného vývoje (nový návrh, srpen 2026).
 *
 * Vlastní modul proto, že samotné karty jsou JSX a `node --test` je bez
 * transpilace nenačte. Tady zůstává to, na čem záleží a co se dá otestovat:
 * jak se formátuje číslo, kdy je trend dobrá zpráva a z čeho se kreslí graf.
 */

/**
 * Číslo s desetinnou čárkou, nebo `null` když hodnota chybí.
 *
 * CHYBĚJÍCÍ MĚŘENÍ NENÍ NULA. `Number(null)` je 0 a `Number.isFinite(0)` je
 * true, takže naivní kontrola prázdnou váhu propustí a karta pak tvrdí
 * „0,0 kg“ — údaj, který nikdo nenaměřil. Proto se prázdné hodnoty odchytávají
 * dřív, než se převádějí na číslo.
 *
 * @param {unknown} v
 * @param {number} [desetin]
 * @returns {string|null}
 */
export function formatMetrikaCs(v, desetin = 1) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(desetin).replace('.', ',');
}

/**
 * Je změna dobrá zpráva?
 *
 * U váhy a tuku je žádoucí pokles, u svalové hmoty růst — znaménko samo o sobě
 * nestačí. Nula se bere jako neutrální, ne jako úspěch.
 *
 * @param {unknown} zmena
 * @param {'klesa'|'roste'} dobreKdyz
 * @returns {'dobre'|'spatne'|'neutralni'|null} null = není co hodnotit
 */
export function smerTrendu(zmena, dobreKdyz = 'klesa') {
  if (zmena == null || zmena === '') return null;
  const n = Number(zmena);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 'neutralni';
  const roste = n > 0;
  const dobre = dobreKdyz === 'roste' ? roste : !roste;
  return dobre ? 'dobre' : 'spatne';
}

/** Nejmenší počet měření, ze kterých má smysl kreslit křivku. */
export const MIN_BODU_GRAFU = 3;

/**
 * Body do grafu váhy z historie měření.
 *
 * Řadí od nejstaršího — `/api/withings/history` vrací nejnovější první, což by
 * křivku otočilo a klesající trend by vypadal jako rostoucí. Měření bez váhy
 * se zahazují: mezera v datech se nemá spojit čarou, jako by tam hodnota byla.
 *
 * @param {Array<{measured_at?: string, weight_kg?: unknown}>} historie
 * @returns {Array<{datum: string, vaha: number}>}
 */
export function bodyGrafuVahy(historie) {
  return [...(historie || [])]
    .filter((item) => {
      const n = Number(item?.weight_kg);
      return item?.weight_kg != null && Number.isFinite(n);
    })
    .sort((a, b) => new Date(a?.measured_at || 0) - new Date(b?.measured_at || 0))
    .map((item) => ({
      datum: new Date(item.measured_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
      vaha: Number(item.weight_kg),
    }));
}

/**
 * Celková změna mezi prvním a posledním bodem grafu.
 * @param {Array<{vaha: number}>} body
 * @returns {number|null}
 */
export function celkovaZmena(body) {
  if (!Array.isArray(body) || body.length < 2) return null;
  return body[body.length - 1].vaha - body[0].vaha;
}
