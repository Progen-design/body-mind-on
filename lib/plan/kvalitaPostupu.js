/**
 * LAŤKA KVALITY POSTUPU — čistá funkce, žádné I/O.
 *
 * Typická vata, kterou má laťka chytit:
 *
 *   1. Připrav brambory (syrové).
 *   2. Upeč nebo opeč kuřecí prsa na oleji.
 *   3. Doplň zeleninou a podávej jako jednu porci.
 *
 * Žádná teplota, žádný čas, žádné pořadí, „připrav brambory" není krok.
 *
 * OPRAVA 9. 9. 2026 — LAŤKA SAMA UDĚLALA ŠKODU (první kolo).
 * Původní odhad „420 z 1104 receptů pod laťkou" byl nadhodnocený vlastními
 * chybami v porovnávání, ne skutečným stavem katalogu — skutečné číslo je
 * 251. Nejhůř to dopadlo u `coach_seed_v1`: laťka jako vatu označila 150
 * ze 153 receptů, přestože jich pod laťkou opravdu bylo jen 3. Spuštěno na
 * produkci to přepsalo 76 dobrých postupů (průměr 677 znaků) kratšími
 * (průměr 305) — chyba v gatu tak paradoxně tlačila kvalitu DOLŮ, protože
 * model dostal pokyn „přepiš to" a kratší text se snáz trefí do zbylých
 * pravidel. Čtyři konkrétní chyby (pozice slovesa, „opečený" vs. „opeč",
 * rajče/rajčata, pevný práh 200 znaků) a ochrana proti zkrácení
 * v `lib/plan/doplneniPostupuReceptu.js` (`smiPrepsatPostup`) byly oprava.
 *
 * OPRAVA 9. 9. 2026 — DRUHÉ KOLO: BLOKUJÍCÍ VS. VAROVNÉ.
 * I po prvním kole laťka na celém katalogu (1000 receptů) zamítala 839 —
 * oprava pozice slovesa byla správná, jenže odhalila skutečný problém:
 * „obsahuje krok rozkazovací sloveso?" se snažilo poznat instrukci
 * ENUMERACÍ sloves, a čeština jich má stovky. I po rozšíření whitelistu
 * o 18 sloves dalo 1053 zásahů na 1000 receptech — to není náhoda, to je
 * důkaz, že enumerace jako metoda nefunguje a nikdy fungovat nebude.
 * Stejný problém měl pevný seznam „často halucinovaných surovin"
 * (194 zásahů — hlásil mimo jiné máslo u receptu, který máslo měl, jen
 * pod jiným názvem) a kontrola „chybějící suroviny" ze stejného principu.
 *
 * `posudPostup()` teď vrací i `varovani` — pravidla, která NIKDY
 * neblokují zápis ani nespouštějí přepis, jen se logují k ruční kontrole:
 * rozkazovací sloveso (zahozeno úplně, včetně whitelistu), tepelná úprava
 * bez teploty/času, surovina mimo ingredients, chybějící surovina. `ok`
 * se řídí jen tím, co laťka umí rozhodnout spolehlivě bez enumerace:
 * počet kroků, prázdná vata („Připrav X" bez obsahu), kcal/makra v textu,
 * prázdný název — a krátký text JEN jako potvrzující signál k malému
 * počtu kroků, nikdy samostatně (samostatně dával 219 falešných zásahů).
 *
 * ODHAD DOPADU (z naměřených četností, ne od oka — přesné číslo změří
 * Honza na produkci). Blokující zůstávají jen: „míň než 4 kroky" (96
 * zásahů) a „Připrav X" vata (16 zásahů); kcal/makra a prázdný název se
 * v naměřené četnosti vůbec neobjevily, takže jejich příspěvek je nulový
 * nebo zanedbatelný. Screenshotový příklad vaty má OBOJÍ najednou (3 kroky
 * i „Připrav X"), což napovídá, že vata je z velké části PODMNOŽINA
 * receptů s málo kroky, ne nezávislá skupina navíc. Sjednocení těch dvou
 * množin je tedy nejméně 96 a nejvýš 96 + 16 = 112:
 *
 *     96 ≤ (propadne po opravě) ≤ 112   — z 839 před opravou.
 *
 * To je pokles zhruba o 87–89 %, z 83,9 % katalogu na přibližně 9,6–11,2 %.
 *
 * Tenhle modul je ta laťka jako kód, ne jako názor recenzenta — každé
 * pravidlo níž má vlastní důvod a vlastní test. Používá ho:
 *   - `catalogImportGate.js` (spoonacular, při aktivaci po překladu)
 *   - `zapisRecept()` v `recipeGeneratorRun.js` (llm_generated, při zápisu)
 *   - `scripts/doplneni-postupu-receptu.mjs` (doplnění zpětně)
 * Model, který postup vygeneruje, ho MUSÍ projít znovu přes tuhle funkci —
 * gate nikdy nevěří tomu, že vygenerovaný text je automaticky v pořádku.
 * Ale jen `duvody` (blokující) smí zabránit zápisu nebo spustit přepis —
 * `varovani` se logují a nic víc.
 */

