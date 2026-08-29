/**
 * Parsování a filtrování vyloučených potravin pro START plán.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TENHLE SEZNAM ROZHODUJE O LAKTÓZE V CELÉ APLIKACI.
 *
 * `lib/dietaryRules.js:267` řeší dietu `lactose_free` výhradně přes
 * `mealContainsExcludedFood()`, tedy přes `DAIRY_TERMS` níž. Co tady chybí,
 * projde publikační bránou i `assertPlanPublishableForDiet()` jako čisté jídlo.
 *
 * Změřeno na produkci 14. 8. 2026: 5 z 8 aktivních plánů `lactose_free` účtů
 * obsahovalo fetu nebo parmezán — a jeden takový plán odešel e-mailem. Příčiny
 * byly dvě a obě v tomhle souboru:
 *   1. `feta` (a `cheddar`) v seznamu vůbec nebyly.
 *   2. `parmazan` byl PŘEKLEP. Česky se píše „parmezán“, což se po složení
 *      diakritiky rovná `parmezan` — výraz `parmazan` se proto nikdy netrefil.
 *      Obě psaní se drží schválně: `parmazan` je doložený překlep i v uživatelsky
 *      psaných `foods_to_avoid`, takže ho chceme chytat taky.
 * Před přidáním dalšího sýra si přečti komentář u `matchesTermStart()` —
 * porovnává se na ZAČÁTKU slova, ne podřetězcem.
 */

/**
 * Sýry. Používá se i pro samostatné vyloučení sýra bez celé mléčné skupiny
 * (uživatel napíše „sýr“ do `foods_to_avoid`, ale jogurt mu nevadí).
 * @type {readonly string[]}
 */
const CHEESE_HARD_TERMS = Object.freeze([
  'syr', 'eidam', 'gouda', 'cottage',
  // Kmeny, ne celá slova — čeština skloňuje („mozzarellou“, „ricottou“).
  'mozzarell', 'ricott', 'mascarpon',
  // Doplněno 14. 8. 2026 po nálezu v produkčních plánech.
  'cheddar',
  // Obě psaní: `parmezan` je správně česky, `parmazan` je doložený překlep
  // (a právě ten překlep způsobil, že se výraz nikdy netrefil).
  'parmezan', 'parmazan',
  'gorgonzol', 'brie', 'camembert', 'hermelin',
  // FETA A NIVA SE VYPISUJÍ PO TVARECH, ZBYTEK STAČÍ KMENEM.
  //
  // U ostatních sýrů je kmen delší než kterékoli české slovo, které by se
  // dalo splést. U fety a nivy ne: kmen `fet` by chytil „fettuccine“ (což je
  // těstovina, ne sýr) a kmen `niv` slova jako „nivelace“. Skloňované tvary
  // se proto vypisují — je jich pět a jsou konečné.
  'feta', 'fety', 'fete', 'fetu', 'fetou',
  'niva', 'nivy', 'nive', 'nivu', 'nivou',
  // `syr` výš tohle chytí samo; je tu explicitně, aby bylo v seznamu vidět,
  // že se na balkánský sýr nezapomnělo.
  'balkansky syr',
]);

/**
 * Všechno mléčné. Nadmnožina sýrů.
 * @type {readonly string[]}
 */
const DAIRY_TERMS = Object.freeze([
  ...CHEESE_HARD_TERMS,
  'tvaroh',
  'jogurt',
  'mleko',
  'mlec',
  'kefír',
  'kefir',
  'smetan',
  'slehack',
  'bryndz',
  // Doplněno 29. 8. 2026 po nálezu v produkčním plánu (krevety s česnekovým
  // máslem). Kmen `masl` chytí máslo/máslem/másla i přepuštěné máslo — masce
  // níž se od začátku počítalo s tím, že sem jednou přibude (`masl\w*` je
  // v `PLANT_BASE` už teď), takže „arašídové máslo“ apod. zůstává povolené.
  'masl',
  'ghi',
]);

/**
 * ROSTLINNÉ VÝJIMKY — maskují se z textu PŘED hledáním.
 *
 * `mleko` jinak najde „kokosové mléko“ a `smetan` „kokosovou smetanu“; obojí je
 * pro bezlaktózovou dietu v pořádku a blokovat je znamená brát uživateli jídla
 * bez důvodu. Maskuje se PŘÍVLASTEK + ZÁKLAD těsně za sebou, ne holý přívlastek —
 * „mandlový dort se smetanou“ tak zůstane zablokovaný správně.
 *
 * `masl` je od 29. 8. 2026 i v `DAIRY_TERMS` (nález: recept s obyčejným
 * máslem propadl publikační bránou). V masce byl už dřív schválně —
 * proto „arašídové máslo“ a spol. zůstávají díky masce povolené.
 */
