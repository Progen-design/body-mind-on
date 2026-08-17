/**
 * PESTROST JÍDELNÍČKU — kolikrát smí tentýž recept přijít v jednom týdnu.
 *
 * Vlastní modul schválně: `recipesCatalog.js` si při importu táhne Supabase
 * klienta, takže pravidlo, které je čistou funkcí nad dvěma kolekcemi, by se
 * jinak nedalo otestovat bez databáze.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROČ TO VZNIKLO
 *
 * Změřeno na plánu 25b7017a (17. 8. 2026), katalog měl 632 aktivních receptů:
 * snídaně 2 různé ze 7 (jeden recept 4×), svačiny 6 ze 14. Nechyběli kandidáti,
 * chyběl strop — týdenní vyloučení bylo jen MĚKKÁ preference (`excludeIds`),
 * kterou poslední stupně eskalace zahazují, aby slot vůbec něco dostal.
 */

/**
 * Kolikrát smí tentýž recept přijít za týden.
 *
 * Dvakrát je záměr (meal prep, nákup na dvě porce), potřetí už je to chudoba.
 * Když strop nedovolí vybrat nic, slot zůstane nevyřešený a přes
 * `objednejZNevyresenehoSlotu` se zapíše poptávka do fronty generátoru —
 * radši díra, kterou vidíme a doplníme, než tiché čtvrté opakování.
 */
export const MAX_OPAKOVANI_RECEPTU_TYDNE = 2;

/**
 * TVRDÉ VYLOUČENÍ = dnešek + recepty, které už vyčerpaly týdenní strop.
 *
 * Tohle je hranice, kterou eskalace přebít NESMÍ — na rozdíl od měkkého
 * `excludeIds`. Proto se počítá zvlášť a předává se jako `hardExcludeIds`
 * do všech stupňů výběru, včetně těch posledních záchranných.
 *
 * @param {Set<string>|null|undefined} usedTodayIds recepty už použité dnes
 * @param {Map<string, number>|null|undefined} pouzitiZaTyden catalog_id → počet použití v týdnu
 * @returns {Set<string>} nová sada; vstupy zůstávají nedotčené
 */
export function tvrdaVylouceni(usedTodayIds, pouzitiZaTyden) {
  const out = new Set(usedTodayIds || []);
  for (const [cid, kolikrat] of (pouzitiZaTyden || new Map())) {
    if (kolikrat >= MAX_OPAKOVANI_RECEPTU_TYDNE) out.add(cid);
  }
  return out;
}

/**
 * IDENTITA JÍDLA, JAK JI VIDÍ ČLOVĚK.
 *
 * Strop na `catalog_id` nestačí. Katalog drží porcové varianty téhož jídla jako
 * samostatné řádky — „Kuře s bramborem — porce 180/300“, „— porce 150/350“,
 * „— porce 200/250“ — a každá má vlastní id. Vygenerovaný týden pak vyšel
 * 35 různých receptů z 35 jídel a přitom měl VEČEŘE JEN DVĚ RŮZNÉ ZE SEDMI:
 * šestkrát kuře s bramborem. Formálně pestré, na talíři ne.
 *
 * Nebyl to nedostatek surovin — katalog má 145 různých večeří, z toho 45
 * v použitém kalorickém pásmu. Jen se strop počítal na špatné úrovni.
 *
 * Klíčem je proto název před oddělovačem: co je za pomlčkou, je porce nebo
 * velikost („— XL“, „— sytá svačina“, „— velká porce“), ne jiné jídlo.
 *
 * @param {string|null|undefined} nazev
 * @returns {string} normalizovaný klíč, nebo '' když název chybí
 */
export function zakladNazvuJidla(nazev) {
  return String(nazev ?? '')
    // Em dash i obyčejná pomlčka obklopená mezerami; „Kuře-kari“ zůstane celé.
    .split(/\s+[—–-]\s+/)[0]
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Základy jídel, které už týdenní strop vyčerpaly.
 *
 * @param {Map<string, number>|null|undefined} pouzitiZakladu základ názvu → počet použití
 * @returns {Set<string>}
 */
export function vycerpaneZaklady(pouzitiZakladu) {
  const out = new Set();
  for (const [zaklad, kolikrat] of (pouzitiZakladu || new Map())) {
    if (zaklad && kolikrat >= MAX_OPAKOVANI_RECEPTU_TYDNE) out.add(zaklad);
  }
  return out;
}
