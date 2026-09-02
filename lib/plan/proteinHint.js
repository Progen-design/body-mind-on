/**
 * ZADÁNÍ BÍLKOVIN PRO OBJEDNÁVKU RECEPTU.
 *
 * Sloupec `recipe_generation_queue.protein_hint` nese dvě různé věci:
 *
 *   zdroj — „udělej to z ryby“. Rotace, aby katalog nebyl samé kuře.
 *           Klíč skupiny z lib/plan/rotaceBilkovin.js.
 *   podíl — „potřebuju aspoň 28 % kalorií z bílkovin“. Bílkovinový dluh dne,
 *           kvůli kterému se slot nevyřešil dobře.
 *
 * PROČ V JEDNOM SLOUPCI. Rozhodnutí z 23. 8. 2026. Původní návrh sloupce
 * (migrace 20260818140000) počítal jen se zdrojem a měl na to CHECK se sedmi
 * hodnotami. Podíl je číslo, do toho CHECKu se nevejde.
 *
 * FORMÁT. Buď holý klíč skupiny (`ryby`) — tak vypadá sedm řádků, které
 * ve frontě už jsou a musí dál fungovat — nebo JSON objekt:
 *
 *   {"zdroj":"ryby","podil":0.28}
 *
 * KVANTIZACE PODÍLU JE SOUČÁST DEDUPU, ne kosmetika. Viz `KROK_PODILU`.
 *
 * KANONICKÉ POŘADÍ KLÍČŮ JE POVINNÉ. Unikátní index fronty
 * (20260818150000) porovnává `coalesce(protein_hint, '')` jako řetězec, takže
 * `{"podil":0.28,"zdroj":"ryby"}` a `{"zdroj":"ryby","podil":0.28}` by byly
 * dvě různé objednávky na tutéž díru. Serializuje se proto jedině tudy, nikdy
 * přes JSON.stringify na volajícím místě. Pořadí je `zdroj`, pak `podil`.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

import { MEZE_PODILU } from '../nutrition/cilBilkovinSlotu.js';

/**
 * Strop podílu. JEDINÁ HRANICE NAD TOUHLE VELIČINOU.
 *
 * Bere se z `cilBilkovinSlotu.js`, protože `cilPodiluProZbytekDne` na ni sama
 * ořezává — vlastní vyšší strop by udělal mrtvé pásmo, do kterého by se
 * hodnota nikdy nedostala.
 */
export const MAX_PODIL_HINTU = MEZE_PODILU.MAX_PODIL;

/**
 * Krok kvantizace podílu.
 *
 * PROČ SE KVANTIZUJE. Unikátní index fronty (20260818150000) porovnává
 * `coalesce(protein_hint, '')` jako řetězec, ne číslo. `cilPodiluProZbytekDne`
 * vrací spojitou hodnotu, takže bez kroku by dvě sestavení plánu narazila na
 * tutéž díru s podílem 0,283 a 0,284 a založila dvě objednávky. V pásmu
 * 0,15–0,55 je to při zaokrouhlení na tisíciny 401 možných hodnot;
 * s krokem 0,05 jich je devět a dedup opravdu funguje.
 *
 * Hrubost je záměr: rozdíl 5 p. b. v zadání pro model nic nemění, rozdíl mezi
 * jednou a čtyřmi sty objednávkami na stejnou díru ano.
 */
export const KROK_PODILU = 0.05;

function cistyZdroj(hodnota) {
  const s = String(hodnota ?? '').trim();
  return s.length > 0 ? s : null;
}

/**
 * Podíl na použitelné číslo v mezích. NEKVANTIZUJE.
 *
 * Používá se při čtení. Kdyby se kvantizovalo i tady, uložená objednávka
 * s podílem 0,28 by se v přejímce četla jako 0,30 — brána by zahazovala
 * recepty přísněji, než co si objednávka řekla.
 */
function cistyPodil(hodnota) {
  const n = Number(hodnota);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, MAX_PODIL_HINTU);
}

/**
 * Podíl na nejbližší násobek `KROK_PODILU`. Jen pro zápis.
 *
 * K NEJBLIŽŠÍMU násobku, ne nahoru: zaokrouhlování nahoru by z 0,28 a 0,31
 * udělalo 0,30 a 0,35 — dvě objednávky na tutéž díru, přesně to, čemu má
 * kvantizace zabránit. Podstřelení nejvýš o polovinu kroku je u hintu bez
 * následku, protože brána v přejímce se řídí uloženou hodnotou.
 */
function kvantizujPodil(hodnota) {
  const n = cistyPodil(hodnota);
  if (n == null) return null;

  const kroku = Math.max(1, Math.round(n / KROK_PODILU));
  const kvantizovany = Math.min(kroku * KROK_PODILU, MAX_PODIL_HINTU);

  // Násobek 0,05 v plovoucí čárce nevyjde přesně (0,05 * 6 = 0,30000000000000004).
  return Math.round(kvantizovany * 100) / 100;
}

/**
 * Zadání do tvaru pro uložení. `null`, když není co zadat.
 *
 * Samotný zdroj bez podílu se ukládá jako holý klíč, ne jako JSON — starší
 * řádky ve frontě tak zůstanou porovnatelné s nově založenými a unikát je
 * pozná jako tutéž objednávku.
 *
 * @param {{zdroj?: string|null, podil?: number|null}} zadani
 * @returns {string|null}
 */
