/**
 * ZKRATKY Z APPLE WATCH ČESKY.
 *
 * PROČ. Sekce biometrie ukazovala „HRV 42 ms“ a „Klidový tep 58 bpm“.
 * Vysvětlení existovalo, ale bylo schované v tooltipu (`aria-label` na ikonce
 * s `tabIndex`), takže se k němu na mobilu nikdo nedostal a na desktopu ho
 * musel hledat. Zkratka bez vysvětlení není údaj, je to hádanka.
 *
 * Řešení má dvě části:
 *   1. jednotka se píše česky tam, kde to jde („tepů/min“ místo „bpm“);
 *   2. u zkratkového názvu se pod něj vypíše krátké rozepsání, viditelně.
 *
 * `ms` zůstává — milisekunda je běžná jednotka a rozepisovat ji by víc
 * překáželo, než pomohlo. Rozepisuje se význam veličiny, ne jednotka.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/**
 * Jednotky, které se v češtině píšou jinak než v HealthKitu.
 *
 * `bpm` je anglická zkratka („beats per minute“) a v české aplikaci nemá
 * co dělat, když existuje stejně krátké „tepů/min“.
 */
const JEDNOTKY_CS = Object.freeze({
  bpm: 'tepů/min',
  'count/min': 'tepů/min',
});

/**
 * Jednotka česky. Co neznáme, projde beze změny.
 *
 * @param {unknown} jednotka
 * @returns {string}
 */
export function jednotkaCesky(jednotka) {
  const u = String(jednotka ?? '').trim();
  if (!u) return '';
  return JEDNOTKY_CS[u] || JEDNOTKY_CS[u.toLowerCase()] || u;
}

/**
 * Rozepsání zkratkových názvů metrik.
 *
 * Krátké, bez zdravotních tvrzení — jen co ta zkratka znamená. Interpretace
 * („nízké HRV znamená…“) sem nepatří, tu nese `insights.ts` a je vázaná
 * na skutečná data.
 */
const VYSVETLENI = Object.freeze({
  hrv: 'variabilita tepu',
  'heart rate variability': 'variabilita tepu',
  rhr: 'tep v klidu',
  spo2: 'okysličení krve',
  'blood oxygen': 'okysličení krve',
  vo2max: 'aerobní kapacita',
  'vo2 max': 'aerobní kapacita',
  bmi: 'index tělesné hmotnosti',
});

/**
 * Rozepsání zkratky, nebo null když ji rozepisovat netřeba.
 *
 * Vrací null i pro názvy, které jsou už samy o sobě česky srozumitelné
 * („Klidový tep“, „Kroky“) — přidávat pod ně další řádek by jen zabíralo
 * místo.
 *
 * @param {unknown} nazev
 * @returns {string|null}
 */
export function vysvetliZkratku(nazev) {
  const n = String(nazev ?? '').trim().toLowerCase();
  if (!n) return null;
  return VYSVETLENI[n] || null;
}

/**
 * Popisek metriky i s rozepsáním, pro jednořádkové zobrazení.
 *
 * @param {unknown} nazev
 * @returns {string}
 */
export function popisSeZkratkou(nazev) {
  const n = String(nazev ?? '').trim();
  const vysvetleni = vysvetliZkratku(n);
  return vysvetleni ? `${n} (${vysvetleni})` : n;
}