export const MIN_KROKU = 4;

/**
 * CHYBA 4 (naměřeno 8.–9. 9. 2026): pevných 200 znaků bylo moc pro
 * jednoduchá jídla — proteinový nápoj (protein, mléko, banán, 3 hlavní
 * suroviny) má poctivé 4 kroky a 167 znaků, ovesná kaše (taky 3) 174.
 * Delší text tam prostě není z čeho vzít — recept se třemi surovinami
 * nemá tři odstavce postupu.
 *
 * Práh proto škáluje s počtem HLAVNÍCH surovin (bez koření — viz
 * `jeKoreniNeboZaklad`): 50 znaků na surovinu je zhruba délka jedné
 * krátké instrukce, která ji zmíní i s množstvím — „Přidej 30 g ovesných
 * vloček." má 27 znaků, „Nalij 250 ml mléka." má 19. Při čtyřech
 * surovinách (běžný recept) to dá přesně původních 200; při třech
 * (jednoduchý nápoj nebo kaše) 150, což bez problémů propustí naměřených
 * 167 i 174, ale pořád odmítne cokoli výrazně kratšího. `MIN_DELKA_ZAKLAD`
 * je podlaha pro recepty jen s 1–2 surovinami, aby práh nespadl pod
 * rozumné minimum.
 */
export const MIN_DELKA_NA_SUROVINU = 50;
export const MIN_DELKA_ZAKLAD = 120;
/** Referenční hodnota pro „typický" recept o čtyřech hlavních surovinách — `prahDelkyPostupu(4) === MIN_DELKA_POSTUPU`. */
export const MIN_DELKA_POSTUPU = 200;

/**
 * @param {number} pocetHlavnichSurovin
 * @returns {number}
 */
export function prahDelkyPostupu(pocetHlavnichSurovin) {
  const n = Number.isFinite(pocetHlavnichSurovin) ? Math.max(0, pocetHlavnichSurovin) : 0;
  return Math.max(MIN_DELKA_ZAKLAD, MIN_DELKA_NA_SUROVINU * n);
}

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
  if (a === b) return true;
  if (jeNepravidelnyMnozneCislo(a, b)) return true;

  const kratsi = a.length <= b.length ? a : b;
  const delsi = a.length <= b.length ? b : a;

  let spolecnyZacatek = 0;
  while (spolecnyZacatek < kratsi.length && kratsi[spolecnyZacatek] === delsi[spolecnyZacatek]) {
    spolecnyZacatek += 1;
  }

  return (kratsi.length - spolecnyZacatek) <= 1 && (delsi.length - spolecnyZacatek) <= 2;
}

/**
 * CHYBA 3 (recept #484, naměřeno 8.–9. 9. 2026): „rajče" → „rajčata" mění
 * kmen (ne jen koncovku), takže obecné pravidlo výš (společný začátek +
 * krátký zbytek) je nepozná jako tvar téhož slova — „rajcata" má za
 * společným začátkem „rajc" ještě 3 vlastní znaky, o jeden víc, než kolik
 * delší slovo smí. Tenhle vzor (neživotné/mladé jméno na -e s množným
 * číslem na -ata) je v češtině pravidelně nepravidelný — „kuře"→„kuřata",
 * „house"→„housata", „sele"→„selata" — a obecné pravidlo ho principiálně
 * nemůže chytit. Řeší se malým seznamem známých dvojic, ne novým prahem
 * (ten by se zase rozešel s jiným párem slov, jako `syr`/`syrove`).
 */
