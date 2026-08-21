/**
 * MODAL RECEPTU NESMÍ LHÁT.
 *
 * Nahlášeno 20. 8. 2026: katalogový recept 866 „Rychlá avokádová pomazánka“
 * (avokádo, celozrnný toast, citron) se v aplikaci zobrazil jako tvaroh,
 * ovesné vločky a banán. Plán i katalog přitom měly správná data.
 *
 * Lhalo dosazení náhrady: recept neprošel heuristikou jednoduchosti
 * (`inconsistent:low_simplicity_score`), načež mu `createMealDisplayModel`
 * podstrčil suroviny z generické snídaňové šablony — a nechal mu vlastní název.
 * Uživatel tak dostal skutečné jméno jídla s cizím obsahem, což je horší než
 * nezobrazit nic.
 *
 * Druhá polovina: postup se četl jen pod podmínkou `!isFallback` a přes
 * `asString`, který nad JSONB polem vrací prázdno. Všech 337 vlastních receptů
 * proto vypadalo jako recepty bez postupu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMealDisplayModel } from '../mealDisplayModel.js';

/** Katalogový řádek 866 tak, jak ho vidí `catalogRowToRecipeHtml`. */
const avokadovaPomazanka = {
  type: 'breakfast',
  name_cs: 'Rychlá avokádová pomazánka',
  display_name_cs: 'Rychlá avokádová pomazánka',
  catalog_id: 866,
  catalog_source: 'llm_generated',
  recipe_verified: true,
  shopping_ingredient_lines: [
    '150 g avokádo', '80 g celozrnný toast', '10 g citronová šťáva', '2 g sůl', '2 g pepř',
  ],
  recipe: {
    id: 866,
    title_cs: 'Rychlá avokádová pomazánka',
    source: 'catalog',
    calories: 445,
    instructions_cs: [
      'Avokádo rozmačkej vidličkou v míse.',
      'Přidej citronovou šťávu, sůl a pepř a dobře promíchej.',
      'Namaž pomazánku na celozrnný toast a podávej.',
    ],
  },
  kcal: 445,
};

test('suroviny receptu se nesmí nahradit šablonou', () => {
  const model = createMealDisplayModel(avokadovaPomazanka, '');
  const vse = model.ingredients.join(' | ').toLowerCase();
  assert.match(vse, /avokádo/, `chybí avokádo: ${vse}`);
  assert.doesNotMatch(vse, /tvaroh|vločk|banán/, `podstrčená šablona: ${vse}`);
  assert.equal(model.ingredients.length, 5);
});

test('platí to i když recept neprojde heuristikou jednoduchosti', () => {
  const model = createMealDisplayModel(avokadovaPomazanka, '');
  // Recept fallbackem projít SMÍ — to je jen značka kvality. Nesmí ale kvůli
  // tomu přijít o vlastní obsah.
  assert.ok(model.consistencyStatus.startsWith('inconsistent:') || model.isFallback,
    'fixture má reprezentovat právě ten problematický případ');
  assert.match(model.ingredients.join(' ').toLowerCase(), /avokádo/);
});

test('skutečný postup vyhraje nad generickým návodem', () => {
  const model = createMealDisplayModel(avokadovaPomazanka, '');
  assert.equal(model.instructions.length, 3);
  assert.match(model.instructions[0], /Avokádo rozmačkej/);
  assert.doesNotMatch(model.instructions.join(' '), /Připrav suroviny podle seznamu/);
});

test('postup uložený jako JSONB pole se nezahodí', () => {
  // `asString` nad polem vrací prázdno — proto se dřív i mimo fallback
  // sáhlo po generickém návodu.
  const model = createMealDisplayModel({
    ...avokadovaPomazanka,
    recipe: { ...avokadovaPomazanka.recipe, instructions_cs: null, instructions: ['Krok jedna.', 'Krok dva.'] },
  }, '');
  assert.deepEqual(model.instructions, ['Krok jedna.', 'Krok dva.']);
});

test('recept bez surovin i postupu obecnou náhradu dostat SMÍ', () => {
  // Tam je šablona k užitku — prázdná karta by uživateli nepomohla.
  const model = createMealDisplayModel({
    type: 'breakfast',
    name_cs: 'Ovesná kaše',
    display_name_cs: 'Ovesná kaše',
    catalog_source: 'simple_start_fallback',
    kcal: 400,
  }, '');
  assert.ok(model.ingredients.length > 0, 'bez surovin má nastoupit šablona');
  assert.ok(model.instructions.length > 0);
});

test('název jídla zůstává vždycky název jídla', () => {
  const model = createMealDisplayModel(avokadovaPomazanka, '');
  assert.equal(model.title, 'Rychlá avokádová pomazánka');
});