// `nut` a `plant` samotné tu SCHVÁLNĚ NEJSOU. Jako předpona by `nut` chytilo
// „nutella s mlékem“ a odmaskovalo by tím skutečné mléko. Anglické rostlinné
// varianty pokrývají konkrétní suroviny níž.
const PLANT_PREFIX = '(?:mandlov|kokosov|sojov|soyov|ovesn|ryzov|arasidov|kesu|kakaov|slunecnicov|konopn|lisk|makadam|rostlinn|vegansk|plant based|almond|coconut|soy|soya|oat|rice|peanut|cashew|hemp|sunflower|cocoa)';
// `mle[kc]` pokrývá „mléko“ i „mléce“/„mléčný“ — a právě tvar „na kokosovém
// mléce“ maska bez toho minula.
const PLANT_BASE = '(?:mle[kc]\\w*|masl\\w*|smetan\\w*|jogurt\\w*|syr\\w*|milk|butter|cream|yogurt|yoghurt|cheese)';
const PLANT_EXEMPTION_RE = new RegExp(`\\b${PLANT_PREFIX}\\w*\\s+${PLANT_BASE}`, 'g');

/**
 * @param {string} normalized už složený text
 * @returns {string} text bez rostlinných variant
 */
function maskPlantAlternatives(normalized) {
  return normalized.replace(PLANT_EXEMPTION_RE, ' ');
}

function normalizeFoodText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitFoodTerms(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\n]+/)
    .map((part) => normalizeFoodText(part))
    .filter(Boolean);
}

/**
 * KOTVÍ SE ZAČÁTEK SLOVA, NE CELÉ SLOVO A NE PODŘETĚZEC.
 *
 * Čeština skloňuje: „fetou“, „parmezánem“, „sýrem“, „hermelínem“. Oboustranné
 * `\b…\b` by z nich nechytilo ani jedno. Dosavadní kód to obcházel přílepkem
 * `|| text.includes(term)`, jenže ten hledá kdekoli uvnitř slova — přesně ta
 * mina, kterou popisuje `lib/dietCriticalTerms.js` (tam `bun` našlo „bunch“).
 * Stejné řešení jako tam: kotva jen vlevo.
 *
 * @param {string} text už složený text
 * @param {string} term už složený výraz
 * @returns {boolean}
 */
