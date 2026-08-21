/**
 * ODŠKRTÁVÁNÍ JEDNOTLIVÝCH CVIKŮ.
 *
 * BEZ MIGRACE. `daily_activity_completions` má `activity_type` omezený CHECKem
 * na `meal | workout | habit`, ale `activity_key` je volný text a unikátní index
 * jde přes `(user_id, plan_id, plan_day, activity_type, activity_key)`. Jednotlivý
 * cvik se proto ukládá jako `workout` s klíčem `cvik#0`, `cvik#1`… a vedle
 * dosavadního `workout:plan_day` (celý trénink) si nepřekáží.
 *
 * PRAVIDLO PRO CELÝ TRÉNINK. Odškrtnutí posledního cviku zaškrtne i celý trénink
 * — ale jako SKUTEČNÝ ZÁPIS, ne jako dopočet. Kdyby se „hotovo“ jen odvozovalo
 * z cviků, uživatel by celý trénink nemohl ručně odškrtnout zpátky: dopočet by
 * ho hned zaškrtl znovu. Zápisem zůstává ruční přepínání funkční — odebrání
 * `plan_day` je pak samostatný fakt, který se nikam nevrací.
 *
 * OPAČNÝM SMĚREM SE NIC NERUŠÍ. Když si někdo odškrtne jeden cvik zpátky, celý
 * trénink zůstane hotový. Odtrénovat se dá i bez odklikání každé položky a brát
 * uživateli hotovou věc kvůli zpětné opravě jednoho řádku by bylo horší než
 * nechat záznam být.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/** Klíč, pod kterým je uložené dokončení celého tréninku. */
export const KLIC_CELEHO_TRENINKU = 'plan_day';

/** Prefix klíče jednotlivého cviku. */
export const PREFIX_CVIKU = 'cvik#';

/**
 * Klíč cviku podle jeho pořadí v dnešním tréninku.
 *
 * Pořadí, ne `canonical_key`: tentýž cvik se v jednom tréninku může objevit
 * dvakrát (rozcvička a hlavní série) a pak by si dva řádky přepisovaly stav.
 *
 * @param {number} index
 * @returns {string}
 */
export function klicCviku(index) {
  // `Number(null)` je nula, takže samotné `Number.isInteger` chybějící index
  // propustí jako cvik #0 — a odškrtlo by se první cvičení místo ničeho.
  if (index === null || index === undefined || index === '') return '';
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return '';
  return `${PREFIX_CVIKU}${i}`;
}

/**
 * Je cvik odškrtnutý?
 *
 * @param {Set<string>} hotove — množina ve tvaru `${activity_type}:${activity_key}`
 * @param {number} index
 * @returns {boolean}
 */
export function jeCvikHotovy(hotove, index) {
  const klic = klicCviku(index);
  if (!klic || !(hotove instanceof Set)) return false;
  return hotove.has(`workout:${klic}`);
}

/**
 * Kolik cviků je odškrtnutých.
 *
 * @param {Set<string>} hotove
 * @param {number} pocetCviku
 * @returns {number}
 */
export function pocetHotovychCviku(hotove, pocetCviku) {
  const n = Number(pocetCviku);
  if (!Number.isInteger(n) || n <= 0) return 0;
  let hotovo = 0;
  for (let i = 0; i < n; i += 1) if (jeCvikHotovy(hotove, i)) hotovo += 1;
  return hotovo;
}

/**
 * Je celý trénink zapsaný jako hotový?
 *
 * @param {Set<string>} hotove
 * @returns {boolean}
 */
export function jeTreninkHotovy(hotove) {
  if (!(hotove instanceof Set)) return false;
  return hotove.has(`workout:${KLIC_CELEHO_TRENINKU}`);
}

/**
 * Má se po přepnutí cviku dopsat i dokončení celého tréninku?
 *
 * Vrací true jen když: cvik se zaškrtává (ne odškrtává), po jeho zaškrtnutí
 * budou hotové všechny, a celý trénink ještě zapsaný není.
 *
 * @param {{hotove: Set<string>, pocetCviku: number, index: number, zaskrtava: boolean}} vstup
 * @returns {boolean}
 */
export function maSeDopsatCelyTrenink({ hotove, pocetCviku, index, zaskrtava } = {}) {
  if (!zaskrtava) return false;
  const n = Number(pocetCviku);
  if (!Number.isInteger(n) || n <= 0) return false;
  if (jeTreninkHotovy(hotove)) return false;

  for (let i = 0; i < n; i += 1) {
    if (i === Number(index)) continue;
    if (!jeCvikHotovy(hotove, i)) return false;
  }
  return true;
}

/**
 * Text o průběhu tréninku, nebo null když se nemá vypisovat.
 *
 * Nula z osmi se nevypisuje — kdo ještě nezačal, nepotřebuje to číst.
 *
 * @param {number} hotovo
 * @param {number} celkem
 * @returns {string|null}
 */
export function popisProbehu(hotovo, celkem) {
  const h = Number(hotovo);
  const c = Number(celkem);
  if (!Number.isInteger(h) || !Number.isInteger(c) || c <= 0 || h <= 0) return null;
  return `${h} z ${c} ${c === 1 ? 'cviku' : 'cviků'} hotovo`;
}
