/**
 * DIETNĚ KRITICKÉ VÝRAZY — jediný zdroj pravdy.
 *
 * Sem sahá dietní brána (lib/dietaryPublishGate.js), nouzová šablona
 * (lib/generatePlan.js) i kontrola překladu (lib/spoonacular/catalogTranslate.js).
 * Je to jedenáctý výskyt vzorce „dvě místa nad stejnými daty“ v tomhle repu —
 * rozdíl je, že tentokrát to místo je jedno a hlídá ho test.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROČ SE POROVNÁVÁ NA ZAČÁTKU SLOVA A NE PODŘETĚZCEM
 *
 * Brána dřív hledala `text.includes(term)`. U krátkého českého seznamu to
 * procházelo, ale při rozšíření o angličtinu je to mina. Změřeno na produkci
 * 10. 8. 2026:
 *   'roll' → „rolled oats“      = 5 bezlepkových ovesných receptů zablokováno
 *   'bun'  → „a bunch of…“      = 6 receptů zablokováno
 *   'cake' → „crab cakes“, „cheesecake“
 * Proto `matchesTerm` kotví na hranici slova. Výrazy se ukládají BEZ diakritiky
 * a text se před porovnáním složí stejně — takže se nemusí duplikovat
 * „pšenice“/„psenice“ a zároveň se najde „chleba“ i „chlébu“.
 */

/**
 * Sjednotí text pro porovnání: malá písmena, bez diakritiky, jedna mezera.
 * @param {unknown} value
 * @returns {string}
 */