const NEPRAVIDELNE_TVARY = new Set(
  [
    ['rajče', 'rajčata'],
    ['kuře', 'kuřata'],
    ['house', 'housata'],
    ['sele', 'selata'],
  ]
    .map(([j, mn]) => [normalizuj(j), normalizuj(mn)])
    .map(([j, mn]) => (j < mn ? `${j}|${mn}` : `${mn}|${j}`)),
);

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function jeNepravidelnyMnozneCislo(a, b) {
  return NEPRAVIDELNE_TVARY.has(a < b ? `${a}|${b}` : `${b}|${a}`);
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
const TEPELNA_SLOVESA = new Set([
  'peč', 'pečte', 'upeč', 'upečte', 'opeč', 'opečte', 'zapeč', 'zapečte',
  'smaž', 'smažte', 'osmaž', 'osmažte', 'vař', 'vařte', 'uvař', 'uvařte',
  'povař', 'povařte', 'dus', 'duste', 'poduste', 'griluj', 'grilujte',
  'restuj', 'restujte', 'orestuj', 'orestujte',
].map(normalizuj));

/**
 * CHYBA 2 (naměřeno 8.–9. 9. 2026): předpona `(^|\s)opeč` sedí i na
 * „opečený", „opečená" — přídavné jméno odvozené od slovesa, ne sloveso
 * samo. „Cottage na opečeném chlebu" pak laťka zamítla, protože si
 * vyžádala teplotu/čas jako u skutečné tepelné úpravy. Fix: hledá se
 * PŘESNÉ slovo (celý token, ne předpona) — „opeč"/„opečte" ano,
 * „opečený" ne.
 *
 * @param {string} textNormalizovany
 * @returns {boolean}
 */
function obsahujeTepelnouUpravu(textNormalizovany) {
  return slovaTextu(textNormalizovany).some((w) => TEPELNA_SLOVESA.has(w));
}

/** Běžně halucinované suroviny — hlídané, jen když NEJSOU v `ingredients`. */
const CASTO_HALUCINOVANE_SUROVINY = [
  'vejce', 'mléko', 'smetana', 'máslo', 'sýr', 'jogurt', 'víno', 'ořechy',
  'mouka', 'med', 'slanina', 'šunka', 'houby', 'rajčata', 'cizrna', 'čočka',
  'fazole', 'rýže', 'těstoviny', 'brambory', 'losos', 'tuňák', 'krevety',
].map(normalizuj);

/**
 * Vynucená konzistence mezi pravidlem 5 a pravidlem 8 — žádná surovina
 * nesmí být zároveň „chybí" (5) i „halucinovaná" (8). Exportováno
 * samostatně, aby šlo přímo otestovat, že tahle bezpečnostní síť spadne
 * na JAKÉMKOLI páru, který `jsouTvaryTehozSlova` považuje za stejné
 * slovo — ne jen na konkrétním „rajče"/„rajčata", který kořen opravy
 * (viz `NEPRAVIDELNE_TVARY`) už dřív odstíní od tohodle kódu vůbec.
 *
 * @param {string[]} chybejiciNorm normalizované názvy „chybějících" surovin (pravidlo 5)
 * @param {string[]} halucinaceNorm normalizovaná slova označená za halucinovaná (pravidlo 8)
 * @throws {Error} když se najde surovina, o které obě pravidla tvrdí opak
 */
export function zkontrolujKonzistenciSurovin(chybejiciNorm, halucinaceNorm) {
  const chybi = Array.isArray(chybejiciNorm) ? chybejiciNorm : [];
  const halucinovane = Array.isArray(halucinaceNorm) ? halucinaceNorm : [];
  const spor = chybi.find((c) => halucinovane.some((h) => jsouTvaryTehozSlova(c, h)));
  if (spor) {
    throw new Error(
      `posudPostup: logický spor — "${spor}" je podle pravidla 5 "chybí" a podle pravidla 8 zároveň "halucinovaná". `
      + 'To je chyba v porovnávání slov (jsouTvaryTehozSlova), ne stav receptu.'
    );
  }
}

/**
 * `ok` se řídí VÝHRADNĚ `duvody` (blokující pravidla). `varovani` se nikdy
 * nezapočítávají do `ok`, nikdy nebrání zápisu a nikdy nesmí spustit
 * přepis postupu — jsou jen k logování a ruční kontrole.
 *
 * @param {{ kroky: unknown, suroviny: unknown, nazev?: unknown }} vstup
 * @returns {{ ok: boolean, duvody: string[], varovani: string[] }}
 */
export function posudPostup({ kroky, suroviny, nazev } = {}) {
  const cisteKroky = ocistiKroky(kroky);
  const jmenaSurovin = nazvySurovin(suroviny);
  const jmenaSurovinNorm = jmenaSurovin.map(normalizuj);
  const celyText = cisteKroky.join(' ');
  const celyTextNorm = normalizuj(celyText);

  /** @type {string[]} */
  const duvody = [];
  /** @type {string[]} */
  const varovani = [];

  // BLOKUJÍCÍ 1) Min. počet kroků — nutná (ne dostatečná) podmínka
  // skutečného postupu. Jednoznačné, 96 zásahů naměřeno 9. 9. 2026.
  const malokroku = cisteKroky.length < MIN_KROKU;
  if (malokroku) {
    duvody.push(`míň než ${MIN_KROKU} kroky (má ${cisteKroky.length})`);
  }

  // BLOKUJÍCÍ 2) Min. délka celého postupu — SAMOSTATNĚ blokovat nesmí.
  // Naměřeno 9. 9. 2026: nezávisle na počtu kroků dávalo 219 falešných
  // zásahů (krátký text u receptu se 4+ kroky a málo surovinami — viz
  // `prahDelkyPostupu`, CHYBA 4 — pořád vypadá „krátce" u receptu jen
  // se dvěma surovinami). Blokuje proto JEN jako potvrzující signál
  // k pravidlu 1: recept, který má dost kroků, projde bez ohledu na to,
  // jak je textově krátký.
  const hlavniSuroviny = jmenaSurovin.filter((s) => !jeKoreniNeboZaklad(s));
  const prahDelky = prahDelkyPostupu(hlavniSuroviny.length);
  if (celyText.length < prahDelky && malokroku) {
    duvody.push(`celý postup má jen ${celyText.length} znaků, min. je ${prahDelky} (${hlavniSuroviny.length} hlavních surovin)`);
  }

  // BLOKUJÍCÍ 3) Žádný krok není jen „Připrav X" / „Nachystej X" bez
  // dalšího obsahu — tohle JE ta vata (16 zásahů, jednoznačné).
  cisteKroky.forEach((krok, i) => {
    if (jePrazdnyKrok(krok)) {
      duvody.push(`krok ${i + 1} je prázdná vata bez množství, času nebo dalšího úkonu: „${krok}"`);
    }
  });

  // ZAHOZENO 9. 9. 2026 — „krok obsahuje rozkazovací sloveso" bylo
  // pravidlo, které se snažilo poznat „je tohle instrukce?" ENUMERACÍ
  // sloves. Čeština jich má stovky, seznam nikdy nebude úplný — i po
  // rozšíření o 18 sloves (oprava z předešlého běhu) dal 1053 zásahů na
  // 1000 receptech. To není náhoda, to je důkaz, že enumerace jako
  // metoda nefunguje. Celé pravidlo i whitelist `ROZKAZOVACI_SLOVESA`
  // jsou pryč — mrtvý seznam v kódu by jen sváděl ho zase zapnout.

  // VAROVNÉ) Každá hlavní surovina (mimo koření a základ) se má objevit
  // aspoň v jednom kroku. Stejný strukturální problém jako u zahozeného
  // pravidla výš — postup ji může zmiňovat opsaně, jiným synonymem nebo
  // pod jiným tvarem, který `jsouTvaryTehozSlova` nechytí. Loguje se,
  // nikdy neblokuje zápis a nikdy nespouští přepis.
  const slovaPostupu = slovaTextu(celyTextNorm);
  const chybejici = hlavniSuroviny.filter((s) => !surovinaJeVTextu(normalizuj(s), slovaPostupu));
  if (chybejici.length) {
    varovani.push(`postup nezmiňuje surovinu/y: ${chybejici.join(', ')}`);
  }

  // VAROVNÉ) U tepelné úpravy má padnout teplota nebo čas. Naměřeno
  // 9. 9. 2026: 164 zásahů — recept může teplotu/čas zmínit způsobem,
  // který regex nechytí („dozlatova", „do změknutí", recept na jiném
  // místě uvádí teplotu jednou pro víc kroků). Užitečný signál k ruční
  // kontrole, ne důvod zahazovat jinak dobrý postup.
  if (obsahujeTepelnouUpravu(celyTextNorm)) {
    const maTeplotu = /\d+\s*°?\s*c\b/.test(celyTextNorm) || /\d+\s*stup/.test(celyTextNorm);
    const maCas = /\d+\s*(min|hodin|sekund)/.test(celyTextNorm);
    if (!maTeplotu && !maCas) {
      varovani.push('tepelná úprava bez teploty i bez času přípravy');
    }
  }

  // BLOKUJÍCÍ 4) Postup nesmí uvádět kcal ani makra — ta jsou
  // v číselných polích, duplicitní (a snadno neshodný) text v postupu
  // tam nepatří. Jednoznačné, nezávisí na enumeraci ani na skloňování.
  if (/\bkcal\b/.test(celyTextNorm) || /kalori/.test(celyTextNorm)) {
    duvody.push('postup uvádí kalorickou hodnotu, ta patří jen do pole kcal');
  }
  cisteKroky.forEach((krok) => {
    const n = normalizuj(krok);
    if (/\d/.test(n) && /(bilkovin|sacharid)/.test(n)) {
      duvody.push(`krok uvádí makroživiny v textu: „${krok}"`);
    }
  });

  // VAROVNÉ) Postup zmiňuje surovinu, která není v `ingredients`.
  // Naměřeno 9. 9. 2026: 194 zásahů (máslo 49, rajčata 37, sýr 32,
  // fazole 31, víno 23, med 22) — pevný seznam „často halucinovaných"
  // surovin hlásí mimo jiné máslo u receptu, který máslo má, jen pod
  // jiným názvem (přepsaným, opsaným, se specifikací typu). Halucinace
  // stojí za ruční kontrolu, ne za automatické zahození dobrého postupu.
  const halucinace = CASTO_HALUCINOVANE_SUROVINY.filter((s) => {
    if (!slovoJeVTextu(s, slovaPostupu)) return false;
    return !jmenaSurovinNorm.some((j) => slovoJeVTextu(s, j.split(' ')));
  });
  if (halucinace.length) {
    varovani.push(`postup zmiňuje surovinu mimo ingredients: ${halucinace.join(', ')}`);
  }

  // GARANCE VNITŘNÍ KONZISTENCE — teď nad VAROVÁNÍMI, ne nad blokujícími
  // důvody (obě zdrojová pravidla — „chybí"/„halucinace" — jsou od tohohle
  // běhu jen varovná), ale platí stejně: žádná surovina nesmí být
  // zároveň „chybí" i „halucinovaná". Recept #484 (naměřeno 8.–9. 9. 2026)
  // dostal NAJEDNOU „postup nezmiňuje surovinu: rajče" a „postup zmiňuje
  // surovinu mimo ingredients: rajcata" — logický spor, protože obojí
  // mluvilo o téže surovině, jen jinak skloňované. Kořen je opravený
  // (`NEPRAVIDELNE_TVARY`), tahle kontrola je bezpečnostní síť pro
  // jakýkoli jiný pár slov, který by obecné pravidlo minulo.
  zkontrolujKonzistenciSurovin(chybejici.map((s) => normalizuj(s)), halucinace);

  // BLOKUJÍCÍ 5) Kontrola názvu je záměrně jen defenzivní — samotný
  // název laťku neurčuje, ale prázdný název je signál rozbitého vstupu,
  // ne validní recept.
  if (nazev != null && !String(nazev).trim()) {
    duvody.push('recept nemá název');
  }

  return { ok: duvody.length === 0, duvody, varovani };
}
