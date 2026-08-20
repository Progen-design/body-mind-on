/**
 * OSA GRAFU „PŘEHLED PO DNECH“ U NÁVYKŮ.
 *
 * Graf je rozdělený na dvě půlky: nahoru rostou splněné zdravé návyky, dolů
 * zaznamenané zlozvyky. Osa se dřív kreslila jako souvislá řada od `max` do
 * `-max`, takže spodní půlka nesla popisky −1, −2. Čte se to jako záporný
 * počet splněných návyků, což je nesmysl — dolů se počítá jiná veličina, ne
 * záporná hodnota téže.
 *
 * Popisky jsou proto odteď v absolutní hodnotě a směr nese legenda. A když
 * uživatel žádné zlozvyky nesleduje, spodní půlka se nekreslí vůbec — osa jde
 * od nuly nahoru.
 *
 * HORNÍ MEZ JE NEJVYŠŠÍ NAMĚŘENÁ HODNOTA, ne počet všech návyků. U patnácti
 * sledovaných návyků a třech splněných denně by osa do patnácti stlačila
 * všechny sloupce k nule a graf by nic neukázal.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/**
 * Horní mez osy z naměřených dat.
 *
 * @param {Array<{posCount?: number, negCount?: number}>} dny
 * @returns {number} vždy aspoň 1, aby se nedělilo nulou
 */
export function hornMez(dny = []) {
  let max = 0;
  for (const d of Array.isArray(dny) ? dny : []) {
    const p = Number(d?.posCount) || 0;
    const n = Number(d?.negCount) || 0;
    if (p > max) max = p;
    if (n > max) max = n;
  }
  return Math.max(1, max);
}

/** Sleduje uživatel vůbec nějaké zlozvyky? Bez nich nemá spodní půlka smysl. */
export function maSpodniPul(pocetZlozvyku) {
  return (Number(pocetZlozvyku) || 0) > 0;
}

/**
 * Popisky osy odshora dolů.
 *
 * Vrací objekty, ne holá čísla, protože pozice a popisek nejsou totéž:
 * `hodnota` říká, kde tick leží (−2 je dole), `popisek` co se tam píše („2“).
 *
 * @param {number} max
 * @param {boolean} spodniPul
 * @returns {Array<{hodnota: number, popisek: string}>}
 */
export function popiskyOsy(max, spodniPul) {
  const m = Math.max(1, Math.round(Number(max) || 1));
  const od = spodniPul ? -m : 0;
  const ticky = [];
  for (let v = m; v >= od; v -= 1) {
    ticky.push({ hodnota: v, popisek: String(Math.abs(v)) });
  }
  return ticky;
}
