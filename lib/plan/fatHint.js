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

/**
 * TVRDÁ VALIDACE V zapisRecept() — docs/DALSI_KROK.md 8.13.
 *
 * 8.8 dala tuku vazbu na výrobu jen jako ZADÁNÍ DO PROMPTU (`fat_hint`,
 * NENÍ tvrdá validace — viz hlavička souboru). Tři měření po sobě ukázala,
 * že to nestačí:
 *
 *   3. 9.  před 8.8    45,0 % kalorií z tuku
 *   4. 9.  po 8.8      49,6 %
 *   4. 9.  druhý běh   47,5 %   (1 recept z 12 pod 35 %)
 *
 * Bílkovinový hint, který se v `zapisRecept()` TVRDĚ validuje
 * (`receptSplnujePodil`/`pod_cilem_bilkovin`, lib/plan/proteinHint.js),
 * drží 33 % spolehlivě. Rozdíl je přesně mezi "kontrolováno" a "jen
 * napsáno do promptu" — tuk proto potřebuje stejnou tvrdou kontrolu.
 *
 * `podilTukuReceptu`/`receptNepresahujeStropTuku` jsou VLASTNÍ, samostatné
 * funkce, mirror `podilBilkovinReceptu`/`receptSplnujePodil`
 * (lib/plan/proteinHint.js) — ne přejaté z `lib/nutrition/cilTukuSlotu.js`
 * (`podilTuku`), stejně jako proteinová dvojice žije v "objednávka" modulu,
 * ne v "výběr" modulu. Dva různé kontexty, dvě zrcadlová místa.
 */

/**
 * SPODNÍ HRANICE VALIDAČNÍHO STROPU — docs/DALSI_KROK.md 8.13.
 *
 * NENÍ CÍL SYSTÉMU (ten je `CIL_PODILU_TUKU` = 0,28). Je to mez
 * SPLNITELNOSTI, pod kterou by tvrdá validace frontu ucpala. Rozložení
 * 110 receptů `llm_generated` za 7 dní (4. 9. 2026):
 *
 *   medián            51,4 % kalorií z tuku
 *   do 30 %           15 ze 110   (14 %)
 *   do 35 %           21          (19 %)
 *   do 40 %           33          (30 %)
 *   do 45 %           43          (39 %)
 *
 * Tvrdý strop na 0,30 (= `VYCHOZI_STROP_TUKU_OBJEDNAVKY`, dnešní
 * `fat_hint`) by zahodil 86 % dávky — přesně to riziko, kvůli kterému 8.8
 * zůstala jen jako prompt. 0,45 propustí 39 % — tlak (medián 51,4 % je
 * pořád nad ním), ne zaseknutá fronta.
 *
 * UTAHUJE SE PO NASAZENÍ podle počítadla `zahozeno_nad_stropem_tuku`
 * (`ai_runs.result`), ne dopředu — dokud měření neukáže, že fronta má
 * rezervu, tahle hodnota se nesnižuje.
 */
export const MIN_TVRDY_STROP_TUKU = 0.45;

/**
 * Skutečný strop pro TVRDOU validaci v `zapisRecept()`.
 *
 * Bere se z `fat_hint` položky fronty, ale NIKDY níž než
 * `MIN_TVRDY_STROP_TUKU` — syrový `fat_hint` (výchozí 0,30, `VYCHOZI_
 * STROP_TUKU_OBJEDNAVKY`) je zadání do PROMPTU, jako validační strop by
 * frontu ucpal (viz rozložení výš). Chybějící/neplatný `fat_hint` spadne
 * na `VYCHOZI_STROP_TUKU_OBJEDNAVKY`, než se aplikuje spodní mez — stejné
 * chování jako `omezStropTukuProObjednavku`.
 *
 * @param {number|string|null|undefined} fatHint sloupec recipe_generation_queue.fat_hint
 * @returns {number}
 */
export function validacniStropTuku(fatHint) {
  const n = Number(fatHint);
  const zaklad = Number.isFinite(n) && n > 0 ? n : VYCHOZI_STROP_TUKU_OBJEDNAVKY;
  return Math.max(zaklad, MIN_TVRDY_STROP_TUKU);
}

/**
 * Podíl tuku na energii hotového receptu — mirror `podilBilkovinReceptu`
 * (proteinHint.js). Počítá se z uložených maker, ne z odhadu; bez kcal
 * nebo bez tuku vrací `null` — recept, u kterého to nejde spočítat, se
 * validací nezahazuje.
 *
 * @param {{kcal?: number, calories?: number, fat_g?: number}} recept
 * @returns {number|null}
 */
export function podilTukuReceptu(recept) {
  const kcal = Number(recept?.kcal ?? recept?.calories);
  const tuk = Number(recept?.fat_g);
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  if (!Number.isFinite(tuk) || tuk < 0) return null;
  return (tuk * 9) / kcal;
}

/**
 * Splňuje recept zadaný tvrdý strop tuku? Mirror `receptSplnujePodil`
 * (proteinHint.js), OBRÁCENÝ SMĚR: tuk je HORNÍ mez, ne dolní.
 *
 * Bez zadání i bez spočítatelného podílu vrací `true` — validace zahazuje
 * jen to, o čem má důkaz. Chybějící hodnota není porušení, stejné pravidlo
 * jako u bílkovin.
 *
 * @param {object} recept
 * @param {number|null} strop
 * @returns {boolean}
 */
export function receptNepresahujeStropTuku(recept, strop) {
  if (strop == null || !Number.isFinite(strop) || strop <= 0) return true;
  const podil = podilTukuReceptu(recept);
  if (podil == null) return true;
  return podil <= strop;
}
