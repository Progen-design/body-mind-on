/**
 * Kdy má smysl platit za generování — čisté funkce bez DB a bez modelu.
 *
 * PROMPT_NAKLADY_MINIMUM.md (21. 9. 2026). Generátor tvořil 99 % útraty
 * ($19,04 z 30 dní) a víc objednávek padlo, než prošlo (106 failed, 63 done):
 * za tokeny těch 106 se platilo a nevzniklo nic. Tři dotazy, které si každá
 * položka fronty musí obhájit DŘÍV, než se pošle modelu:
 *
 *   1. Nevyčerpala už pokusy?                 → `MAX_POKUSU_POLOZKY`
 *   2. Je za ní reálná poptávka?              → `maPoptavku()`
 *   3. Nenaplnil se slot mezitím sám?         → `potrebaKusu()`
 *
 * Validace receptů (makra, Atwater, bílkoviny) tady NENÍ a nesmí být — tohle
 * jen rozhoduje, jestli se model vůbec zavolá.
 */
import { MIN_RECEPTU_NA_SLOT } from './dietOptions.js';
import { rozparsujHint, receptSplnujePodil } from './plan/proteinHint.js';

/**
 * Nejvíc běhů, ve kterých smí být jedna položka fronty vzata k modelu.
 * (Uvnitř jednoho běhu jsou navíc až dvě volání — druhé s opravou z prvního.)
 * Po vyčerpání zůstane `failed` a `nactiFrontu()` ji nevrací; ruční spuštění
 * s `queue_id` cap obchází.
 */
export const MAX_POKUSU_POLOZKY = 2;

/** Poptávka starší než tohle už není „reálná“ — sedí s oknem plniče fronty. */
export const OKNO_POPTAVKY_DNI = 7;

/** Klíč slotu — pořadí tagů nesmí rozhodovat. */
export function klicSlotu(mealType, dietTags) {
  const tagy = Array.from(new Set((dietTags || []).map((t) => String(t).trim().toLowerCase()))).sort();
  return `${String(mealType || '').trim().toLowerCase()}|${tagy.join(',')}`;
}

/**
 * Množina slotů s reálnou poptávkou z `catalog_slot_demand` — stejná
 * podmínka jako `fill_recipe_queue_from_demand`: tvrdá díra
 * (`nevyresenych > 0`), nebo skoro prázdná nabídka (`kandidatu_min <= 3`).
 *
 * @param {Array<{meal_type?: string, diet_tags?: string[], nevyresenych?: number|null, kandidatu_min?: number|null}>} radky
 * @returns {Set<string>}
 */
export function slotySPoptavkou(radky) {
  const sloty = new Set();
  for (const r of Array.isArray(radky) ? radky : []) {
    const diraTvrda = Number(r?.nevyresenych) > 0;
    const nabidkaTenka = r?.kandidatu_min != null && Number(r.kandidatu_min) <= 3;
    if (diraTvrda || nabidkaTenka) sloty.add(klicSlotu(r.meal_type, r.diet_tags));
  }
  return sloty;
}

/**
 * @param {{ meal_type?: string, diet_tags?: string[] }} polozka
 * @param {Set<string>} sloty výstup `slotySPoptavkou()`
 */
export function maPoptavku(polozka, sloty) {
  return sloty.has(klicSlotu(polozka?.meal_type, polozka?.diet_tags));
}

/**
 * Kolik aktivních receptů už objednávce vyhovuje: stejný chod, dietní tagy
 * (recept musí mít všechny tagy objednávky), kalorické pásmo a — když
 * objednávka nese minimální podíl bílkovin — i ten. Zdroj bílkoviny se
 * neověřuje: počítá se jen to, co jde poznat z čísel v katalogu, ať se slot
 * nikdy neoznačí za naplněný na základě domněnky.
 *
 * @param {{ diet_tags?: string[], kcal_min?: number|null, kcal_max?: number|null, protein_hint?: string|null }} polozka
 * @param {Array<{ diet_tags?: string[]|null, kcal?: number|null, protein_g?: number|null }>} recepty aktivní recepty téhož chodu
 */
export function pocetVyhovujicich(polozka, recepty) {
  const potrebneTagy = (polozka?.diet_tags || []).map((t) => String(t).trim().toLowerCase());
  const min = Number(polozka?.kcal_min) || null;
  const max = Number(polozka?.kcal_max) || null;
  const minPodil = rozparsujHint(polozka?.protein_hint).podil;

  let pocet = 0;
  for (const r of Array.isArray(recepty) ? recepty : []) {
    const tagyReceptu = new Set((r?.diet_tags || []).map((t) => String(t).trim().toLowerCase()));
    if (!potrebneTagy.every((t) => tagyReceptu.has(t))) continue;

    const kcal = Number(r?.kcal);
    if (!Number.isFinite(kcal)) continue;
    if ((min && kcal < min) || (max && kcal > max)) continue;

    if (minPodil != null && !receptSplnujePodil({ kcal, protein_g: Number(r?.protein_g) }, minPodil)) continue;
    pocet += 1;
  }
  return pocet;
}

/**
 * Kolik receptů slotu ještě chybí do `MIN_RECEPTU_NA_SLOT` (kolik jich slot
 * potřebuje, aby se týden neopakoval — tolik se i objednává). 0 = slot se
 * mezitím naplnil a objednávka je `nadbytecna`: model se nevolá.
 */
export function potrebaKusu(polozka, recepty) {
  return Math.max(0, MIN_RECEPTU_NA_SLOT - pocetVyhovujicich(polozka, recepty));
}