function matchesTermStart(text, term) {
  if (!text || !term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}`, 'u').test(text);
}

function termMatchesNormalized(text, term) {
  return matchesTermStart(text, term);
}

function rawTermsIncludeCheese(rawTerms) {
  return rawTerms.some((t) => CHEESE_HARD_TERMS.some((c) => t.includes(c)));
}

function rawTermsIncludeDairy(rawTerms) {
  return rawTerms.some((t) =>
    t.includes('mlec')
    || t.includes('laktoz')
    || t.includes('tvaroh')
    || t.includes('jogurt')
    || t.includes('kefír')
    || t.includes('kefir')
    || t.includes('syr')
  );
}

/**
 * @param {object|null|undefined} bodyMetrics
 * @returns {{ rawTerms: string[], cheeseExcluded: boolean, dairyExcluded: boolean, blockedTerms: string[] }}
 */
export function parseDietaryExclusions(bodyMetrics) {
  // Alergie a intolerance chodí z registrace do dietary_restrictions;
  // sloupec body_metrics.allergies neexistuje.
  const combined = [
    bodyMetrics?.foods_to_avoid,
    bodyMetrics?.dietary_restrictions,
  ]
    .filter(Boolean)
    .join(', ');

  const rawTerms = splitFoodTerms(combined);
  const cheeseExcluded = rawTermsIncludeCheese(rawTerms);
  const dairyExcluded = rawTermsIncludeDairy(rawTerms) || String(bodyMetrics?.diet_type || '').toLowerCase() === 'lactose_free';

  const blockedTerms = [];
  if (dairyExcluded) {
    blockedTerms.push(...DAIRY_TERMS);
  } else if (cheeseExcluded) {
    blockedTerms.push(...CHEESE_HARD_TERMS.filter((t) => t !== 'cottage' && t !== 'ricotta' && t !== 'mascarpone'));
    blockedTerms.push('syr');
  }

  for (const term of rawTerms) {
    if (!blockedTerms.includes(term)) blockedTerms.push(term);
  }

  return {
    rawTerms,
    cheeseExcluded,
    dairyExcluded,
    blockedTerms: [...new Set(blockedTerms)],
  };
}

/**
 * @param {string} text
 * @param {{ blockedTerms?: string[], cheeseExcluded?: boolean, dairyExcluded?: boolean }} exclusions
 */
export function textContainsExcludedFood(text, exclusions) {
  const norm = normalizeFoodText(text);
  if (!norm) return false;

  // ROSTLINNÁ VÝJIMKA PLATÍ JEN NA MLÉČNOU SKUPINU, NE NA UŽIVATELSKÝ VÝČET.
  //
  // Když si člověk sám napíše „kokosové mléko“ do `foods_to_avoid`, musí to
  // zůstat zablokované — jeho vlastní seznam je silnější než naše dietní
  // pravidlo. Proto se maskovaný text používá jen na výrazy z `DAIRY_TERMS`,
  // kdežto vlastní výrazy se hledají v původním textu.
  const normMasked = maskPlantAlternatives(norm);
  const jeMlecnyVyraz = (term) => DAIRY_TERMS.includes(term);

  const blocked = exclusions?.blockedTerms || [];
  for (const term of blocked) {
    if (termMatchesNormalized(jeMlecnyVyraz(term) ? normMasked : norm, term)) return true;
  }

  if (exclusions?.dairyExcluded) {
    for (const term of DAIRY_TERMS) {
      if (termMatchesNormalized(normMasked, term)) return true;
    }
  } else if (exclusions?.cheeseExcluded) {
    for (const term of CHEESE_HARD_TERMS) {
      if (term === 'cottage' || term === 'ricotta' || term === 'mascarpone') continue;
      if (termMatchesNormalized(normMasked, term)) return true;
    }
    // Dřív `norm.includes('syr')` — to blokovalo i „sójový sýr“. Kotva na
    // začátku slova nad maskovaným textem dělá totéž bez té vedlejší škody.
    if (matchesTermStart(normMasked, 'syr')) return true;
  }

  return false;
}

/**
 * @param {object|null|undefined} mealLike
 * @param {ReturnType<typeof parseDietaryExclusions>} exclusions
 */
export function mealContainsExcludedFood(mealLike, exclusions) {
  if (!mealLike || !exclusions) return false;
  const parts = [
    mealLike.name_cs,
    mealLike.display_name_cs,
    mealLike.display_name,
    mealLike.title,
    mealLike.ai_name,
  ];
  for (const part of parts) {
    if (textContainsExcludedFood(part, exclusions)) return true;
  }

  const ingredientSources = [
    mealLike.shopping_ingredient_lines,
    mealLike.ingredients,
    mealLike.recipe?.ingredients,
    mealLike.fallback_meal_template?.shopping_ingredient_lines,
  ];
  for (const source of ingredientSources) {
    if (!Array.isArray(source)) continue;
    for (const line of source) {
      const text = typeof line === 'string' ? line : line?.name || line?.original || '';
      if (textContainsExcludedFood(text, exclusions)) return true;
    }
  }

  return false;
}

/**
 * @param {object|null|undefined} template
 * @param {ReturnType<typeof parseDietaryExclusions>} exclusions
 */
export function isTemplateAllowedForExclusions(template, exclusions) {
  if (!template) return false;
  return !mealContainsExcludedFood(template, exclusions)
    && !mealContainsExcludedFood(template.fallback_meal_template, exclusions);
}

/**
 * Bezpečná náhrada za jídlo se sýrem.
 * @param {string} mealType
 */
export function cheeseFreeAlternativeName(mealType) {
  return cheeseFreeAlternativeNames(mealType)[0];
}

/**
 * @param {string} mealType
 * @returns {string[]}
 */
export function cheeseFreeAlternativeNames(mealType) {
  const mt = String(mealType || 'lunch').toLowerCase();
  if (mt === 'breakfast') {
    return ['Vejce s pečivem a zeleninou', 'Ovesná kaše s proteinem', 'Jogurt s ovocem', 'Cottage s pečivem'];
  }
  if (mt === 'snack') {
    return ['Sendvič se šunkou', 'Jogurt s ovocem', 'Vejce natvrdo se zeleninou', 'Kefír a pečivo'];
  }
  if (mt === 'dinner') {
    return ['Kuře se zeleninou', 'Brambory s vejcem', 'Těstoviny s kuřetem', 'Omeleta se zeleninou'];
  }
  return ['Kuře s rýží a zeleninou', 'Rýže s vejcem a zeleninou', 'Těstoviny s tuňákem', 'Brambory s vejcem'];
}

export default parseDietaryExclusions;
