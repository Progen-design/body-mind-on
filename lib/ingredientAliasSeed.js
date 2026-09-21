/**
 * Static alias + canonical display map (mirrors public.ingredient_aliases seed).
 * Client bundle uses this; DB table allows ops to extend without redeploy (sync script optional).
 */

/** @type {Record<string, string>} normalized canonical key → Czech display name */
export const CANONICAL_DISPLAY = Object.freeze({
  'arasidove maslo': 'arašídové máslo',
  avokado: 'avokádo',
  banan: 'banán',
  'bila ryba': 'bílá ryba',
  'bily jogurt': 'bílý jogurt',
  // PROMPT_KALORIE_OBSAH.md (2026-09-18) — bez vlastního klíče `applyAlias`
  // níž řecký jogurt substring-shodou (`key.includes('jogurt')`) tiše
  // přepisoval na `bily jogurt`, tedy na jinou surovinu s ~třetinovými
  // bílkovinami. Postihovalo to i stávající recept „Řecký jogurt s medem".
  'recky jogurt': 'řecký jogurt',
  brambory: 'brambory',
  brokolice: 'brokolice',
  'celozrnny chleb': 'celozrnný chléb',
  'celozrnny toast': 'celozrnný toast',
  'cerstve ovoce': 'čerstvé ovoce',
  cesnek: 'česnek',
  cibule: 'cibule',
  citron: 'citron',
  'citronova stava': 'citronová šťáva',
  cocka: 'čočka',
  cottage: 'cottage',
  cuketa: 'cuketa',
  fazole: 'fazole',
  'hovezi maso': 'hovězí maso',
  jablko: 'jablko',
  jahody: 'jahody',
  'javorovy sirup': 'javorový sirup',
  kefir: 'kefír',
  'kruti prsa': 'krůtí prsa',
  'kruti prso': 'krůtí prso',
  'kureci prsa': 'kuřecí prsa',
  'kureci prso': 'kuřecí prso',
  'libove hovezi maso': 'libové hovězí maso',
  'libove maso (napr. veprove)': 'libové maso (např. vepřové)',
  losos: 'losos',
  maslo: 'máslo',
  med: 'med',
  mleko: 'mléko',
  mrkev: 'mrkev',
  musli: 'müsli',
  okurka: 'okurka',
  olej: 'olej',
  'olivovy olej': 'olivový olej',
  orechy: 'ořechy',
  'ovesne vlocky': 'ovesné vločky',
  paprika: 'paprika',
  'paprika (cervena)': 'paprika (červená)',
  pepr: 'pepř',
  'proteinovy prasek': 'proteinový prášek',
  quinoa: 'quinoa',
  rajce: 'rajče',
  'ryba (napr. losos)': 'ryba (např. losos)',
  'ryba (napr. treska)': 'ryba (např. treska)',
  ryze: 'rýže',
  'ryze (bila)': 'rýže (bílá)',
  'salat (napr. ledovy)': 'salát (např. ledový)',
  skorice: 'skořice',
  'sladke brambory': 'sladké brambory',
  'smes salatu': 'směs salátů',
  'sojova omacka': 'sojová omáčka',
  spenat: 'špenát',
  sunka: 'šunka',
  syr: 'sýr',
  testoviny: 'těstoviny',
  'tunak (v konzerve)': 'tuňák (v konzervě)',
  tvaroh: 'tvaroh',
  vejce: 'vejce',
  'veprova panenka': 'vepřová panenka',
  zelenina: 'zelenina',
  jogurt: 'jogurt',
  protein: 'proteinový prášek',
  tunak: 'tuňák (v konzervě)',
  mandle: 'ořechy',
  'celozrnne pecivo': 'celozrnný chléb',
  kuskus: 'kuskus',
  strouhanka: 'strouhanka',
  sul: 'sůl',
  tofu: 'tofu',
  hrasek: 'hrášek',
});

/** @type {Array<[string, string]>} [aliasNormalized, canonicalNormalized] longest-first at runtime */
export const ALIAS_PAIRS = Object.freeze([
  ['tunak ve vlastni stave', 'tunak (v konzerve)'],
  ['tunak v konzerve', 'tunak (v konzerve)'],
  ['celozrnne pecivo', 'celozrnny chleb'],
  ['celozrnný chléb', 'celozrnny chleb'],
  ['proteinovy prasek', 'proteinovy prasek'],
  ['protein', 'proteinovy prasek'],
  ['bileho jogurtu', 'bily jogurt'],
  ['bily jogurt', 'bily jogurt'],
  // Musí být PŘED ['jogurt', 'bily jogurt'] — applyAlias zkouší přesnou
  // shodu jako první smyčku přes VŠECHNY páry, takže pořadí v poli samo
  // o sobě přesnou shodu neřeší, ale substring smyčka níž by bez tohoto
  // páru „řecký jogurt" stejně přepsala na obecný přes 'jogurt'.
  ['recky jogurt', 'recky jogurt'],
  ['jogurt', 'bily jogurt'],
  ['kureci prso', 'kureci prsa'],
  ['kruti prso', 'kruti prsa'],
  ['mandle', 'orechy'],
  ['tunak', 'tunak (v konzerve)'],
]);

/** @type {Record<string, number>} unit (normalized ascii) → grams per 1 unit */
export const UNIT_TO_GRAMS = Object.freeze({
  lzicka: 5,
  lzice: 15,
});

/**
 * Gramy na jeden kus u surovin, které se v receptech píšou i v `g`, i v `ks`.
 * Klíč = kanonický klíč (viz `CANONICAL_DISPLAY`).
 *
 * ZDROJ: řádky `public.unit_conversions` (`unit = 'ks'`, `ingredient_match`
 * podle `name_cs`), seed z migrací 20260715224602 a 20260721… — čísla jsou
 * stejná jako tam, nic nevymyšleného od oka. Surovina, která tu není, se
 * `g` ↔ `ks` NESLUČUJE: dva poctivé řádky jsou lepší než špatný součet
 * (proto tu chybí např. maso — „kus" kuřecích prsou je jiný u každého receptu).
 *
 * @type {Record<string, number>}
 */
export const PIECE_WEIGHT_G = Object.freeze({
  vejce: 55,
  banan: 120,
  jablko: 180,
  citron: 100,
  'celozrnny chleb': 30,
  'celozrnny toast': 30,
  cibule: 110,
  rajce: 120,
  paprika: 150,
  avokado: 150,
  okurka: 200,
  cuketa: 200,
  mrkev: 60,
  brambory: 150,
  'sladke brambory': 130,
});
