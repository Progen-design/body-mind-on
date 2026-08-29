/**
 * DAIRY_TERMS — regresní test k blockeru ze 14. 8. 2026.
 *
 * PROČ EXISTUJE. `lib/dietaryRules.js` řeší dietu `lactose_free` výhradně přes
 * `mealContainsExcludedFood()`, takže co v `DAIRY_TERMS` chybí, propluje
 * publikační bránou. Na produkci takhle prošla feta (v seznamu nebyla) a
 * parmezán (v seznamu byl PŘEKLEP `parmazan`, česky se píše „parmezán“).
 * Pět aktivních plánů `lactose_free` účtů mělo mléčný sýr a jeden odešel
 * e-mailem.
 *
 * Test hlídá tři věci a všechny tři jsou tou chybou doložené:
 *   1. Seznam chytí sýry, které chytat má — včetně skloňovaných tvarů.
 *   2. Chytí je v NÁZVU jídla i v ŘÁDCÍCH SUROVIN (produkční nález byl v obou).
 *   3. Nechytí rostlinné náhrady — jinak se blocker „opraví“ tím, že se
 *      bezlaktózovému uživateli zablokuje i kokosové mléko.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDietaryExclusions,
  textContainsExcludedFood,
  mealContainsExcludedFood,
} from '../dietaryExclusions.js';

const lactoseFree = parseDietaryExclusions({ diet_type: 'lactose_free' });

/** Musí být zablokované. Klíč je zdůvodnění, ať je v selhání vidět proč. */
const MLECNE = [
  ['feta', 'chyběla úplně — nález v produkčním plánu 14. 8. 2026'],
  ['fetou', 'skloňovaný tvar z názvu „Kuskus s pečenou zeleninou a fetou“'],
  ['parmezán', 'správné české psaní — právě tohle překlep `parmazan` míjel'],
  ['parmazán', 'doložený překlep, chytat se musí taky'],
  ['parmezánem', 'skloňovaný tvar'],
  ['cheddar', 'chyběl úplně'],
  ['gorgonzola', 'doplněno 14. 8. 2026'],
  ['brie', 'doplněno 14. 8. 2026'],
  ['camembert', 'doplněno 14. 8. 2026'],
  ['hermelín', 'doplněno 14. 8. 2026'],
  ['niva', 'doplněno 14. 8. 2026'],
  ['balkánský sýr', 'doplněno 14. 8. 2026'],
  ['sýr', 'původní seznam'],
  ['sýrem', 'skloňovaný tvar'],
  ['mléko', 'původní seznam'],
  ['jogurt', 'původní seznam'],
  ['tvaroh', 'původní seznam'],
  ['smetana', 'původní seznam'],
  ['mozzarella', 'původní seznam'],
  ['máslo', 'nález z 29. 8., recept Pečené krevety s česnekovým máslem'],
  ['máslem', 'nález z 29. 8., recept Pečené krevety s česnekovým máslem'],
  ['másla', 'nález z 29. 8., recept Pečené krevety s česnekovým máslem'],
  ['přepuštěné máslo', 'nález z 29. 8., recept Pečené krevety s česnekovým máslem'],
  ['ghí', 'nález z 29. 8., recept Pečené krevety s česnekovým máslem'],
];

/** Nesmí být zablokované — rostlinné náhrady jsou bezlaktózové. */
const ROSTLINNE = [
  'mandlové mléko',
  'kokosové mléko',
  'sójové mléko',
  'ovesné mléko',
  'rýžové mléko',
  'kokosová smetana',
  'sójový jogurt',
  'mandlové máslo',
  'arašídové máslo',
  'kokosové máslo',
  'kakaové máslo',
  'veganský sýr',
  'coconut milk',
  'almond milk',
  'oat milk',
  'peanut butter',
];

test('DAIRY_TERMS chytí fetu i parmezán v obou psaních', () => {
  for (const [text, proc] of MLECNE) {
    assert.equal(
      textContainsExcludedFood(text, lactoseFree),
      true,
      `„${text}“ musí být pro lactose_free zablokované (${proc})`
    );
  }
});

