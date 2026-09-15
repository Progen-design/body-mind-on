/**
 * ZAMĚNĚNÉ JÍDLO MUSÍ MÍT POSTUP PŘÍPRAVY — produkční nález, 15. 9. 2026.
 *
 * PROČ TENHLE TEST EXISTUJE. Po opravě PR #233 začala záměna jídla konečně
 * vracet jiné jídlo — a tím se odkryla druhá vada, kterou předtím nebylo vidět:
 * v modalu zaměněného jídla zmizela celá sekce „Postup přípravy krok za krokem".
 * Původní snídaně měla šest kroků, nová jen makra a suroviny.
 *
 * Příčinou byl typový nesoulad, ne chybějící data:
 *   - generátor plánu zapisuje `recipe.instructions_cs` jako POLE
 *     (lib/profile/postupyDoPlanu.js: `jidlo.recipe.instructions_cs = postup.kroky`),
 *   - `buildSimpleStartLibraryMeal()` ho zapisovalo jako `\n`-spojený ŘETĚZEC,
 *   - `pouzitelneKroky()` bere jen pole, takže na řetězci vrátila `[]`,
 *   - `naRecept()` (src/data/adaptery.ts) na prázdné pole vrací `undefined`
 *     a modal sekci vůbec nevykreslí.
 *
 * Nic nespadlo, nic se nezalogovalo. Naměřeno na týdenním plánu: 34 jídel mělo
 * pole (vykreslila se), 1 řetězec — právě to zaměněné.
 *
 * OPRAVA JE U PRODUCENTA, NE U ČTEČKY. `pouzitelneKroky()` schválně bere jen
 * pole: zrcadlí SQL predikát aktivační brány (viz lib/__tests__/aktivacniBrana.test.mjs,
 * „Drzi se tu, aby se zmena v JS neprovedla bez zmeny SQL") a `pouzitelneKroky('text')`
 * tam musí zůstat prázdné. Tolerance k řetězci by rozešla JS a SQL. Správně se
 * proto srovnal zápis.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pouzitelneKroky } from '../profile/postupReceptu.js';
import { buildSimpleStartLibraryMeal, SIMPLE_START_RECIPES } from '../simpleStartRecipeLibrary.js';

test('buildSimpleStartLibraryMeal zapisuje recipe.instructions_cs jako POLE', () => {
  const recept = SIMPLE_START_RECIPES[0];
  const jidlo = buildSimpleStartLibraryMeal(recept.title, recept.meal_type);
  assert.ok(jidlo, 'knihovní jídlo se musí postavit');
  assert.ok(
    Array.isArray(jidlo.recipe.instructions_cs),
    'instructions_cs musí být pole — stejnou podobu zapisuje generátor plánu'
  );
  assert.deepEqual(jidlo.recipe.instructions_cs, recept.instructions);
});

test('recipe.instructions zůstává řetězcem — tuhle podobu má sloupec v katalogu', () => {
  const recept = SIMPLE_START_RECIPES[0];
  const jidlo = buildSimpleStartLibraryMeal(recept.title, recept.meal_type);
  assert.equal(typeof jidlo.recipe.instructions, 'string');
  assert.equal(jidlo.recipe.instructions, recept.instructions.join('\n'));
});

test('simple_instructions_cs zůstává polem a odpovídá receptu', () => {
  const recept = SIMPLE_START_RECIPES[0];
  const jidlo = buildSimpleStartLibraryMeal(recept.title, recept.meal_type);
  assert.deepEqual(jidlo.simple_instructions_cs, recept.instructions);
});

test('KAŽDÉ jídlo z knihovny má v modalu co zobrazit — to je ta vlastnost, na které záleží', () => {
  const bezPostupu = [];
  for (const recept of SIMPLE_START_RECIPES) {
    const jidlo = buildSimpleStartLibraryMeal(recept.title, recept.meal_type);
    if (!jidlo) { bezPostupu.push(`${recept.title} (nepostavilo se)`); continue; }
    // Přesně to, co dělá naRecept() v src/data/adaptery.ts.
    if (pouzitelneKroky(jidlo.recipe?.instructions_cs).length === 0) bezPostupu.push(recept.title);
  }
  assert.deepEqual(bezPostupu, [], `jídla, kterým by v modalu chyběl postup: ${bezPostupu.join(', ')}`);
});

test('postup přežije cestu přes JSON — tak se plán ukládá do structured_plan_json', () => {
  const recept = SIMPLE_START_RECIPES[0];
  const jidlo = JSON.parse(JSON.stringify(buildSimpleStartLibraryMeal(recept.title, recept.meal_type)));
  assert.ok(Array.isArray(jidlo.recipe.instructions_cs), 'po serializaci to musí být pořád pole');
  assert.ok(pouzitelneKroky(jidlo.recipe.instructions_cs).length >= 3);
});

test('pouzitelneKroky zůstává jen na pole — zrcadlí SQL predikát aktivační brány', () => {
  // Kdyby tohle někdy začalo procházet, musí se současně změnit i SQL.
  assert.deepEqual(pouzitelneKroky('Krok jedna.\nKrok dva.'), [], 'řetězec není postup');
  assert.deepEqual(pouzitelneKroky(['Krok jedna.', 'Krok dva.']), ['Krok jedna.', 'Krok dva.']);
});
