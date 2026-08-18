/**
 * ROTACE HLAVNÍ BÍLKOVINY PŘI GENEROVÁNÍ RECEPTŮ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROČ
 *
 * Zadání pro model do 18. 8. 2026 obsahovalo `meal_type`, `diet_tags`, kalorické
 * pásmo, seznam povolených surovin a `uz_mame` (názvy, které už v katalogu jsou).
 * O bílkovině neříkalo NIC — a `uz_mame` řeší jen duplicitu názvů, ne skladbu.
 * Model tedy volil volně a vracel to, k čemu má výchozí sklon: kuře.
 *
 * Změřeno v produkci (`recipes_catalog`, active, kcal 400–650):
 *
 *   surovina        obed  vecere
 *   kuře + krůta      22      29
 *   ryby              12      11
 *   luštěniny         12      15
 *   hovězí             4       0
 *   vepřové            2       1
 *
 * Ryby a luštěniny jsou v pořádku. Nejde tedy o plošnou drůbeží monokulturu,
 * ale o dvě konkrétně chybějící suroviny.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROČ SAMOTNÝ HINT NESTAČÍ
 *
 * Napsat do promptu „udělej hovězí“ je přání, ne záruka. Proto je tenhle modul
 * postavený na trojici:
 *
 *   1. hint    — `hlavni_bilkovina` ve vstupu pro model
 *   2. adresář — konkrétní povolené názvy té skupiny (`surovinySkupiny`), aby
 *                model nemusel hádat, jak se surovina v našem slovníku jmenuje;
 *                slovník je uzavřený a „hovězí svíčková“ v něm není
 *   3. kontrola — `receptSplnujeBilkovinu` po vygenerování; co hint nesplní,
 *                 se nezapíše a jde do opakovaného pokusu
 *
 * Bez třetího kroku by se nedalo poznat, jestli hint zabral, nebo model jen
 * mlčky vrátil další kuře.
 */

/**
 * Skupiny bílkovin a jak je poznat v názvu suroviny.
 *
 * POŘADÍ ROZHODUJE. Vyhodnocuje se shora dolů a první shoda vyhrává, protože
 * vzory se překrývají: „krůtí klobása“ je drůbež, ne uzenina, a „hovězí vývar“
 * je koření polévky, ne porce masa (ten je proto ve výjimkách níž).
 */
export const SKUPINY_BILKOVIN = Object.freeze([
  { klic: 'drubez', popis: 'drůbeží maso', vzory: [/kuřec/i, /kuře/i, /krůt/i, /krut/i] },
  { klic: 'ryby', popis: 'ryby a mořské plody', vzory: [/ryb/i, /losos/i, /tuňák/i, /tunak/i, /tresk/i, /makrel/i, /sardin/i, /krevet/i, /platýs/i] },
  { klic: 'hovezi', popis: 'hovězí maso', vzory: [/hověz/i, /hovez/i] },
  { klic: 'veprove', popis: 'vepřové maso', vzory: [/vepřov/i, /veprov/i, /panenk/i, /slanin/i, /šunk/i, /sunk/i, /klobás/i, /klobas/i] },
  { klic: 'lusteniny', popis: 'luštěniny a rostlinné bílkoviny', vzory: [/čočk/i, /cock/i, /cizrn/i, /fazol/i, /hrách/i, /hrach/i, /tofu/i, /tempeh/i, /sój/i, /soj/i, /edamam/i] },
  { klic: 'vejce', popis: 'vejce', vzory: [/vejc/i, /vajíčk/i, /vajec/i] },
  { klic: 'mlecne', popis: 'mléčné bílkoviny', vzory: [/tvaroh/i, /cottage/i, /jogurt/i, /sýr/i, /syr/i, /ricott/i, /mozzarell/i, /skyr/i] },
]);

/**
 * Suroviny, které skupinu sice připomínají názvem, ale nejsou zdrojem porce.
 * Vývar je ochucovadlo — recept na něm postavený by hint splnil jen naoko.
 */
const NENI_ZDROJ_PORCE = [/vývar/i, /vyvar/i, /bujón/i, /bujon/i, /polévka/i, /polevka/i];

/** Kolik gramů suroviny už bereme jako hlavní složku, ne ochucení. */
const MIN_GRAMU_HLAVNI = 40;

/**
 * @param {string} nazev
 * @returns {string|null} klíč skupiny, nebo null
 */
export function skupinaSuroviny(nazev) {
  const s = String(nazev ?? '').trim();
  if (!s) return null;
  if (NENI_ZDROJ_PORCE.some((re) => re.test(s))) return null;
  for (const sk of SKUPINY_BILKOVIN) {
    if (sk.vzory.some((re) => re.test(s))) return sk.klic;
  }
  return null;
}

/**
 * Hlavní bílkovina receptu = skupina s největší gramáží.
 *
 * Ne první nalezená: recept s 200 g hovězího a 15 g strouhaného sýra je hovězí,
 * ne mléčný. Když recept žádnou bílkovinu nemá, vrací null — takový recept se
 * do rotace nepočítá, jinak by „ovesná kaše“ ředila statistiku masa.
 *
 * @param {{ingredients?: Array<{name?: string, amount?: number}>}|null|undefined} recept
 * @returns {string|null}
 */
export function hlavniBilkovinaReceptu(recept) {
  const soucty = new Map();
  for (const ing of recept?.ingredients || []) {
    const skupina = skupinaSuroviny(ing?.name);
    if (!skupina) continue;
    const gramu = Number(ing?.amount);
    soucty.set(skupina, (soucty.get(skupina) ?? 0) + (Number.isFinite(gramu) ? gramu : 0));
  }
  let nej = null;
  let nejGramu = -1;
  for (const [skupina, gramu] of soucty) {
    if (gramu > nejGramu) { nej = skupina; nejGramu = gramu; }
  }
  return nej;
}

