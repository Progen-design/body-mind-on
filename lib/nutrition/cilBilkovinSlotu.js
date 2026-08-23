/**
 * BÍLKOVINY DO VÝBĚRU JÍDLA.
 *
 * Do 23. 8. 2026 se recept vybíral podle dvou věcí: vzdálenosti od kalorického
 * cíle slotu a skóre jednoduchosti (`catalogPickRank`). Bílkoviny, sacharidy
 * ani tuky nevstupovaly ani do SQL filtru, ani do řazení, ani do škálování
 * porcí, ani do žádné validace. Denní makra byla vedlejší produkt toho, co
 * katalog náhodou nabídl v daném kalorickém pásmu.
 *
 * Změřeno na produkci na všech aktivních plánech:
 *   cíl 158 g -> jídlo dalo 150 g (95 %)
 *   cíl 161 g -> 168 g (104 %)
 *   cíl 185 g -> 106 g (57 %)   <- rozjelo se, jakmile cíl stoupl
 *   cíl 234 g -> 196 g (84 %)
 * Kalorie seděly vždy do 2 %. Čím vyšší cíl bílkovin, tím větší minutí.
 *
 * PROČ SE POČÍTÁ PODÍL, NE GRAMY. Porce se škálují jediným násobkem z poměru
 * kalorií (`clampedPortionMultiplier`), takže se makra škálují týmž číslem.
 * Po naškálování na cíl slotu tedy platí
 *   bílkoviny_po_škálování = cíl_slotu_kcal * (protein_g * 4 / kcal) / 4
 * Absolutní gramy receptu o výsledku nerozhodují — rozhoduje jeho PODÍL
 * bílkovin na kaloriích. Řadí se proto podle podílu.
 */

/** Energie na gram bílkovin. */
const KCAL_NA_GRAM_BILKOVIN = 4;

/**
 * Strop podílu. Nad 55 % kalorií z bílkovin se nedostane skoro žádné reálné
 * jídlo a cíl by jen zkreslil řazení všech kandidátů stejným směrem.
 */
const MAX_PODIL = 0.55;

/**
 * Nedosažení cíle se penalizuje víc než překročení. Při pevných kaloriích je
 * málo bílkovin skutečná chyba (chybí stavební materiál), zatímco víc bílkovin
 * jen ubere sacharidy — u redukce to není problém.
 */
const VAHA_POD_CILEM = 1.0;
const VAHA_NAD_CILEM = 0.35;

/**
 * Podíl bílkovin na energii jídla. `null`, když se to z řádku nedá spočítat —
 * projekt nedopočítává, co nezná.
 *
 * @param {number|string|null|undefined} kcal
 * @param {number|string|null|undefined} proteinG
 * @returns {number|null} 0..1, nebo null
 */
export function podilBilkovin(kcal, proteinG) {
  // `Number(null)` je 0 a `Number('')` taky. Bez tohohle testu by recept
  // s nevyplněnými bílkovinami vyšel jako recept s 0 % bílkovin a řazení by
  // ho tvrdě potopilo — přitom o něm nevíme nic. Chybějící hodnota není nula.
  if (proteinG === null || proteinG === undefined || proteinG === '') return null;
  const k = Number(kcal);
  const p = Number(proteinG);
  if (!Number.isFinite(k) || k <= 0) return null;
  if (!Number.isFinite(p) || p < 0) return null;
  const podil = (p * KCAL_NA_GRAM_BILKOVIN) / k;
  if (!Number.isFinite(podil)) return null;
  return Math.min(podil, MAX_PODIL);
}

/**
 * Jaký podíl bílkovin musí mít ZBYTEK dne, aby se den ještě trefil do cíle.
 *
 * Tohle je samoopravné: když snídaně vyjde slabá (katalog snídaní má bílkovin
 * málo), zvedne se nárok na oběd a večeři, kde katalog bílkoviny má. Kdyby se
 * každému slotu dal pevný podíl, chyba ze snídaně by se do dne přenesla celá.
 *
 * @param {number} zbyvaKcal kolik kalorií dne ještě zbývá rozdělit
 * @param {number} zbyvaBilkovinG kolik gramů bílkovin dne ještě zbývá
 * @returns {number|null} cílový podíl 0..MAX_PODIL, nebo null když se nedá určit
 */
export function cilPodiluProZbytekDne(zbyvaKcal, zbyvaBilkovinG) {
  const k = Number(zbyvaKcal);
  const p = Number(zbyvaBilkovinG);
  if (!Number.isFinite(k) || k <= 0) return null;
  if (!Number.isFinite(p)) return null;
  if (p <= 0) return 0;
  return Math.min((p * KCAL_NA_GRAM_BILKOVIN) / k, MAX_PODIL);
}

/**
 * Penalizace receptu za minutí cílového podílu bílkovin, v kaloriích.
 *
 * Vrací se v kaloriích schválně — `catalogPickRank` sčítá s `|kcal - cíl|`,
 * takže obě složky musí být ve stejné jednotce, jinak by se váhy nedaly
 * rozumně nastavit.
 *
 * @param {object} row řádek recipes_catalog
 * @param {number} slotTargetKcal kalorický cíl slotu
 * @param {number|null} cilovyPodil cílový podíl bílkovin (0..1) nebo null
 * @returns {number} 0, když cíl není znám nebo recept sedí
 */
export function penalizaceZaBilkoviny(row, slotTargetKcal, cilovyPodil) {
  if (cilovyPodil == null || !Number.isFinite(cilovyPodil)) return 0;
  const cil = Number(slotTargetKcal);
  if (!Number.isFinite(cil) || cil <= 0) return 0;

  const podil = podilBilkovin(row?.kcal, row?.protein_g);
  // Recept bez použitelných maker se nepenalizuje ani nezvýhodňuje. Vymýšlet
  // si za něj hodnotu by znamenalo řadit podle čísla, které nikdo nenaměřil.
  if (podil == null) return 0;

  const rozdil = podil - cilovyPodil;
  const vKcal = Math.abs(rozdil) * cil;
  return rozdil < 0 ? vKcal * VAHA_POD_CILEM : vKcal * VAHA_NAD_CILEM;
}

export const MEZE_PODILU = Object.freeze({
  MAX_PODIL,
  VAHA_POD_CILEM,
  VAHA_NAD_CILEM,
  KCAL_NA_GRAM_BILKOVIN,
});
