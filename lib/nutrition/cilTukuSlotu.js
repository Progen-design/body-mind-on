/**
 * TUK DO VÝBĚRU JÍDLA — zrcadlo cilBilkovinSlotu.js, s OBRÁCENOU ASYMETRIÍ.
 *
 * docs/DALSI_KROK.md 8.4. Do tohohle bodu měl tuk na cíl výživy nulovou
 * vazbu — vybíralo se jen podle kalorií, jednoduchosti a (od 23. 8. 2026)
 * bílkovin. Změřeno na 140 dnech ve 20 aktivních plánech, podíl
 * skutečnost/cíl: bílkoviny 94 % (45 % dnů v ±10 %), sacharidy 79 % (25 %),
 * TUKY 148 % (jen 10 % dnů v ±10 %) — nejhorší ze tří a jediné bez
 * mechanismu.
 *
 * PROČ OBRÁCENĚ. U bílkovin bolí podstřelení (chybí stavební materiál).
 * U tuku bolí PŘESTŘELENÍ — je to typický vedlejší efekt honby za
 * bílkovinami (maso a mléčné výrobky nesou tuk s sebou) a měření to
 * potvrzuje: průměr 148 % cíle, rozsah 80–251 %, nikdy podstřelení jako
 * dominantní problém. Nízký podíl tuku není chyba, kterou je třeba honit.
 *
 * PROČ NIŽŠÍ VÁHA NEŽ BÍLKOVINY. `VAHA_NAD_CILEM_TUK` (nejhorší směr pro
 * tuk) je schválně nižší než `VAHA_POD_CILEM` bílkovin (1,0,
 * cilBilkovinSlotu.js) — při konfliktu (recept dobrý na bílkoviny, špatný
 * na tuk, proti receptu opačně) musí vyhrát bílkoviny. Je to produktová
 * priorita z docs/BMON_MAKRA_V_GENERATORU.md bodu 3, ne naměřené optimum.
 */

/** Energie na gram tuku. */
const KCAL_NA_GRAM_TUKU = 9;

/**
 * Strop podílu. Čistý tuk (olej, máslo, ořechy) může nést většinu kalorií
 * receptu — vyšší strop než u bílkovin (0,55, cilBilkovinSlotu.js), kde nad
 * ním skoro žádné reálné jídlo neexistuje. Bez stropu by jeden extrémní
 * kandidát (recept postavený na oleji) zkreslil řazení celé skupiny.
 */
const MAX_PODIL = 0.70;

/**
 * Přestřelení se penalizuje víc než podstřelení — opak bílkovin. Při pevných
 * kaloriích málo tuku nikomu neškodí (ubere prostor sacharidům, ne
 * stavebnímu materiálu), zatímco moc tuku je přesně ten měřený problém
 * (148 % cíle). Obě váhy navíc níž než bílkovinné protějšky
 * (`VAHA_POD_CILEM = 1,0`), aby bílkoviny při konfliktu vyhrály — viz
 * hlavička souboru a docs/BMON_MAKRA_V_GENERATORU.md bod 2.
 */
const VAHA_POD_CILEM_TUK = 0.2;
const VAHA_NAD_CILEM_TUK = 0.6;

/**
 * Podíl tuku na energii jídla. `null`, když se to z řádku nedá spočítat —
 * stejné pravidlo jako `podilBilkovin` (cilBilkovinSlotu.js): chybějící
 * hodnota není nula.
 *
 * @param {number|string|null|undefined} kcal
 * @param {number|string|null|undefined} fatG
 * @returns {number|null} 0..1, nebo null
 */
export function podilTuku(kcal, fatG) {
  if (fatG === null || fatG === undefined || fatG === '') return null;
  const k = Number(kcal);
  const f = Number(fatG);
  if (!Number.isFinite(k) || k <= 0) return null;
  if (!Number.isFinite(f) || f < 0) return null;
  const podil = (f * KCAL_NA_GRAM_TUKU) / k;
  if (!Number.isFinite(podil)) return null;
  return Math.min(podil, MAX_PODIL);
}

/**
 * Jaký podíl tuku smí mít ZBYTEK dne, aby se den ještě trefil do cíle.
 *
 * Mirror `cilPodiluProZbytekDne` (cilBilkovinSlotu.js). Když je denní tuk
 * už vyčerpaný (nebo přestřelený — `zbyvaTukuG <= 0`), nárok na zbytek dne
 * padá na nulu — a to je tady žádoucí chování, ne okrajový případ: den, kde
 * se tuk už přestřelil, má zbytek slotů tlačit k co nejnižšímu podílu.
 *
 * @param {number} zbyvaKcal kolik kalorií dne ještě zbývá rozdělit
 * @param {number} zbyvaTukuG kolik gramů tuku dne ještě zbývá do cíle
 * @returns {number|null} cílový podíl 0..MAX_PODIL, nebo null když se nedá určit
 */
