/**
 * Runtime skóre jednoduchosti receptu — bez DB migrace.
 * Použito při výběru z recipes_catalog a pro zjednodušení názvů v UI.
 */

import { penalizaceZaBilkoviny } from './nutrition/cilBilkovinSlotu.js';
import { penalizaceZaTuk } from './nutrition/cilTukuSlotu.js';

/** @typedef {'breakfast'|'lunch'|'dinner'|'snack'|'snidane'|'obed'|'vecere'|'svacina'|string} MealTypeHint */

export const SIMPLE_MEAL_COACH_INSTRUCTION_BLOCK = `Jsi praktický fitness výživový kouč Body & Mind ON.
Tvým cílem není vytvořit gurmánský jídelníček.
Tvým cílem je vytvořit jídelníček, který obyčejný člověk opravdu zvládne dodržet.

Jednoduchost je důležitější než originalita.
Dostupnost je důležitější než pestrost.
Opakovatelnost je lepší než zbytečná složitost.

Preferuj běžné české/slovenské potraviny.
Snídaně a svačiny musí být extrémně jednoduché.
Hlavní jídla mají být hotová do 30 minut.
U vysokokalorických profilů navyš porce jednoduchých jídel, ne složitost receptů.
Jídla se mohou opakovat.
Meal prep je vítaný.

Vyhni se fine dining stylu, exotickým surovinám, dlouhým názvům, nejasným jednotkám a receptům, které běžný uživatel nebude vařit.`;

export const SIMPLE_MEAL_POLICY_PROMPT_BLOCK = `PRAVIDLO JEDNODUCHÝCH JÍDEL (POVINNÉ):
${SIMPLE_MEAL_COACH_INSTRUCTION_BLOCK}

Konkrétně preferuj: vejce, tvaroh, jogurt, vločky, rýži, brambory, těstoviny, kuře, krůtu, tuňáka, cottage, šunku, sýr, fazole, čočku, zeleninu, ovoce, pečivo, tortilly.
80 % jídel musí být velmi jednoduchých; max 20 % může být zajímavějších.
Snídaně/svačina: max 5 surovin, 5–15 min (svačina ideálně bez vaření). Oběd/večeře: max 6–8 surovin, 15–30 min.
Postup max 3–5 kroků. Vyhni se: frittata, lasagne, krabí, pesto, salsa, kaviár, fenykl, redukce, glazura, vrstvy, mexická mísa, oz/cup/tbsp, „4 porce soli“.`;

/** @param {number} targetKcal */
export function highCalorieMealPolicyBlock(targetKcal) {
  const t = Math.round(Number(targetKcal) || 0);
  if (t < 2600) return '';
  return `VYSOKOKALORICKÝ PROFIL (${t} kcal/den):
Navyšuj PORCE jednoduchých jídel (více rýže/brambor/těstovin, větší porce tvarohu/jogurtu/vloček, olivový olej, ořechy, sýr, větší svačina).
NEPřidávej složitější recepty ani exotické suroviny jen kvůli kaloriím.
Preferuj meal prep a opakování stejných jednoduchých jídel.`;
}

/** Sdílený blok pro GPT skeleton v planOrchestrator (volitelná větev). Katalogová cesta stejné principy dodržuje kód. */
export const PLAN_DELIVERY_QUALITY_BLOCK = `KVALITA PLÁNU PRO UŽIVATELE (START i další týdny):
- První plán má být POUŽITELNÝ hned — ne dokonalý. Jednoduchost a dodržitelnost > originalita.
- Trénink: praktické cviky podle vybavení z profilu; rozumný objem; rozcvička a odpočinek tam, kde dává smysl.
- Návyky (pokud jsou součástí výstupu): max 1–3 denní kroky, splnitelné i v náročný den.
- Výstup musí být konzistentní pro profil i e-mail — stejné názvy jídel, stejná struktura dní, žádné „jiné“ verze pro UI.`;

