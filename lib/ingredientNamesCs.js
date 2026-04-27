/**
 * České zobrazení názvů surovin ze Spoonacular (API často vrací anglicky).
 * Pouze UI / plán — výživa a ID receptu zůstávají ze zdroje API.
 */

const MAP = {
  eggs: 'vejce',
  egg: 'vejce',
  'large eggs': 'vejce',
  vinegar: 'ocet',
  water: 'voda',
  'coconut oil': 'kokosový olej',
  leek: 'pórek',
  'baby beet greens': 'listy červené řepy',
  'beet greens': 'mangold / listy řepy',
  garlic: 'česnek',
  'garlic cloves': 'stroužky česneku',
  cloves: 'stroužky',
  'juice of lemon': 'citronová šťáva',
  lemon: 'citron',
  'parmesan cheese': 'parmazán',
  parmesan: 'parmazán',
  'greek yogurt': 'řecký jogurt',
  yogurt: 'jogurt',
  'dark chocolate chips': 'čokoládové pecičky',
  'chocolate chips': 'čokoládové pecičky',
  oats: 'oves',
  oatmeal: 'ovesné vločky',
  banana: 'banán',
  spinach: 'špenát',
  tomato: 'rajče',
  tomatoes: 'rajčata',
  onion: 'cibule',
  chicken: 'kuře',
  salmon: 'losos',
  tuna: 'tuňák',
  shrimp: 'krevety',
  rice: 'rýže',
  pasta: 'těstoviny',
  butter: 'máslo',
  milk: 'mléko',
  cream: 'smetana',
  salt: 'sůl',
  pepper: 'pepř',
  oil: 'olej',
  'olive oil': 'olivový olej',
  flour: 'mouka',
  sugar: 'cukr',
  honey: 'med',
  nuts: 'ořechy',
  almonds: 'mandle',
  avocado: 'avokádo',
  bread: 'chléb',
  cheese: 'sýr',
  mozzarella: 'mozzarella',
  basil: 'bazalka',
  parsley: 'petržel',
  cilantro: 'koriandr',
  ginger: 'zázvor',
  cumin: 'kmín',
  paprika: 'paprika',
  broccoli: 'brokolice',
  carrot: 'mrkev',
  carrots: 'mrkev',
  cucumber: 'okurka',
  lettuce: 'salát',
  potato: 'brambory',
  potatoes: 'brambory',
  beef: 'hovězí',
  pork: 'vepřové',
  turkey: 'krůta',
  tofu: 'tofu',
  lentils: 'čočka',
  beans: 'fazole',
  chickpeas: 'cizrna',
  quinoa: 'quinoa',
  apple: 'jablko',
  berries: 'bobule',
  blueberries: 'borůvky',
  strawberries: 'jahody',
};

/**
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function ingredientNameForDisplayCs(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t) return '';
  const key = t.toLowerCase().replace(/\s+/g, ' ');
  if (MAP[key]) return MAP[key];
  const firstWord = key.split(/[\s,;(]/)[0];
  if (firstWord && MAP[firstWord]) {
    const rest = key.slice(firstWord.length).trim();
    return rest ? `${MAP[firstWord]} ${rest}` : MAP[firstWord];
  }
  return t;
}
