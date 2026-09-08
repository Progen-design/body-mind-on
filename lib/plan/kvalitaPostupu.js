/**
 * LAŤKA KVALITY POSTUPU — čistá funkce, žádné I/O.
 *
 * 38 % receptů v katalogu (420 z 1104, měřeno 8. 9. 2026) mělo postup pod
 * čtyři kroky nebo kratší než 200 znaků — typicky vatu jako:
 *
 *   1. Připrav brambory (syrové).
 *   2. Upeč nebo opeč kuřecí prsa na oleji.
 *   3. Doplň zeleninou a podávej jako jednu porci.
 *
 * Žádná teplota, žádný čas, žádné pořadí, „připrav brambory" není krok.
 * Tenhle modul je ta laťka jako kód, ne jako názor recenzenta — každé
 * pravidlo níž má vlastní důvod a vlastní test. Používá ho:
 *   - `catalogImportGate.js` (spoonacular, při aktivaci po překladu)
 *   - `zapisRecept()` v `recipeGeneratorRun.js` (llm_generated, při zápisu)
 *   - `scripts/doplneni-postupu-receptu.mjs` (doplnění zpětně)
 * Model, který postup vygeneruje, ho MUSÍ projít znovu přes tuhle funkci —
 * gate nikdy nevěří tomu, že vygenerovaný text je automaticky v pořádku.
 */

export const MIN_KROKU = 4;
export const MIN_DELKA_POSTUPU = 200;

/**
 * Exportováno navíc pro `lib/plan/doplneniPostupuReceptu.js` — skloňování
 * (viz `jsouTvaryTehozSlova` níž) se řeší na jednom místě, ne dvakrát jinak.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function normalizuj(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown} kroky
 * @returns {string[]}
 */
function ocistiKroky(kroky) {
  if (!Array.isArray(kroky)) return [];
  return kroky
    .map((k) => String(k ?? '').trim())
    // Odstraní případné ruční číslování ("1.", "2)") — postup se validuje
    // podle obsahu kroku, ne podle toho, jestli si ho někdo očísloval.
    .map((k) => k.replace(/^\(?\d+[.)]\s*/, ''))
    .filter(Boolean);
}

/**
 * Čeština skloňuje — „rýže" se v textu objeví jako „rýži", „smetana" jako
 * „smetanou" atd. Přesná shoda celého slova by tak skoro nikdy netrefila.
 *
 * PŮVODNÍ ŘEŠENÍ (jeden ořez podle délky slova, pak `startsWith` oběma
 * směry) bylo rozbité na obou koncích zároveň a navíc nešlo spravit
 * přidáním jen dalšího prahu: základ počítaný z JEDNOHO slova nikdy neví,
 * jak dlouhý základ má sdílet s tím DRUHÝM. „syr" (3 znaky, žádný ořez)
 * je shodou okolností i předpona slova „syrové" — jiné slovo, ne pád
 * téhož — a „med" stejně tak předpona „medvědí". Naopak „rýže"/„rýži"
 * (obě 4 znaky) se liší jen v posledním písmenu, takže bez ořezu na
 * čtyřznakových slovech neprojdou vůbec.
 *
 * Řešení proto porovnává OBĚ slova napřímo přes společný začátek a dvě
 * nezávislé meze na to, co zbývá za ním:
 *   - kratší slovo smí mít za společným začátkem nejvýš JEDEN vlastní
 *     znak (kryje záměnu poslední samohlásky jako u rýže/rýži),
 *   - delší slovo smí mít navíc nejvýš DVA znaky (typická délka pádové
 *     koncovky jako u syr→syrem, smetana→smetanou).
 * Slovo, které se od druhého liší víc, je jiné slovo, ne jiný pád —
 * to zachytí „syr"/„syrové" (zbývá 3 znaky) i „slanina"/„slané" (zbývá
 * 3 znaky u delšího slova), aniž by to rozbilo „rýže"/„rýži" nebo
 * „syr"/„syrem".
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function jsouTvaryTehozSlova(a, b) {
  const kratsi = a.length <= b.length ? a : b;
  const delsi = a.length <= b.length ? b : a;

  let spolecnyZacatek = 0;
  while (spolecnyZacatek < kratsi.length && kratsi[spolecnyZacatek] === delsi[spolecnyZacatek]) {
    spolecnyZacatek += 1;
  }

  return (kratsi.length - spolecnyZacatek) <= 1 && (delsi.length - spolecnyZacatek) <= 2;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function slovaTextu(text) {
  return text.split(/[^\p{L}]+/u).filter((w) => w.length >= 3);
}

/**
 * Objevuje se `slovo` (v libovolném pádu) mezi slovy textu?
 *
 * @param {string} slovoNorm
 * @param {string[]} slovaVTextu
 * @returns {boolean}
 */
