/**
 * START filtr musí soudit metrická data, ne zdrojový text ze Spoonacularu.
 *
 * Změřeno 19. 8. 2026 na účtu info+bm-smoke-a1-glutenfree: z 53 aktivních
 * gluten_free snídaní jich START knihovna propustila JEDINOU. Důvod u 31 z nich
 * byl `imperial_units` — jenže ta jednotka žije jen v poli `original`
 * („1 cup almond milk“), zatímco importér vedle toho uložil `amount: 250,
 * unit: 'ml'` a uživateli se zobrazují právě ta čísla.
 *
 * Dopad byl nerovnoměrný, a proto se dlouho neukázal: restriktivní diety
 * obsluhuje skoro výhradně Spoonacular (české generátory pro ně skoro nic
 * nevyrobily), kdežto profil bez diety jede na vlastních receptech, které
 * `original` nemají vůbec.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ingredientLinesForValidation } from '../recipeSimplicityScore.js';
import { getHardStartBlockReason } from '../startSimpleMealFilter.js';

/** Skutečný řádek katalogu (recept 507, „Úžasné antioxidantové smoothie“). */
const smoothie = {
  id: 507,
  source: 'spoonacular',
  name_cs: 'Antioxidantové smoothie',
  meal_type: 'snidane',
  kcal: 258,
  ingredients: [
    { name: 'mandlové mléko', unit: 'ml', amount: 250, original: '1 cup almond milk' },
    { name: 'směs bobulového ovoce', unit: 'g', amount: 155, original: '1 cup frozen berry blend' },
    { name: 'nízkotučný řecký jogurt', unit: 'g', amount: 113, original: '4 oz plain nonfat greek yogurt' },
  ],
};

test('řádky pro validaci se staví z metrických polí, ne z originálu', () => {
  const radky = ingredientLinesForValidation(smoothie);
  assert.equal(radky.length, 3);
  assert.ok(radky.every((r) => !/cup|oz\b/i.test(r)), `zůstal originál: ${radky.join(' | ')}`);
  assert.match(radky[0], /250 ml/);
});

test('recept s metrickými daty projde, i když má imperiál v originálu', () => {
  assert.equal(getHardStartBlockReason(smoothie, 'snidane'), null,
    'blokovat na jednotce, kterou uživatel nikdy neuvidí, je chyba');
});

test('imperiál ve STRUKTUROVANÝCH datech se blokuje dál', () => {
  // Tohle je ten případ, na který je pravidlo psané: uživatel by měl odměřovat
  // lžíce, protože jiné číslo v receptu není.
  const slzicemi = {
    ...smoothie,
    ingredients: [
      { name: 'mleté lněné semínko', unit: 'Tbsps', amount: 2, original: '2 Tbsp milled flax' },
      { name: 'mandlové mléko', unit: 'cups', amount: 1, original: '1 cup almond milk' },
    ],
  };
  assert.equal(getHardStartBlockReason(slzicemi, 'snidane'), 'imperial_units');
});

test('bez metrických polí se sáhne po originálu — nesmí projít cokoliv', () => {
  const bezMetriky = {
    ...smoothie,
    ingredients: [{ original: '2 cups rolled oats' }, { original: '1 tbsp honey' }],
  };
  const radky = ingredientLinesForValidation(bezMetriky);
  assert.deepEqual(radky, ['2 cups rolled oats', '1 tbsp honey']);
  assert.equal(getHardStartBlockReason(bezMetriky, 'snidane'), 'imperial_units');
});

test('textové suroviny a prázdné vstupy nepadají', () => {
  assert.deepEqual(ingredientLinesForValidation({ ingredients: ['ovesné vločky 60 g'] }), ['ovesné vločky 60 g']);
  assert.deepEqual(ingredientLinesForValidation({}), []);
  assert.deepEqual(ingredientLinesForValidation(null), []);
});

test('vlastní generované recepty filtrem neprocházejí ani teď', () => {
  assert.equal(getHardStartBlockReason({ ...smoothie, source: 'llm_generated' }, 'snidane'), null);
});