test('rostlinné náhrady zůstávají povolené', () => {
  for (const text of ROSTLINNE) {
    assert.equal(
      textContainsExcludedFood(text, lactoseFree),
      false,
      `„${text}“ je rostlinné a blokovat se nesmí`
    );
  }
});

test('sýr se najde v názvu jídla i v řádcích surovin', () => {
  // Přesně to jídlo z produkčního plánu a64efee5 (14. 8. 2026).
  const vNazvu = {
    display_name_cs: 'Kuskus s pečenou zeleninou a fetou',
    shopping_ingredient_lines: ['kuskus', 'cuketa', 'olivový olej'],
  };
  const vSurovinach = {
    display_name_cs: 'Těstoviny s dýňovým krémem a špenátem',
    shopping_ingredient_lines: ['těstoviny', 'dýně', 'špenát', 'parmezán'],
  };
  const vReceptu = {
    display_name_cs: 'Salát',
    recipe: { ingredients: [{ name: 'feta', amount: 40, unit: 'g' }] },
  };

  assert.equal(mealContainsExcludedFood(vNazvu, lactoseFree), true, 'feta v názvu');
  assert.equal(mealContainsExcludedFood(vSurovinach, lactoseFree), true, 'parmezán v surovinách');
  assert.equal(mealContainsExcludedFood(vReceptu, lactoseFree), true, 'feta v recipe.ingredients');
});

test('máslo se najde v názvu jídla i v řádku suroviny — nález 29. 8. 2026', () => {
  // Přesně to jídlo z produkčního plánu 29. 8. 2026: zbytek receptu byl čistý,
  // propadlo jen „máslo“ v názvu i v ingredienci zároveň.
  const krevety = {
    display_name_cs: 'Pečené krevety s česnekovým máslem a špenátem',
    shopping_ingredient_lines: ['krevety 200 g', 'máslo 20 g', 'česnek 5 g', 'špenát 100 g'],
  };
  assert.equal(mealContainsExcludedFood(krevety, lactoseFree), true, 'máslo v názvu i v surovině');

  const rostlinneMaslo = {
    display_name_cs: 'Toast s arašídovým máslem',
    shopping_ingredient_lines: ['celozrnný toast', 'arašídové máslo 20 g', 'banán'],
  };
  assert.equal(mealContainsExcludedFood(rostlinneMaslo, lactoseFree), false, 'arašídové máslo je rostlinné');
});

test('jídlo bez mléčného zůstane povolené', () => {
  const cisté = {
    display_name_cs: 'Kuře s rýží a zeleninou',
    shopping_ingredient_lines: ['kuřecí prsa', 'rýže', 'brokolice', 'olivový olej'],
  };
  const rostlinné = {
    display_name_cs: 'Ovesná kaše na kokosovém mléce',
    shopping_ingredient_lines: ['ovesné vločky', 'kokosové mléko', 'banán'],
  };
  assert.equal(mealContainsExcludedFood(cisté, lactoseFree), false);
  assert.equal(mealContainsExcludedFood(rostlinné, lactoseFree), false);
});

test('vlastní výčet uživatele přebije rostlinnou výjimku', () => {
  // Kdo si sám napíše „kokosové mléko“, ten ho nechce — dietní pravidlo
  // ho nesmí odmaskovat zpátky.
  const vlastni = parseDietaryExclusions({ foods_to_avoid: 'kokosové mléko' });
  assert.equal(textContainsExcludedFood('kokosové mléko', vlastni), true);
});

test('hranice slova drží — mléčný podřetězec uvnitř slova neblokuje', () => {
  // `syr` nesmí chytit „syrovátka“? Chytit SMÍ (je mléčná), ale nesmí chytit
  // slovo, kde je výraz uvnitř. `niva` je nejcitlivější — je krátká.
  assert.equal(textContainsExcludedFood('univerzální koření', lactoseFree), false);
  assert.equal(textContainsExcludedFood('cottage cheese', lactoseFree), true);
});
