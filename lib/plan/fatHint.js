/**
 * TUKOVÝ STROP PRO OBJEDNÁVKU RECEPTU — docs/DALSI_KROK.md 8.8.
 *
 * 8.4 dalo tuku vazbu na cíl při VÝBĚRU jídla (`lib/nutrition/cilTukuSlotu.js`)
 * a změřilo, že to nestačí: řazení nevybere recept, který v katalogu není,
 * a `llm_generated` (jediný živý zdroj, +20 receptů denně) dnes vyrábí recepty
 * s 44–48 % kalorií z tuku proti cíli 27–28 %. Bez cíle na VÝROBĚ katalog
 * KAŽDÝ DEN zhoršuje. Tenhle modul dává frontě generátoru stejný nástroj,
 * jaký `lib/plan/proteinHint.js` dal bílkovinám — cíl v objednávce, promítnutý
 * do promptu jako instrukce, ne jako tvrdá validace (viz `MAX_STROP...` níž).
 *
 * PROČ NE STEJNÝ TVAR JAKO protein_hint. Bílkovinový hint nese dvě věci
 * (zdroj suroviny + podíl) a proto je to JSON v textovém sloupci. Tuk nemá
 * obdobu „zdroje" — je to jedno číslo, horní mez. Sloupec je proto prostý
 * `numeric`, žádné parsování ani kanonické pořadí klíčů není potřeba.
 *
 * PROČ JE TO STROP (HORNÍ MEZ), NE CÍL. Prompt dostane „nejvýš tolik", ne
 * „přesně tolik" — recept s NIŽŠÍM podílem tuku, než kolik strop dovoluje,
 * je v pořádku a žádoucí. To je přesně opačná asymetrie než u bílkovin
 * (`omezPodilProObjednavku`, proteinHint.js), kde hint je DOLNÍ mez
 * a nižší podíl je problém, ne úspěch.
 */

/**
 * Cíl systému: 27–28 % kalorií z tuku (docs/BMON_MAKRA_V_GENERATORU.md bod 4,
 * měřeno na uložených cílech tří účtů — stabilně 27–28 % nezávisle na
 * velikosti kalorického cíle). Informativní konstanta, žádné omezPodilu na ni
 * nepočítá přímo — objednávka žádá `VYCHOZI_STROP_TUKU_OBJEDNAVKY` níž, ne
 * přesně tohle číslo, viz zdůvodnění tamtéž.
 */
export const CIL_PODILU_TUKU = 0.28;

/**
 * VÝCHOZÍ STROP, KTERÝ OBJEDNÁVKA ŽÁDÁ, KDYŽ VOLAJÍCÍ NEZADÁ VLASTNÍ.
 *
 * Nejde o změřený optimální bod jako u bílkovin (0,25 z 8.5, kde existuje
 * skutečná křivka úspěšnosti 0,25→67 %, 0,30→3 %, 0,40+→0 ze 145) — pro tuk
 * takové měření zatím neexistuje, protože se to zavádí až teď. Je to
 * ZDŮVODNĚNÝ PRVNÍ ODHAD ze tří opěrných bodů, které měřená data dávají:
 *
 *   - dnešní neřízený výstup modelu: 44–48 % (docs/DALSI_KROK.md 8.8)
 *   - cíl systému: 27–28 % (`CIL_PODILU_TUKU`)
 *   - ručně psané recepty ve STEJNÉM slovníku surovin (`coach_seed_v1`)
 *     dosahují 20–24 % — důkaz, že cíl je v tomhle vocabulary DOSAŽITELNÝ,
 *     ne teoretické číslo bez opory v datech
 *
 * 0,30 je citelný pokles proti dnešním 44–48 % (bezmála na polovinu cesty
 * k cíli), a přitom zůstává NAD tím, čeho ručně psané recepty prokazatelně
 * dosahují — tedy by nemělo jít o nesplnitelný požadavek. Je to VĚDOMĚ
 * OPATRNÝ první krok, ne finální číslo: bod 8.8 úkol 4 žádá změřit dopad
 * po nasazení a podle toho se má tahle konstanta v příští iteraci utáhnout
 * blíž k `CIL_PODILU_TUKU`, stejným způsobem, jakým se `KROK_KCAL_POPTAVKY`
 * doladil ze 100 na 300 až po naměřených datech (docs/DALSI_KROK.md 8.5).
 */
export const VYCHOZI_STROP_TUKU_OBJEDNAVKY = 0.30;

/**
 * NEJNIŽŠÍ STROP, KTERÝ SMÍ OBJEDNÁVKA ŽÁDAT.
 *
 * U bílkovin je hint DOLNÍ mez a `MAX_PODIL_OBJEDNAVKY` (0,25) brání žádat
 * PŘÍLIŠ VYSOKO — nad tím model spolehlivě nevyrobí nic (8.5: 0,40+ → 0 ze
 * 145). U tuku je hint HORNÍ mez, takže riziko je zrcadlové: žádat PŘÍLIŠ
 * NÍZKO je stejně nesplnitelné, jako bylo žádat příliš vysoko u bílkovin —
 * „recept s nejvýš 10 % kalorií z tuku" je z běžných surovin skoro
 * nevyrobitelný.
 *
 * 0,20 je ukotvené v datech, ne od oka: `coach_seed_v1` (ručně psané recepty,
 * stejný slovník) dosahuje 20–24 % — je to nejnižší podíl, o kterém víme, že
 * ho recepty v tomhle vocabulary reálně dosahují. Objednávka nesmí chtít
 * míň, než co je prokazatelně možné.
 */
export const MIN_STROP_TUKU_OBJEDNAVKY = 0.20;

/**
 * Ořízne požadovaný strop tuku zdola na `MIN_STROP_TUKU_OBJEDNAVKY` a vrátí
 * `VYCHOZI_STROP_TUKU_OBJEDNAVKY`, když volající nezadá nic použitelného.
 *
 * Na rozdíl od `omezPodilProObjednavku` (proteinHint.js), který ořezává
 * SHORA (brání moc vysoké žádosti), tahle funkce ořezává ZDOLA — brání moc
 * nízké žádosti. Zrcadlový tvar té samé myšlenky pro opačnou asymetrii.
 *
 * @param {number|string|null|undefined} hodnota
 * @returns {number} vždy platné číslo, objednávka nikdy nezůstane bez stropu
 */
export function omezStropTukuProObjednavku(hodnota) {
  const n = Number(hodnota);
  if (!Number.isFinite(n) || n <= 0) return VYCHOZI_STROP_TUKU_OBJEDNAVKY;
  return Math.max(MIN_STROP_TUKU_OBJEDNAVKY, n);
}