export function slovoJeVTextu(slovoNorm, slovaVTextu) {
  if (!slovoNorm) return false;
  return slovaVTextu.some((w) => jsouTvaryTehozSlova(slovoNorm, w));
}

/**
 * Je `surovina` (možná víceslovná, např. „kuřecí prsa") zmíněná v textu?
 * Stačí, aby se objevilo aspoň jedno její podstatné slovo (délky 3+) —
 * postup nemusí opakovat celý název přesně tak, jak je v ingredients.
 *
 * @param {string} surovinaNorm
 * @param {string[]} slovaVTextu
 * @returns {boolean}
 */
function surovinaJeVTextu(surovinaNorm, slovaVTextu) {
  const slova = surovinaNorm.split(' ').filter((w) => w.length >= 3);
  if (!slova.length) return slovoJeVTextu(surovinaNorm, slovaVTextu);
  return slova.some((s) => slovoJeVTextu(s, slovaVTextu));
}

/**
 * @param {unknown} suroviny
 * @returns {string[]}
 */
function nazvySurovin(suroviny) {
  if (!Array.isArray(suroviny)) return [];
  return suroviny
    .map((s) => {
      if (typeof s === 'string') return s;
      if (s && typeof s === 'object') return String(s.name ?? s.name_cs ?? s.name_en ?? '');
      return '';
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pantry koření — vyjmuté z „musí se objevit v kroku" i z kontroly
 * halucinace. Recept smí zmínit sůl nebo olej, i když je nemá jako
 * sledovanou položku surovin — jsou tak univerzální, že by jinak laťka
 * blokovala skoro každý recept.
 */
const KORENI_A_ZAKLAD = [
  'sůl', 'pepř', 'olej', 'olivový olej', 'voda', 'cukr', 'mletý pepř',
  'bazalka', 'oregano', 'tymián', 'kmín', 'skořice', 'kurkuma', 'koriandr',
  'petržel', 'česnek', 'jedlá soda', 'prášek do pečiva', 'ocet',
].map(normalizuj);

/**
 * @param {string} nazevSuroviny
 * @returns {boolean}
 */
function jeKoreniNeboZaklad(nazevSuroviny) {
  const n = normalizuj(nazevSuroviny);
  return KORENI_A_ZAKLAD.some((k) => n === k || n.includes(k));
}

/** Rozkazovací tvary (2. os. j. i mn. č.) běžné v českých kuchařských postupech. */
const ROZKAZOVACI_SLOVESA = new Set([
  'přidej', 'přidejte', 'smíchej', 'smíchejte', 'zamíchej', 'zamíchejte',
  'vmíchej', 'vmíchejte', 'promíchej', 'promíchejte', 'míchej', 'míchejte',
  'nakrájej', 'nakrájejte', 'rozkrájej', 'rozkrájejte', 'nakrouhej', 'nakrouhejte',
  'nastrouhej', 'nastrouhejte', 'oloupej', 'oloupejte', 'omyj', 'omyjte',
  'umyj', 'umyjte', 'opláchni', 'opláchněte', 'propláchni', 'propláchněte',
  'osol', 'osolte', 'opepři', 'opepřete', 'okořeň', 'okořeňte', 'ochuť', 'ochuťte',
  'vlož', 'vložte', 'zalij', 'zalijte', 'přelij', 'přelijte', 'polij', 'polijte',
  'uvař', 'uvařte', 'povař', 'povařte', 'vař', 'vařte', 'upeč', 'upečte',
  'peč', 'pečte', 'opeč', 'opečte', 'zapeč', 'zapečte', 'osmaž', 'osmažte',
  'smaž', 'smažte', 'orestuj', 'orestujte', 'restuj', 'restujte', 'poduste', 'poduš',
  'griluj', 'grilujte', 'otoč', 'otočte', 'obrať', 'obraťte',
  'rozehřej', 'rozehřejte', 'nahřej', 'nahřejte', 'zahřej', 'zahřejte',
  'rozmixuj', 'rozmixujte', 'rozšlehej', 'rozšlehejte', 'ušlehej', 'ušlehejte',
  'rozklepni', 'rozklepněte', 'rozetři', 'rozetřete', 'potři', 'potřete',
  'naplň', 'naplňte', 'obal', 'obalte', 'zabal', 'zabalte',
  'odstraň', 'odstraňte', 'sceď', 'sceďte', 'přeceď', 'přeceďte',
  'ozdob', 'ozdobte', 'podávej', 'podávejte', 'servíruj', 'servírujte',
  'nech', 'nechte', 'rozděl', 'rozdělte', 'propasíruj', 'propasírujte',
  'vymačkej', 'vymačkejte', 'rozpul', 'rozpulte', 'rozpůl', 'rozpůlte',
  'vyklop', 'vyklopte', 'zakryj', 'zakryjte', 'stáhni', 'stáhněte',
].map(normalizuj));

/**
 * @param {string} krok
 * @returns {boolean}
 */
function zacinaRozkazem(krok) {
  const prvniSlovo = normalizuj(krok).split(' ')[0] || '';
  return ROZKAZOVACI_SLOVESA.has(prvniSlovo);
}

/** Slovesa, jen s nichž samotnými (bez dalšího obsahu) je krok prázdná vata. */
const PRAZDNA_SLOVESA = ['připrav', 'připravte', 'nachystej', 'nachystejte'].map(normalizuj);

/**
 * Krok je „prázdný", když jen pojmenuje přípravu suroviny a nic dalšího
 * neříká — ani množství, ani čas, ani další úkon. „Připrav brambory
 * (syrové)." je vata; „Připrav brambory, oloupej je a nakrájej na kostky
 * 2 cm." už skutečný krok je (má další úkon i míru).
 *
 * @param {string} krok
 * @returns {boolean}
 */
function jePrazdnyKrok(krok) {
  const n = normalizuj(krok);
  const prvniSlovo = n.split(' ')[0] || '';
  if (!PRAZDNA_SLOVESA.includes(prvniSlovo)) return false;
  if (/\d/.test(n)) return false; // množství nebo čas = obsah navíc
  if (/[,;]/.test(krok)) return false; // další věta/úkon v kroku
  return krok.length <= 60;
}

/** Slovesa tepelné úpravy — když se objeví, postup musí uvést teplotu nebo čas. */
const TEPELNA_SLOVESA = [
  'peč', 'pečte', 'upeč', 'upečte', 'opeč', 'opečte', 'zapeč', 'zapečte',
  'smaž', 'smažte', 'osmaž', 'osmažte', 'vař', 'vařte', 'uvař', 'uvařte',
  'povař', 'povařte', 'dus', 'duste', 'poduste', 'griluj', 'grilujte',
  'restuj', 'restujte', 'orestuj', 'orestujte',
].map(normalizuj);

/**
 * @param {string} textNormalizovany
 * @returns {boolean}
 */
function obsahujeTepelnouUpravu(textNormalizovany) {
  return TEPELNA_SLOVESA.some((sl) => new RegExp(`(^|\\s)${sl}`).test(textNormalizovany));
}

/** Běžně halucinované suroviny — hlídané, jen když NEJSOU v `ingredients`. */
const CASTO_HALUCINOVANE_SUROVINY = [
  'vejce', 'mléko', 'smetana', 'máslo', 'sýr', 'jogurt', 'víno', 'ořechy',
  'mouka', 'med', 'slanina', 'šunka', 'houby', 'rajčata', 'cizrna', 'čočka',
  'fazole', 'rýže', 'těstoviny', 'brambory', 'losos', 'tuňák', 'krevety',
].map(normalizuj);

/**
 * @param {{ kroky: unknown, suroviny: unknown, nazev?: unknown }} vstup
 * @returns {{ ok: boolean, duvody: string[] }}
 */
export function posudPostup({ kroky, suroviny, nazev } = {}) {
  const cisteKroky = ocistiKroky(kroky);
  const jmenaSurovin = nazvySurovin(suroviny);
  const jmenaSurovinNorm = jmenaSurovin.map(normalizuj);
  const celyText = cisteKroky.join(' ');
  const celyTextNorm = normalizuj(celyText);

  /** @type {string[]} */
  const duvody = [];

  // 1) Min. počet kroků — nutná (ne dostatečná) podmínka skutečného postupu.
  if (cisteKroky.length < MIN_KROKU) {
    duvody.push(`míň než ${MIN_KROKU} kroky (má ${cisteKroky.length})`);
  }

  // 2) Min. délka celého postupu — pár krátkých kroků nesplní ani počet,
  // ani se do nich nevejde teplota, čas a pořadí zároveň.
  if (celyText.length < MIN_DELKA_POSTUPU) {
    duvody.push(`celý postup má jen ${celyText.length} znaků, min. je ${MIN_DELKA_POSTUPU}`);
  }

  // 3) Každý krok začíná rozkazovacím slovesem — postup je návod, ne popis.
  cisteKroky.forEach((krok, i) => {
    if (!zacinaRozkazem(krok)) {
      duvody.push(`krok ${i + 1} nezačíná rozkazovacím slovesem: „${krok}"`);
    }
  });

  // 4) Žádný krok není jen „Připrav X" / „Nachystej X" bez dalšího obsahu.
  cisteKroky.forEach((krok, i) => {
    if (jePrazdnyKrok(krok)) {
      duvody.push(`krok ${i + 1} je prázdná vata bez množství, času nebo dalšího úkonu: „${krok}"`);
    }
  });

  // 5) Každá hlavní surovina (mimo koření a základ) se objeví aspoň v jednom
  // kroku — jinak postup mlčí o tom, co s ní udělat.
  const slovaPostupu = slovaTextu(celyTextNorm);
  const chybejici = jmenaSurovin.filter((s, idx) => {
    if (jeKoreniNeboZaklad(s)) return false;
    const n = jmenaSurovinNorm[idx];
    return n && !surovinaJeVTextu(n, slovaPostupu);
  });
  if (chybejici.length) {
    duvody.push(`postup nezmiňuje surovinu/y: ${chybejici.join(', ')}`);
  }

  // 6) U tepelné úpravy musí padnout teplota nebo čas — jinak „opeč" neříká
  // nic, co by šlo dodržet.
  if (obsahujeTepelnouUpravu(celyTextNorm)) {
    const maTeplotu = /\d+\s*°?\s*c\b/.test(celyTextNorm) || /\d+\s*stup/.test(celyTextNorm);
    const maCas = /\d+\s*(min|hodin|sekund)/.test(celyTextNorm);
    if (!maTeplotu && !maCas) {
      duvody.push('tepelná úprava bez teploty i bez času přípravy');
    }
  }

  // 7) Postup nesmí uvádět kcal ani makra — ta jsou v číselných polích,
  // duplicitní (a snadno neshodný) text v postupu tam nepatří.
  if (/\bkcal\b/.test(celyTextNorm) || /kalori/.test(celyTextNorm)) {
    duvody.push('postup uvádí kalorickou hodnotu, ta patří jen do pole kcal');
  }
  cisteKroky.forEach((krok) => {
    const n = normalizuj(krok);
    if (/\d/.test(n) && /(bilkovin|sacharid)/.test(n)) {
      duvody.push(`krok uvádí makroživiny v textu: „${krok}"`);
    }
  });

  // 8) Postup nesmí zmínit surovinu, která není v `ingredients` — halucinace
  // by uživatele poslala shánět něco, co recept vůbec nepočítá.
  const halucinace = CASTO_HALUCINOVANE_SUROVINY.filter((s) => {
    if (!slovoJeVTextu(s, slovaPostupu)) return false;
    return !jmenaSurovinNorm.some((j) => slovoJeVTextu(s, j.split(' ')));
  });
  if (halucinace.length) {
    duvody.push(`postup zmiňuje surovinu mimo ingredients: ${halucinace.join(', ')}`);
  }

  // Kontrola názvu je záměrně jen defenzivní — samotný název laťku neurčuje,
  // ale prázdný název je signál rozbitého vstupu, ne validní recept.
  if (nazev != null && !String(nazev).trim()) {
    duvody.push('recept nemá název');
  }

  return { ok: duvody.length === 0, duvody };
}