/**
 * Splňuje recept hint? Musí obsahovat surovinu té skupiny v porcové gramáži.
 *
 * Nestačí, že tam surovina je: 10 g slaniny v kuřecím salátu z něj vepřové
 * nedělá. Proto práh `MIN_GRAMU_HLAVNI` — a proto se nekontroluje jen název
 * receptu, ten může slibovat cokoliv.
 *
 * @param {{ingredients?: Array<{name?: string, amount?: number}>}|null|undefined} recept
 * @param {string|null|undefined} skupina
 * @returns {boolean} true i když hint chybí — bez zadání se nedá nic porušit
 */
export function receptSplnujeBilkovinu(recept, skupina) {
  const cil = String(skupina ?? '').trim();
  if (!cil) return true;
  let gramu = 0;
  for (const ing of recept?.ingredients || []) {
    if (skupinaSuroviny(ing?.name) !== cil) continue;
    const g = Number(ing?.amount);
    if (Number.isFinite(g)) gramu += g;
  }
  return gramu >= MIN_GRAMU_HLAVNI;
}

/**
 * Povolené suroviny, které do skupiny patří — adresář pro model.
 *
 * Slovník je uzavřený a model netuší, jak se v něm surovina jmenuje. Bez tohohle
 * seznamu by napsal „hovězí svíčková“, ta ve slovníku není, a recept by spadl na
 * kontrole surovin — tedy by hint selhal z úplně jiného důvodu, než že model
 * nechtěl.
 *
 * @param {string[]} povoleneSuroviny
 * @param {string|null|undefined} skupina
 * @returns {string[]}
 */
export function surovinySkupiny(povoleneSuroviny, skupina) {
  const cil = String(skupina ?? '').trim();
  if (!cil) return [];
  return (povoleneSuroviny || []).filter((n) => skupinaSuroviny(n) === cil);
}

/**
 * Rozložení hlavních bílkovin v už existujících receptech.
 *
 * @param {Array<{ingredients?: Array<{name?: string, amount?: number}>}>} recepty
 * @returns {Map<string, number>} klíč skupiny → počet receptů
 */
export function rozlozeniBilkovin(recepty) {
  const pocty = new Map();
  for (const r of recepty || []) {
    const skupina = hlavniBilkovinaReceptu(r);
    if (!skupina) continue;
    pocty.set(skupina, (pocty.get(skupina) ?? 0) + 1);
  }
  return pocty;
}

/**
 * Kterou bílkovinu objednat příště.
 *
 * Bere nejméně zastoupenou z `cilove`. Při shodě rozhoduje pořadí v `cilove`,
 * ne náhoda — dva běhy nad stejnými daty musí dát stejný výsledek, jinak se
 * nedá změřit, jestli rotace zabrala.
 *
 * @param {Map<string, number>} pocty z `rozlozeniBilkovin`
 * @param {string[]} cilove skupiny, mezi kterými se rotuje
 * @returns {string|null}
 */
export function dalsiBilkovina(pocty, cilove) {
  const kandidati = (cilove || []).filter(Boolean);
  if (!kandidati.length) return null;
  let nej = null;
  let nejPocet = Infinity;
  for (const k of kandidati) {
    const n = pocty?.get(k) ?? 0;
    if (n < nejPocet) { nej = k; nejPocet = n; }
  }
  return nej;
}

/**
 * Lidský popis skupiny do promptu.
 * @param {string|null|undefined} skupina
 * @returns {string}
 */
export function popisSkupiny(skupina) {
  return SKUPINY_BILKOVIN.find((s) => s.klic === skupina)?.popis ?? String(skupina ?? '');
}

/**
 * Mezi čím se rotuje, když položka fronty hint nemá.
 *
 * Pořadí je zároveň pravidlem pro remízu (viz `dalsiBilkovina`), takže vpředu
 * stojí to, co v katalogu chybí nejvíc. Drůbež je poslední schválně — model si
 * k ní dojde sám a hint ji nemá čím posilovat.
 */
const CILOVE_BILKOVINY = Object.freeze(['hovezi', 'veprove', 'ryby', 'lusteniny', 'drubez']);

/** Rotace dává smysl u hlavních jídel; u snídaně a svačiny by nutila nesmysly. */
const SLOTY_S_ROTACI = new Set(['obed', 'vecere']);

/**
 * Jakou bílkovinu po modelu chtít.
 *
 * Explicitní `protein_hint` z fronty vyhrává vždycky — je to objednávka. Jinak
 * se odvodí z rozložení už existujících receptů toho slotu.
 *
 * Kandidát musí mít v povolených surovinách čím být naplněn: u vegan položky
 * hovězí ve slovníku není, takže by hint jen zaručil, že se dávka zahodí.
 *
 * @param {{protein_hint?: string|null, meal_type?: string}} polozka
 * @param {Array<{ingredients?: Array<{name?: string, amount?: number}>}>} existujici
 * @param {string[]} povoleneProPolozku suroviny UŽ profiltrované podle diety
 * @returns {string|null}
 */
export function bilkovinaProPolozku(polozka, existujici, povoleneProPolozku) {
  const dostupne = (klic) => surovinySkupiny(povoleneProPolozku, klic).length > 0;

  const zadany = String(polozka?.protein_hint ?? '').trim();
  if (zadany) return dostupne(zadany) ? zadany : null;

  if (!SLOTY_S_ROTACI.has(String(polozka?.meal_type ?? ''))) return null;
  return dalsiBilkovina(rozlozeniBilkovin(existujici), CILOVE_BILKOVINY.filter(dostupne));
}
