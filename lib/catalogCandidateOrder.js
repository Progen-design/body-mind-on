/**
 * Deterministické, ale nezaujaté pořadí kandidátů z katalogu.
 *
 * PROBLÉM. `fetchCatalogCandidates` volalo `.limit(fetchLimit)` BEZ `ORDER BY`.
 * Postgres pak vrací libovolné řádky — bez řazení není pořadí definované, takže
 * dvě stejná volání můžou vrátit jinou množinu. Zároveň bylo v okně oběda 166
 * receptů proti fetchLimit 150, takže se 16 zahazovalo, a katalog roste ~33
 * receptů denně.
 *
 * Samotné `ORDER BY id` determinismus vyřeší, ale při uříznutí limitem začne
 * zvýhodňovat nízká id — de facto se vrací pořád stejný začátek tabulky. Proto
 * jsou tady dvě věci:
 *
 *   1) `.order('id')` v dotazu (v recipesCatalog.js) = stabilní množina.
 *   2) `seededShuffle()` nad načtenými řádky = nezaujatý výběr, reprodukovatelný
 *      pro stejného uživatele a stejný týden, protože jede z `catalogPickSeed`.
 *
 * Dřív se míchalo `Math.random()`, takže výběr byl při každém volání jiný —
 * plán se nedal reprodukovat a stejný uživatel dostal při přegenerování jiné
 * jídlo bez zjevného důvodu.
 *
 * Modul je bez závislostí schválně, aby se dal unit-testovat: recipesCatalog.js
 * táhne supabaseServer a v čistém Node se naimportovat nedá.
 */

/**
 * Zamíchá 32bitový stav — stejná mixovací funkce jako seededPickIndex
 * v portionScaling, aby se seedy chovaly konzistentně napříč repem.
 *
 * @param {number} seed
 * @param {number} salt
 * @returns {number} uint32
 */
export function mixSeed(seed, salt = 0) {
  let h = (Number(seed) >>> 0) ^ (Math.imul(Number(salt) >>> 0, 2654435761));
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return h >>> 0;
}

/**
 * Deterministický generátor z jednoho uint32 stavu (mulberry32).
 * Vrací funkci, která dává čísla v [0, 1).
 *
 * @param {number} stav uint32
 * @returns {() => number}
 */
export function seededRandom(stav) {
  let a = stav >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates řízený seedem. Nemodifikuje vstup.
 *
 * Stejný seed + stejný vstup = stejné pořadí. Jiný seed = jiné pořadí.
 * Nezvýhodňuje ani nízká, ani vysoká id — pozice řádku po zamíchání na jeho
 * id nezávisí.
 *
 * @template T
 * @param {T[]} rows
 * @param {number} seed
 * @param {number} [salt=0]
 * @returns {T[]}
 */
export function seededShuffle(rows, seed, salt = 0) {
  if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? [...rows] : [];
  const out = [...rows];
  const rand = seededRandom(mixSeed(seed, salt));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Strop na počet načtených řádků.
 *
 * Není to cíl, ale STROP — reálně se načte jen tolik řádků, kolik jich okno
 * najde (u oběda dnes 166). Je schválně nad velikostí celého katalogu (~570
 * receptů), aby uříznutí nenastalo ani po měsících růstu. Kdyby přesto
 * nastalo, `fetchCatalogCandidates` to nahlásí do logu — protože právě tam
 * začne `ORDER BY id` zvýhodňovat nízká id.
 */
export const CATALOG_FETCH_CEILING = 1000;