const PENALIZED_NAME_PATTERNS = [
  /pastitsio/i,
  /frittata/i,
  /lasagn/i,
  /grilovan[eé]\s+po\s+mysliv/i,
  /krab/i,
  /avok[aá]dov[eé]?\s+pesto/i,
  /bazalkov[eé]?\s+avok[aá]dov[eé]?\s+pesto/i,
  /salsa/i,
  /kavi[aá]r/i,
  /(citronov[yý]|limetkov[yý])\s+kavi[aá]r/i,
  /(vodn[ií]|water)\s+zel[ií]/i,
  /baby\s+řep/i,
  /fenykl/i,
  /redukc/i,
  /glazur/i,
  /flambovan/i,
  /konfitovan/i,
  /mexick[aá]/i,
  /vrstv/i,
  /gurm[aá]nsk/i,
  /chřest/i,
  /artyčok/i,
  /quinoa/i,
  /vícezrnn/i,
  /mysliv/i,
  /pečen[eé]\s+květ[aá]k/i,
  /smažen[aá]\s+rýže/i,
  /pesto/i,
  /avok[aá]d/i,
  /bazalkov/i,
];

const PENALIZED_INGREDIENT_PATTERNS = [
  /\boz\b/i,
  /\bcup\b/i,
  /\btbsp\b/i,
  /\btsp\b/i,
  /\bserving\s+of\s+salt\b/i,
  /\b\d+\s*porc[eí]\s+sol/i,
  /\bfenykl\b/i,
  /\bbaby\s+řep/i,
  /\bkavi[aá]r\b/i,
  /\bartyčok/i,
];

const PREFERRED_TERMS = [
  'kuře',
  'kuřecí',
  'krůt',
  'vejce',
  'vejec',
  'tvaroh',
  'jogurt',
  'řecký jogurt',
  'cottage',
  'vločk',
  'rýž',
  'brambor',
  'těstovin',
  'pečiv',
  'tortill',
  'tuňák',
  'tuniak',
  'šunk',
  'sýr',
  'fazole',
  'čočk',
  'zelenin',
  'banán',
  'jablko',
  'ořech',
  'mléko',
  'kefír',
  'omelet',
  'ovesn',
  'sendvič',
];

const DISPLAY_NAME_SIMPLIFY_RULES = [
  [/mexick[aá]\s+kuřecí\s+a\s+rýžov[aá]\s+mísa/i, 'Kuře s rýží a zeleninou'],
  [/mexick[aá]\s+.*mísa/i, 'Kuře s rýží a zeleninou'],
  [/smažen[aá]\s+rýže.*květák.*/i, 'Rýže se zeleninou a vejcem'],
  [/smažen[aá]\s+rýže.*/i, 'Rýže se zeleninou'],
  [/těstoviny\s+z\s+celozrnn[eé]\s+pšenice\s+s\s+bazalkov[eé]m\s+avok[aá]dov[eé]m\s+pestem/i, 'Těstoviny s kuřetem a zeleninou'],
  [/.*avok[aá]dov[eé]?\s+pesto.*/i, 'Těstoviny se zeleninou'],
  [/lososov[aá]\s+frittata/i, 'Vejce s lososem a zeleninou'],
  [/frittata/i, 'Omeleta se zeleninou'],
  [/grilovan[eé]\s+kuře\s+po\s+mysliv/i, 'Kuře s bramborami a zeleninou'],
  [/krab[ií]\s+vrstv/i, 'Salát s vejci a zeleninou'],
  [/salsa\s+z\s+kukuřice\s+a\s+avok[aá]da/i, 'Salát s kukuřicí a zeleninou'],
  [/jednoduch[eé]\s+zapečen[eé]\s+lasagn/i, 'Těstoviny se sýrem a masem'],
  [/lasagn/i, 'Těstoviny se sýrem a masem'],
  [/pečen[eé]\s+květ[aá]k.*/i, 'Kuře se zeleninou a přílohou'],
];