export function serializujHint(zadani) {
  const zdroj = cistyZdroj(zadani?.zdroj);
  // Kvantizace jen tady — viz `kvantizujPodil`.
  const podil = kvantizujPodil(zadani?.podil);

  if (podil == null) return zdroj;
  // Pořadí klíčů je součást formátu, viz hlavička.
  return zdroj == null
    ? `{"podil":${podil}}`
    : `{"zdroj":${JSON.stringify(zdroj)},"podil":${podil}}`;
}

/**
 * Uložená hodnota zpátky na zdroj a podíl.
 *
 * Nikdy nevyhodí výjimku — rozbitý řádek ve frontě nesmí shodit generátor.
 * Neznámý tvar se čte jako „nic zadáno“ a běh si zdroj odvodí sám.
 *
 * @param {unknown} hodnota
 * @returns {{zdroj: string|null, podil: number|null}}
 */
export function rozparsujHint(hodnota) {
  const prazdno = { zdroj: null, podil: null };

  if (hodnota == null) return prazdno;
  if (typeof hodnota === 'object') {
    return { zdroj: cistyZdroj(hodnota.zdroj), podil: cistyPodil(hodnota.podil) };
  }

  const text = String(hodnota).trim();
  if (!text) return prazdno;

  // Sedm řádků ve frontě má holý klíč skupiny. Ty musí dál fungovat.
  if (!text.startsWith('{')) return { zdroj: text, podil: null };

  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object') return prazdno;
    return { zdroj: cistyZdroj(o.zdroj), podil: cistyPodil(o.podil) };
  } catch {
    return prazdno;
  }
}

/**
 * Podíl bílkovin na kaloriích u hotového receptu, nebo null.
 *
 * Počítá se z uložených maker, ne z odhadu. Bez kcal nebo bez bílkovin se
 * vrací null — recept, u kterého to nejde spočítat, se bránou nezahazuje.
 *
 * @param {{kcal?: number, calories?: number, protein_g?: number}} recept
 * @returns {number|null}
 */
export function podilBilkovinReceptu(recept) {
  const kcal = Number(recept?.kcal ?? recept?.calories);
  const bilkoviny = Number(recept?.protein_g);
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  if (!Number.isFinite(bilkoviny) || bilkoviny < 0) return null;
  return (bilkoviny * 4) / kcal;
}

/**
 * Splňuje recept zadaný minimální podíl?
 *
 * Bez zadání i bez spočítatelného podílu vrací `true` — brána zahazuje jen
 * to, o čem má důkaz. Tolerance je schválně nulová: `podil` už je práh,
 * ne cíl.
 *
 * @param {object} recept
 * @param {number|null} minPodil
 * @returns {boolean}
 */
export function receptSplnujePodil(recept, minPodil) {
  if (minPodil == null || !Number.isFinite(minPodil) || minPodil <= 0) return true;
  const podil = podilBilkovinReceptu(recept);
  if (podil == null) return true;
  return podil >= minPodil;
}

/**
 * STROP PRO OBJEDNÁVKU, NE PRO ULOŽENÍ. `MAX_PODIL_HINTU` výš je hranice, nad
 * kterou `cilPodiluProZbytekDne` (cilBilkovinSlotu.js) nejde — ale to je limit
 * toho, co je VÝŽIVOVĚ ještě rozumné žádat, ne toho, co generátor UMÍ vyrobit.
 * Ta dvě čísla jsou jinak daleko od sebe.
 *
 * Změřeno na produkci 2. 9. 2026 (docs/DALSI_KROK.md 8.5,
 * docs/BMON_ZDROJE_RECEPTU_2026-09-02.md bod 6), svačiny, střed pásma 270 kcal:
 *
 *   podíl 0,20 → 47 %     podíl 0,30 →  3 %     podíl 0,45 → 0/30
 *   podíl 0,25 → 67 %     podíl 0,35 →  3 %     podíl 0,50 → 0/30
 *                         podíl 0,40 → 0/40     podíl 0,55 → 0/40
 *
 * Hranice použitelnosti leží mezi 0,25 (67 %) a 0,30 (propad na 3 %, ne
 * pozvolný pokles). Strop je 0,25, ne někde mezi 0,25 a 0,30 — je to
 * POSLEDNÍ hodnota s vysokou úspěšností, ne střed intervalu. Nad ní model
 * spolehlivě nevyrobí nic: 40 objednávek s podílem ≥ 0,40 dalo nula receptů.
 *
 * Zastropování na objednávce je zároveň to, co PŘERUŠUJE samozesilující
 * smyčku „slot se nevyřeší → objedná se recept s podílem, který se nenašel
 * → nevyrobí se → příště se objedná s ještě vyšším". `cilPodiluProZbytekDne`
 * počítá dluh za slabší den dál, klidně až k `MAX_PODIL_HINTU` (0,55) — ale
 * do OBJEDNÁVKY se přes tenhle strop nikdy nedostane. Nevyrobený požadavek
 * není důkaz, že bylo potřeba žádat víc; je to důkaz, že se žádalo víc, než
 * generátor umí.
 */
export const MAX_PODIL_OBJEDNAVKY = 0.25;

/**
 * Ořízne podíl bílkovin na to, co generátor doopravdy umí vyrobit — viz
 * `MAX_PODIL_OBJEDNAVKY`. Chybějící/neplatná hodnota zůstává `null` (bez
 * zadání se nežádá nic navíc).
 *
 * @param {number|string|null|undefined} podil
 * @returns {number|null}
 */
export function omezPodilProObjednavku(podil) {
  const n = Number(podil);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, MAX_PODIL_OBJEDNAVKY);
}
