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
      // Skutečný čas měření — `datum` je jen popisek osy a filtrovat se podle
      // něj nedá (nemá rok a je to text).
      cas: new Date(item.measured_at).getTime(),
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

/**
 * ČASOVÉ ROZSAHY GRAFU VÁHY.
 *
 * Návrh v3 měl přepínač 1M/3M/6M/1R, ale jen jako ozdobu — `selectedRange`
 * se nikde nepoužil a graf pořád kreslil všechna data. Tady filtruje doopravdy.
 *
 * Pořadí je od nejkratšího: člověk se nejčastěji dívá na poslední měsíc.
 */
export const ROZSAHY_GRAFU = Object.freeze([
  { id: '1M', mesicu: 1, popis: 'Poslední měsíc' },
  { id: '3M', mesicu: 3, popis: 'Poslední tři měsíce' },
  { id: '6M', mesicu: 6, popis: 'Posledních šest měsíců' },
  { id: '1R', mesicu: 12, popis: 'Poslední rok' },
]);

/** Výchozí rozsah, pokud v něm je dost měření. */
export const VYCHOZI_ROZSAH = '3M';

/**
 * Body spadající do zvoleného rozsahu.
 *
 * Vstup jsou body z `bodyGrafuVahy`, které si nesou `datum` jen jako popisek
 * pro osu — na filtrování je potřeba skutečný čas, proto se očekává i `cas`.
 *
 * @param {Array<{cas?: number, vaha: number}>} body
 * @param {string} rozsahId
 * @param {number} [ted] timestamp, kvůli testovatelnosti
 * @returns {Array<object>}
 */
export function filtrujRozsah(body, rozsahId, ted = Date.now()) {
  const rozsah = ROZSAHY_GRAFU.find((r) => r.id === rozsahId);
  if (!rozsah) return [...(body || [])];
  const hranice = new Date(ted);
  hranice.setMonth(hranice.getMonth() - rozsah.mesicu);
  const od = hranice.getTime();
  return (body || []).filter((b) => !Number.isFinite(b?.cas) || b.cas >= od);
}

/**
 * Které rozsahy mají dost bodů na graf.
 *
 * Rozsah bez tří měření se v UI ZAKÁŽE, místo aby ukázal prázdný graf —
 * prázdný graf vypadá jako chyba aplikace, zašedlé tlačítko jako informace,
 * že v tom okně zatím nic není.
 *
 * @param {Array<{cas?: number}>} body
 * @param {number} [ted]
 * @returns {Record<string, boolean>} id rozsahu → je použitelný
 */
export function dostupneRozsahy(body, ted = Date.now()) {
  const out = {};
  for (const r of ROZSAHY_GRAFU) {
    out[r.id] = filtrujRozsah(body, r.id, ted).length >= MIN_BODU_GRAFU;
  }
  return out;
}

/**
 * Rozsah, kterým se má graf otevřít.
 *
 * Výchozí je 3M; když v něm není dost měření, vezme se první širší, který
 * data má. U čerstvě připojené váhy tak uživatel uvidí graf hned, místo aby
 * musel klikat, než najde okno s daty.
 *
 * @param {Array<{cas?: number}>} body
 * @param {number} [ted]
 * @returns {string|null} null = graf nelze vykreslit v žádném rozsahu
 */
export function pocatecniRozsah(body, ted = Date.now()) {
  const dostupne = dostupneRozsahy(body, ted);
  if (dostupne[VYCHOZI_ROZSAH]) return VYCHOZI_ROZSAH;
  // Od výchozího nahoru: širší okno má vždycky aspoň tolik bodů co užší.
  const vychoziMesicu = ROZSAHY_GRAFU.find((r) => r.id === VYCHOZI_ROZSAH)?.mesicu ?? 3;
  for (const r of ROZSAHY_GRAFU) {
    if (r.mesicu > vychoziMesicu && dostupne[r.id]) return r.id;
  }
  // Ani nejširší okno nemá tři měření — graf se nekreslí vůbec.
  return null;
}