/** @param {object|null|undefined} row */
export function ingredientLinesFromRow(row) {
  const ing = row?.ingredients;
  if (!Array.isArray(ing)) return [];
  return ing
    .map((i) => {
      if (typeof i === 'string') return i.trim();
      if (i && typeof i === 'object') {
        return String(i.original || i.name || i.text || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

/**
 * Řádky surovin PRO VALIDACI — z metrických polí, ne ze zdrojového textu.
 *
 * `ingredientLinesFromRow` staví řádek z `i.original`, což je NEPŘELOŽENÝ
 * originál ze Spoonacularu („1 cup almond milk“). Importér ale zároveň uloží
 * převedené hodnoty (`amount: 250, unit: 'ml'`) a uživateli se zobrazují právě
 * ty. Validace kvůli tomu soudila pole, které se nikde neukazuje.
 *
 * Dopad byl velký a nerovnoměrný. Restriktivní diety obsluhuje skoro výhradně
 * Spoonacular (české generátory pro ně skoro nic nevyrobily), takže je to
 * potkalo naplno: ze 53 aktivních gluten_free snídaní jich 46 neslo imperiální
 * jednotku v `original` a START filtr propustil jedinou. U profilu bez diety,
 * kde katalog stojí na vlastních receptech, se to neprojevilo vůbec.
 *
 * Pravidlo „START nesmí nutit uživatele odměřovat hrnky“ platí dál — jen se
 * teď dívá na čísla, která uživatel opravdu dostane. Recept, který má imperiál
 * i ve strukturovaných datech (`unit: 'Tbsps'`), se pořád zablokuje.
 *
 * @param {object|null|undefined} row
 * @returns {string[]}
 */
export function ingredientLinesForValidation(row) {
  const ing = row?.ingredients;
  if (!Array.isArray(ing)) return [];
  return ing
    .map((i) => {
      if (typeof i === 'string') return i.trim();
      if (!i || typeof i !== 'object') return '';
      const nazev = String(i.name || i.name_cs || i.text || '').trim();
      const mnozstvi = Number(i.amount);
      const jednotka = String(i.unit || '').trim();
      // Metrická data máme jen tehdy, když je známé i množství i jednotka.
      if (nazev && Number.isFinite(mnozstvi) && jednotka) {
        return `${mnozstvi} ${jednotka} ${nazev}`.trim();
      }
      return String(i.original || nazev || '').trim();
    })
    .filter(Boolean);
}

/** @param {string} text */
function countPreferredTerms(text) {
  const lower = String(text || '').toLowerCase();
  let score = 0;
  for (const term of PREFERRED_TERMS) {
    if (lower.includes(term)) score += 3;
  }
  return Math.min(score, 24);
}

/** @param {string} text @param {RegExp[]} patterns @param {number} penalty */
function penalizePatterns(text, patterns, penalty) {
  const src = String(text || '');
  let total = 0;
  for (const re of patterns) {
    if (re.test(src)) total += penalty;
  }
  return total;
}

/**
 * Vyšší skóre = jednodušší / vhodnější pro běžného uživatele.
 * @param {object|null|undefined} row — recipes_catalog row nebo meal-like objekt
 * @param {MealTypeHint} [mealType]
 * @returns {number}
 */
export function scoreRecipeSimplicity(row, mealType = 'lunch') {
  if (!row || typeof row !== 'object') return -100;

  const name = String(row.name_cs || row.name_en || row.title_cs || row.title || '').trim();
  const ingredients = ingredientLinesFromRow(row);
  const ingText = ingredients.join(' ');
  const instr = String(row.instructions_cs || row.instructions || '').trim();
  const mt = String(mealType || row.meal_type || 'lunch').toLowerCase();

  let score = 0;

  // Název
  if (name.length > 0 && name.length <= 28) score += 8;
  else if (name.length <= 42) score += 4;
  else if (name.length > 58) score -= 8;

  score += countPreferredTerms(name);
  const namePenalty = penalizePatterns(name, PENALIZED_NAME_PATTERNS, 28);
  score -= namePenalty;
  if (namePenalty > 0) {
    score -= 15;
    score = Math.min(score, -8);
  }

  // Ingredience
  const ingCount = ingredients.length;
  if (ingCount === 0) score -= 2;
  else if (ingCount <= 5) score += 12;
  else if (ingCount <= 8) score += 6;
  else if (ingCount <= 10) score += 2;
  else if (ingCount > 14) score -= 10;
  else if (ingCount > 11) score -= 5;

  score += countPreferredTerms(ingText) * 0.5;
  score -= penalizePatterns(ingText, PENALIZED_INGREDIENT_PATTERNS, 12);
  score -= penalizePatterns(ingText, PENALIZED_NAME_PATTERNS, 8);

  // Postup
  if (row.instructions_cs && instr.length > 10) score += 4;
  const stepCount = (instr.match(/\n/g) || []).length + (instr.match(/\d+\.\s/g) || []).length;
  if (stepCount > 0 && stepCount <= 5) score += 5;
  if (stepCount > 8) score -= 6;
  score -= penalizePatterns(instr, PENALIZED_INGREDIENT_PATTERNS, 10);
  score -= penalizePatterns(instr, PENALIZED_NAME_PATTERNS, 6);

  // Meal type limity
  if (mt === 'breakfast' || mt === 'snidane' || mt === 'snack' || mt === 'svacina') {
    if (ingCount > 6) score -= 8;
    if (ingCount <= 4) score += 4;
    score -= penalizePatterns(name, [/\bpečen/i, /\bgratin/i, /\bzapečen/i], 10);
  }

  if (mt === 'lunch' || mt === 'obed' || mt === 'dinner' || mt === 'vecere') {
    if (ingCount > 10) score -= 6;
  }

  if (namePenalty > 0) {
    score = Math.min(score, -5);
  }

  return Math.round(score * 10) / 10;
}

/**
 * Kombinované pořadí pro výběr z katalogu — nižší = lepší.
 *
 * Třetí složka (bílkoviny) přibyla 23. 8. 2026. Do té doby se vybíralo jen
 * podle kalorií a jednoduchosti a denní bílkoviny byly vedlejší produkt
 * katalogu — u cíle 185 g dodával plán 106 g. Penalizace je v kaloriích,
 * aby se dala sčítat s `|kcal - cíl|`; viz lib/nutrition/cilBilkovinSlotu.js.
 *
 * Čtvrtá složka (tuk) přibyla 8.4 — zrcadlo bílkovinné penalty s obrácenou
 * asymetrií (penalizuje se přestřelení, ne podstřelení) a nesečte se s
 * bílkovinnou složkou rovnocenně: `penalizaceZaTuk` má nižší maximální váhu
 * (0,6) než bílkovinná (1,0), takže při konfliktu vyhrávají bílkoviny. Viz
 * lib/nutrition/cilTukuSlotu.js.
 *
 * `cilovyPodilBilkovin`/`cilovyPodilTuku` jsou nepovinné. Bez nich se rank
 * chová přesně jako dřív, takže volající, které makra neřeší (náhradník
 * jídla, START knihovna), nemusí nic měnit.
 *
 * @param {object} row
 * @param {number} slotTarget
 * @param {MealTypeHint} [mealType]
 * @param {number|null} [cilovyPodilBilkovin] 0..1
 * @param {number|null} [cilovyPodilTuku] 0..1
 */
export function catalogPickRank(row, slotTarget, mealType = 'lunch', cilovyPodilBilkovin = null, cilovyPodilTuku = null) {
  const kcalDiff = Math.abs(Number(row?.kcal) - Number(slotTarget));
  const simplicity = scoreRecipeSimplicity(row, mealType);
  const bilkoviny = penalizaceZaBilkoviny(row, slotTarget, cilovyPodilBilkovin);
  const tuk = penalizaceZaTuk(row, slotTarget, cilovyPodilTuku);
  return kcalDiff * 1.15 + bilkoviny + tuk - simplicity * 2.8;
}

/**
 * @param {object[]} rows
 * @param {number} slotTarget
 * @param {MealTypeHint} mealType
 * @param {number|null} [cilovyPodilBilkovin]
 * @param {number|null} [cilovyPodilTuku]
 */
export function sortCatalogRowsForSimplePick(rows, slotTarget, mealType = 'lunch', cilovyPodilBilkovin = null, cilovyPodilTuku = null) {
  const SIMPLE_FLOOR = -35;
  const scored = (rows || []).map((row) => ({
    row,
    rank: catalogPickRank(row, slotTarget, mealType, cilovyPodilBilkovin, cilovyPodilTuku),
    simplicity: scoreRecipeSimplicity(row, mealType),
  }));

  let pool = scored.filter((s) => s.simplicity >= 0);
  if (pool.length < 3) pool = scored.filter((s) => s.simplicity >= SIMPLE_FLOOR);
  if (pool.length < 3) pool = scored;

  pool.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return b.simplicity - a.simplicity;
  });

  return pool.map((s) => s.row);
}

/**
 * Zjednodušení názvu pro UI — nutriční data beze změny.
 * @param {string} nameCs
 * @param {MealTypeHint} [mealType]
 * @returns {string}
 */
export function simplifyMealDisplayName(nameCs, mealType = 'lunch') {
  const raw = String(nameCs || '').trim();
  if (!raw) return raw;

  for (const [re, replacement] of DISPLAY_NAME_SIMPLIFY_RULES) {
    if (re.test(raw)) return replacement;
  }

  const simplicity = scoreRecipeSimplicity({ name_cs: raw, ingredients: [] }, mealType);
  if (simplicity >= 0) return raw;

  const lower = raw.toLowerCase();
  if (/\bkuřec/i.test(lower) && /\brýž/i.test(lower)) return 'Kuře s rýží a zeleninou';
  if (/\bkuřec/i.test(lower) && /\bbrambor/i.test(lower)) return 'Kuře s bramborami a zeleninou';
  if (/\btuňák/i.test(lower)) return 'Tuňákový salát s pečivem';
  if (/\bvejce/i.test(lower) || /\bvejec/i.test(lower)) return 'Vejce se zeleninou';
  if (/\btvaroh/i.test(lower)) return 'Tvaroh s ovocem';
  if (/\bjogurt/i.test(lower)) return 'Jogurt s ovocem';
  if (/\btěstovin/i.test(lower) && /\bkuřec/i.test(lower)) return 'Těstoviny s kuřetem';
  if (/\bovesn/i.test(lower)) return 'Ovesná kaše s ovocem';

  return raw.length > 48 ? `${raw.slice(0, 45).trim()}…` : raw;
}

/**
 * Pro uživatelský výstup — odstraní nejasné/imperiální jednotky z řádku suroviny.
 * @param {string} line
 * @returns {string}
 */
export function sanitizeIngredientLineForDisplay(line) {
  let s = String(line || '').trim();
  if (!s) return s;
  // POZOR NA ZLOMKY. Původně tu stálo `\b\d+(\.\d+)?\s*(oz|cups?|tsp|…)\b`,
  // jenže `\b` sedne i mezi „/“ a „2“, takže z „1/2 teaspoon chili powder“
  // zbylo „1/ chili powder“ — useknutá frakce, ze které uživatel nepozná
  // množství. Zlomek se proto sebere celý a číslo jen tehdy, když před ním
  // není lomítko. Hlavní obranou je ale nestavět řádek z `original` vůbec —
  // viz lib/profile/surovinaRadek.js.
  s = s.replace(/\d+\s*\/\s*\d+\s*(oz|ounces?|cups?|tbsp|tablespoons?|tsp|teaspoons?)\b/gi, '');
  s = s.replace(/(?<![\d/])\d+(\.\d+)?\s*(oz|ounces?|cups?|tbsp|tablespoons?|tsp|teaspoons?)\b/gi, '');
  s = s.replace(/\bserving(s)?\s+of\s+salt\b/gi, 'sůl dle chuti');
  s = s.replace(/\b\d+\s*porc[eí]\s+sol[^,;.]*/gi, 'sůl dle chuti');
  s = s.replace(/\s{2,}/g, ' ').replace(/^[,;.\s]+|[,;.\s]+$/g, '').trim();
  return s || String(line || '').trim();
}

export default scoreRecipeSimplicity;