export function cilPodiluTukuProZbytekDne(zbyvaKcal, zbyvaTukuG) {
  const k = Number(zbyvaKcal);
  const t = Number(zbyvaTukuG);
  if (!Number.isFinite(k) || k <= 0) return null;
  if (!Number.isFinite(t)) return null;
  if (t <= 0) return 0;
  return Math.min((t * KCAL_NA_GRAM_TUKU) / k, MAX_PODIL);
}

/**
 * Penalizace receptu za minutí cílového podílu tuku, v kaloriích — stejná
 * jednotka jako `penalizaceZaBilkoviny`, aby šly sečíst v `catalogPickRank`.
 *
 * Žádný SQL filtr, žádná tvrdá podmínka — tohle je jediné místo, kde tuk
 * ovlivňuje výběr, a je to řazení, ne vyloučení.
 *
 * @param {object} row řádek recipes_catalog
 * @param {number} slotTargetKcal kalorický cíl slotu
 * @param {number|null} cilovyPodil cílový podíl tuku (0..1) nebo null
 * @returns {number} 0, když cíl není znám nebo recept sedí
 */
export function penalizaceZaTuk(row, slotTargetKcal, cilovyPodil) {
  if (cilovyPodil == null || !Number.isFinite(cilovyPodil)) return 0;
  const cil = Number(slotTargetKcal);
  if (!Number.isFinite(cil) || cil <= 0) return 0;

  const podil = podilTuku(row?.kcal, row?.fat_g);
  // Recept bez použitelných maker se nepenalizuje ani nezvýhodňuje.
  if (podil == null) return 0;

  const rozdil = podil - cilovyPodil;
  const vKcal = Math.abs(rozdil) * cil;
  // OBRÁCENĚ oproti bílkovinám: přestřelení (rozdil > 0) váží víc.
  return rozdil > 0 ? vKcal * VAHA_NAD_CILEM_TUK : vKcal * VAHA_POD_CILEM_TUK;
}

/**
 * Průměrný podíl tuku na kaloriích, PO MEAL_TYPE — ne jeden zprůměrovaný
 * výsledek přes celý plán.
 *
 * DŮVOD (docs/BMON_MAKRA_V_GENERATORU.md bod 4, docs/DALSI_KROK.md 8.4 bod 2):
 * pool nízkotučných receptů v pásmu slotu je dramaticky nerovnoměrný —
 * u oběda a večeře je 5–12× nad týdenní potřebou, u svačiny na hraně nebo
 * pod ní (tvrdý týdenní strop opakování, `MAX_OPAKOVANI_RECEPTU_TYDNE`,
 * pestrostReceptu.js). Jeden průměr přes celý plán by úspěch u oběda schoval
 * za neúspěch u svačiny. Čistá funkce, testovatelná bez DB.
 *
 * @param {Array<{meals?: Array<{type?: string, kcal?: number, fat_g?: number}>}>} resolvedDny
 * @returns {Record<string, {pocet: number, prumerny_podil: number}>} klíč je `meal.type` (anglický slot)
 */
export function trefaTukuPoTypuJidla(resolvedDny) {
  /** @type {Record<string, {soucet: number, pocet: number}>} */
  const agregat = {};
  for (const den of resolvedDny || []) {
    for (const m of den?.meals || []) {
      const podil = podilTuku(m?.kcal, m?.fat_g);
      if (podil == null) continue;
      const typ = String(m?.type || 'lunch');
      if (!agregat[typ]) agregat[typ] = { soucet: 0, pocet: 0 };
      agregat[typ].soucet += podil;
      agregat[typ].pocet += 1;
    }
  }
  /** @type {Record<string, {pocet: number, prumerny_podil: number}>} */
  const vystup = {};
  for (const [typ, a] of Object.entries(agregat)) {
    vystup[typ] = {
      pocet: a.pocet,
      prumerny_podil: Math.round((a.soucet / a.pocet) * 1000) / 1000,
    };
  }
  return vystup;
}

export const MEZE_PODILU_TUKU = Object.freeze({
  MAX_PODIL,
  VAHA_POD_CILEM_TUK,
  VAHA_NAD_CILEM_TUK,
  KCAL_NA_GRAM_TUKU,
});