export function foldForMatch(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @type {Map<string, RegExp>} */
const TERM_RE_CACHE = new Map();

/**
 * Kotví na začátku slova, ne na konci — čeština je flektivní, takže „chleb“
 * musí najít „chleba“ i „chlebu“, ale „bun“ nesmí najít „bunch“.
 * @param {string} term už složený výraz
 * @returns {RegExp}
 */
function termRegex(term) {
  const cached = TERM_RE_CACHE.get(term);
  if (cached) return cached;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}`, 'u');
  TERM_RE_CACHE.set(term, re);
  return re;
}

/**
 * @param {string} foldedText už složený text
 * @param {string} term už složený výraz
 * @returns {boolean}
 */
export function matchesTerm(foldedText, term) {
  if (!foldedText || !term) return false;
  return termRegex(term).test(foldedText);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRODUKTOVÉ ROZHODNUTÍ: OVES JE PRO `gluten_free` BEZLEPKOVÝ
 *
 * Rozhodl Honza 10. 8. 2026. Není to opomenutí, je to rozhodnutí.
 *
 * Oves lepek neobsahuje. Běžně se ale kontaminuje při zpracování (sdílené
 * mlýny a linky s pšenicí), takže část zdrojů ho u celiakie neuvádí jako
 * bezpečný. Produktově ho považujeme za bezlepkový.
 *
 * KDYBY SE TO MĚLO ZMĚNIT, MĚNÍ SE TO TADY A NIKDE JINDE — stačí přesunout
 * tyhle výrazy z `GLUTEN_FREE_EXONERATIONS` do `GLUTEN_TERMS`. Žádný jiný
 * soubor vlastní seznam nemá.
 *
 * Pozn.: v `GLUTEN_TERMS` oves nikdy nebyl, takže tohle rozhodnutí nic
 * neodblokovává — zapisuje se proto, aby ho příští člověk, který bude seznam
 * rozšiřovat, našel dřív, než tam „vločky“ přidá.
 * @type {readonly string[]}
 */
export const OATS_TREATED_AS_GLUTEN_FREE = Object.freeze([
  'oves', 'ovesn', 'vlock', 'oat', 'oats', 'oatmeal', 'rolled oats', 'oat flour',
]);

/**
 * Výrazy, které znamenají lepek. Bez diakritiky, česky i anglicky v jednom
 * seznamu — brána čte oba jazyky (viz `mealEnglishFactBlob` v bráně).
 *
 * Do seznamu patří jen výraz, který je JEDNOZNAČNĚ pšeničný/žitný/ječný.
 * Víceznačné (`roll`, `bun`, `cake`, `pancake`, `noodle` samo o sobě) tu být
 * nesmí — blokovaly by víc správných receptů než špatných. Když je výraz
 * nejednoznačný jen kvůli jednomu bezlepkovému protějšku, patří ten protějšek
 * do `GLUTEN_FREE_EXONERATIONS` (např. `flour` × `rice flour`).
 * @type {readonly string[]}
 */
export const GLUTEN_TERMS = Object.freeze([
  // — obiloviny
  'psenice', 'psenicn', 'wheat', 'zitn', 'rye', 'jecm', 'barley', 'kroup',
  'spalda', 'spelt', 'farro', 'kamut', 'malt', 'sladov', 'seitan',
  'semolina', 'graham', 'matzo', 'bulgur', 'kuskus', 'couscous',
  // — mouka a těsto
  // 'mouk' pokrývá mouka/mouky/moukou, 'moucn'/'moucka' moučný/moučka.
  'mouk', 'moucn', 'moucka', 'flour', 'dough', 'pastry', 'phyllo', 'filo',
  // — pečivo
  'chleb', 'bread', 'breadcrumb', 'strouhank', 'panko', 'crouton', 'kruton',
  'pecivo', 'housk', 'rohlik', 'baget', 'baguette', 'bagel', 'croissant', 'brioche',
  'toust', 'toast', 'pita', 'naan', 'tortill', 'wrap', 'pizza', 'bulk',
  'english muffin', 'anglicky muffin', 'waffle', 'pretzel', 'precl',
  'cracker', 'susenk', 'biscuit', 'koblih', 'doughnut', 'donut',
  // Holé 'muffin' a 'kolac' tu SCHVÁLNĚ nejsou — ze stejného důvodu jako
  // holé 'nudle'. Změřeno na produkci 10. 8. 2026: 'muffin' zablokovalo
  // „Muffiny z frittaty“ (id 47 — brokolice, vejce, čedar) a „Čokoládové
  // proteinové muffiny“ (id 548 — banán, konopný protein, lněná semínka),
  // oba bezlepkové; 'kolac' zablokovalo „rybí koláčky“. Muffinová forma
  // a placička nejsou pečivo. Lepek v nich rozhodují suroviny — a když
  // v nich je, chytí ho 'mouk' nebo 'strouhank'.
  // — těstoviny a nudle
  'testovin', 'pasta', 'spagety', 'spaghetti', 'penne', 'farfalle', 'fusilli',
  'makaron', 'macaroni', 'lasagn', 'ravioli', 'tortellini', 'orzo', 'gnocchi',
  'noky', 'knedl', 'ramen', 'udon', 'wonton',
  // — ostatní
  'lamank',
]);

/**
 * Výrazy, které NEJSOU lepek, ale čtou se jako lepek nebo obsahují lepkový
 * podřetězec. Před hledáním lepku se z textu vymaskují.
 *
 * Bez tohohle seznamu by rozšíření o angličtinu zablokovalo správné recepty:
 *   'buckwheat' obsahuje 'wheat'  → pohanka je bezlepková
 *   'corn tortilla'               → kukuřičná tortilla je bezlepková (id 648)
 *   'rice flour', 'almond flour'  → bezlepkové mouky
 * @type {readonly string[]}
 */
export const GLUTEN_FREE_EXONERATIONS = Object.freeze([
  ...OATS_TREATED_AS_GLUTEN_FREE,
  // pseudoobiloviny, které se čtou jako obilí
  'buckwheat', 'pohank', 'quinoa', 'amarant', 'amaranth', 'jahly', 'millet',
  'cirok', 'sorghum', 'teff',
  // bezlepkové mouky a moučky
  'rice flour', 'ryzova mouka', 'ryzove mouky', 'corn flour', 'cornflour',
  'kukuricna mouka', 'cornmeal', 'kukuricna moucka', 'almond flour',
  'mandlova mouka', 'coconut flour', 'kokosova mouka', 'chickpea flour',
  'cizrnova mouka', 'tapioca flour', 'potato flour', 'bramborova mouka',
  'gluten free flour', 'gluten-free flour',
  // bezlepkové obdoby lepkových jídel
  'corn tortilla', 'kukuricna tortilla', 'kukuricne tortilly',
  'rice noodle', 'ryzove nudle', 'glass noodle', 'shirataki', 'rice paper',
  'ryzovy papir', 'kukuricna polenta', 'kukuricna krupice',
  // ne-lepkové výrazy, které obsahují lepkový podřetězec
  'maltodextrin', 'maltitol', 'sladovy ocet z ryze',
]);

/**
 * Výrazy, kterými se recept sám označuje za bezlepkový. Platí na segment
 * (název jednoho jídla), ne na celý dokument — jedno „bezlepkový“ v patičce
 * nesmí vybílit celý plán.
 * @type {readonly string[]}
 */
export const GLUTEN_FREE_MARKERS = Object.freeze([
  'bezlepk', 'bez lepku', 'gluten free', 'gluten-free',
]);

/**
 * Výrazy, které nejsou to, co v nich brána čte — maskují se před KAŽDÝM
 * hledáním, ne jen před hledáním lepku.
 *
 * 'egg' by jinak našlo „eggplant“ (lilek je veganský), 'butter' najde
 * „butternut squash“ a „peanut butter“, 'milk' najde „coconut milk“.
 * Všechny tři jsou pro veganskou dietu v pořádku.
 * @type {readonly string[]}
 */
export const NOT_WHAT_IT_LOOKS_LIKE = Object.freeze([
  'eggplant', 'butternut', 'peanut butter', 'almond butter', 'cashew butter',
  'arasidove maslo', 'mandlove maslo', 'cocoa butter', 'kakaove maslo',
  'coconut milk', 'kokosove mleko', 'soy milk', 'sojove mleko',
  'almond milk', 'mandlove mleko', 'oat milk', 'ovesne mleko',
  'rice milk', 'ryzove mleko', 'coconut cream', 'kokosova smetana',
]);

/**
 * Vymaskuje z textu výrazy, které se jen čtou jako zakázané.
 * @param {string} foldedText
 * @param {readonly string[]} exonerations
 * @returns {string}
 */
export function maskExonerations(foldedText, exonerations) {
  let out = foldedText;
  for (const term of exonerations) {
    if (!term || !out.includes(term)) continue;
    out = out.split(term).join(' ');
  }
  return out;
}

/**
 * @param {unknown} text
 * @returns {boolean} označuje se text sám za bezlepkový?
 */
export function isExplicitlyGlutenFree(text) {
  const folded = foldForMatch(text);
  return GLUTEN_FREE_MARKERS.some((m) => folded.includes(m));
}

/**
 * Který lepkový výraz v textu je? Vrací výraz (kvůli diagnostice), ne bool.
 * @param {unknown} text
 * @returns {string|null}
 */
export function findGlutenTerm(text) {
  const folded = foldForMatch(text);
  if (!folded) return null;
  const masked = maskExonerations(folded, [...GLUTEN_FREE_EXONERATIONS, ...NOT_WHAT_IT_LOOKS_LIKE]);
  for (const term of GLUTEN_TERMS) {
    if (matchesTerm(masked, term)) return term;
  }
  return null;
}

/**
 * Obecná varianta pro ostatní diety (maso, živočišné produkty).
 * @param {unknown} text
 * @param {readonly string[]} terms
 * @returns {string|null}
 */
export function findRestrictedTerm(text, terms) {
  const folded = foldForMatch(text);
  if (!folded) return null;
  const masked = maskExonerations(folded, NOT_WHAT_IT_LOOKS_LIKE);
  for (const term of terms) {
    if (matchesTerm(masked, foldForMatch(term))) return term;
  }
  return null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GLOSÁŘ DIETNĚ KRITICKÝCH VÝRAZŮ PRO PŘEKLAD
 *
 * Změřeno na produkci 10. 8. 2026 — překlad zahazoval dietní informaci:
 *   518  „Dad's Breakfast Polenta“  → „krupicový pokrm“
 *   528  „Barbecued Shrimp & Grits“ → „krevety s krupicí“
 *   648  „corn tortillas“           → „tortilly“
 * Polenta i grits jsou kukuřičné, tedy bezlepkové. Krupice je pšeničná.
 * Překlad z bezlepkové suroviny udělal lepkovou.
 *
 * Glosář stojí na dvou nohách a ANI JEDNA není sama dost:
 *   1. `prompts/catalog-translate.md` ho má jako text — prompt je požadavek,
 *      ne záruka, a model ho může ignorovat.
 *   2. `assertDietCriticalTranslation()` níž je deterministická kontrola PO
 *      překladu. Ta rozhoduje: co jí neprojde, se do katalogu nezapíše.
 * Test `dietCriticalGlossary.test.mjs` hlídá, že se prompt a tenhle seznam
 * nerozejdou.
 *
 * `csMarkers` = co MUSÍ být v českém překladu, aby dietní informace přežila.
 * `gluten` = nese ten výraz lepek? Slouží ke kontrole, ne k hledání v bráně.
 *
 * @type {readonly Array<{ en: string, cs: string, csMarkers: readonly string[], gluten: boolean, why: string }>}
 */
export const DIET_CRITICAL_GLOSSARY = Object.freeze([
  // — bezlepkové, ale překlad z nich dělá lepkové
  { en: 'polenta', cs: 'kukuřičná polenta', csMarkers: ['kukuric', 'polenta'], gluten: false,
    why: 'kukuřičná; „krupice“ je pšeničná, tedy opačná dietní informace' },
  { en: 'grits', cs: 'kukuřičná krupice', csMarkers: ['kukuric'], gluten: false,
    why: 'kukuřičné; bez „kukuřičná“ je z toho pšeničná krupice' },
  { en: 'cornmeal', cs: 'kukuřičná moučka', csMarkers: ['kukuric'], gluten: false,
    why: 'kukuřičná; „moučka“ sama čte jako pšeničná' },
  { en: 'corn tortilla', cs: 'kukuřičná tortilla', csMarkers: ['kukuric'], gluten: false,
    why: 'kukuřičná tortilla je bezlepková, pšeničná není — přívlastek nesmí zmizet' },
  { en: 'buckwheat', cs: 'pohanka', csMarkers: ['pohank'], gluten: false,
    why: 'pohanka není pšenice, přes anglické „wheat“ to tak ale vypadá' },
  { en: 'rice noodles', cs: 'rýžové nudle', csMarkers: ['ryz'], gluten: false,
    why: 'bez „rýžové“ jsou z toho pšeničné nudle' },
  { en: 'quinoa', cs: 'quinoa', csMarkers: ['quinoa', 'kinoa'], gluten: false,
    why: 'nepřekládat na „obilí“ ani „kroupy“' },
  { en: 'millet', cs: 'jáhly', csMarkers: ['jahl', 'proso'], gluten: false,
    why: 'proso je bezlepkové' },
  { en: 'almond flour', cs: 'mandlová mouka', csMarkers: ['mandlov'], gluten: false,
    why: 'bez „mandlová“ je z toho pšeničná mouka' },
  { en: 'coconut flour', cs: 'kokosová mouka', csMarkers: ['kokosov'], gluten: false,
    why: 'bez „kokosová“ je z toho pšeničná mouka' },
  { en: 'rice flour', cs: 'rýžová mouka', csMarkers: ['ryz'], gluten: false,
    why: 'bez „rýžová“ je z toho pšeničná mouka' },
  { en: 'chickpea flour', cs: 'cizrnová mouka', csMarkers: ['cizrn'], gluten: false,
    why: 'bez „cizrnová“ je z toho pšeničná mouka' },
  { en: 'oats', cs: 'ovesné vločky', csMarkers: ['oves'], gluten: false,
    why: 'produktové rozhodnutí 10. 8. 2026 — viz OATS_TREATED_AS_GLUTEN_FREE' },

  // — lepkové, a překlad to smí jen zesílit, ne zamlčet
  { en: 'semolina', cs: 'pšeničná krupice', csMarkers: ['psenic'], gluten: true,
    why: 'pšeničná; holá „krupice“ je nerozlišitelná od kukuřičné' },
  { en: 'flour tortilla', cs: 'pšeničná tortilla', csMarkers: ['psenic'], gluten: true,
    why: 'protějšek kukuřičné — rozdíl je celý dietní obsah' },
  { en: 'couscous', cs: 'kuskus (pšeničný)', csMarkers: ['psenic', 'kuskus'], gluten: true,
    why: 'pšeničný, česky to z názvu nepoznáš' },
  { en: 'bulgur', cs: 'bulgur (pšeničný)', csMarkers: ['psenic', 'bulgur'], gluten: true,
    why: 'pšeničný' },
  { en: 'cracked wheat', cs: 'pšeničná lámanka', csMarkers: ['psenic'], gluten: true,
    why: 'změřeno u id 612: „lámanka“ sama lepek neprozradí' },
  { en: 'farro', cs: 'farro (pšeničné zrno)', csMarkers: ['psenic', 'farro'], gluten: true,
    why: 'změřeno u id 623: „farrový salát“ lepek neprozradí' },
  { en: 'spelt', cs: 'špalda (pšeničná)', csMarkers: ['psenic', 'spald'], gluten: true,
    why: 'špalda je pšenice' },
  { en: 'barley', cs: 'kroupy (ječmen)', csMarkers: ['jecm', 'kroup'], gluten: true,
    why: 'ječmen nese lepek' },
  { en: 'rye', cs: 'žitná', csMarkers: ['zitn', 'zito'], gluten: true,
    why: 'žito nese lepek' },
  { en: 'panko', cs: 'pšeničná strouhanka', csMarkers: ['strouhank', 'psenic'], gluten: true,
    why: 'změřeno u id 139: „obalený“ lepek neprozradí' },
  { en: 'breadcrumbs', cs: 'strouhanka', csMarkers: ['strouhank'], gluten: true,
    why: 'pšeničná' },
  { en: 'english muffin', cs: 'anglický muffin (pšeničné pečivo)', csMarkers: ['psenic', 'muffin', 'peciv'], gluten: true,
    why: 'změřeno u id 50, 509, 564: „vejce Benedikt“ pečivo zamlčí' },
  { en: 'ramen', cs: 'ramen (pšeničné nudle)', csMarkers: ['psenic', 'nudl'], gluten: true,
    why: 'změřeno u id 179: pšeničné nudle, přitom má tag gluten_free' },
  { en: 'udon', cs: 'udon (pšeničné nudle)', csMarkers: ['psenic', 'nudl'], gluten: true,
    why: 'změřeno u id 551: pšeničné nudle, přitom má tag gluten_free' },
  { en: 'seitan', cs: 'seitan (čistý pšeničný lepek)', csMarkers: ['psenic', 'lepek'], gluten: true,
    why: 'seitan JE lepek' },
]);

/**
 * Deterministická kontrola překladu. Rozhoduje ona, ne prompt.
 *
 * Když anglický zdroj obsahuje dietně kritický výraz a český překlad nenese
 * ani jeden z jeho `csMarkers`, překlad zahodil dietní informaci a NESMÍ se
 * zapsat do katalogu.
 *
 * @param {{ en: string, cs: string }} p `en` = anglický zdroj (název + suroviny),
 *   `cs` = jeho český překlad
 * @returns {Array<{ en: string, cs: string, why: string, gluten: boolean }>} prázdné = v pořádku
 */
export function findFlattenedDietTerms({ en, cs }) {
  const foldedEn = foldForMatch(en);
  const foldedCs = foldForMatch(cs);
  if (!foldedEn || !foldedCs) return [];

  const out = [];
  for (const entry of DIET_CRITICAL_GLOSSARY) {
    const enTerm = foldForMatch(entry.en);
    if (!matchesTerm(foldedEn, enTerm)) continue;
    const survived = entry.csMarkers.some((m) => foldedCs.includes(foldForMatch(m)));
    if (!survived) {
      out.push({ en: entry.en, cs: entry.cs, why: entry.why, gluten: entry.gluten });
    }
  }
  return out;
}
