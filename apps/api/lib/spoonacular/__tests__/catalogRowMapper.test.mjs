/**
 * mapSpoonacularRecipeToCatalogRow proti skutečnému payloadu ze spoonacular_raw_cache.
 *
 * Proč to existuje: importGate.integration.test.mjs jede přes evaluateImportGate, který
 * mapper nevolá. Mapper tak neměl žádné pokrytí a 43 běhů v něm žil ReferenceError
 * (`nutrientAmount is not defined`) — chybějící import se schoval za `export … from`,
 * který lokální vazbu nevytváří. Každý recept, co prošel filtry, spadl a započítal se
 * jako `map_error`, tedy jako by ho odmítlo produktové pravidlo.
 *
 * Test proto načítá REÁLNÝ catalogImport.js včetně jeho importů. Kopie mapperu
 * v izolovaném modulu by tuhle třídu chyb minula.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));

register('./helpers/resolveExtensionless.mjs', pathToFileURL(`${__dirname}/`));

const { mapSpoonacularRecipeToCatalogRow } = await import('../catalogImport.js');

const payload = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'raw-payload-646515.json'), 'utf8'),
);

test('mapper vrátí řádek katalogu ze skutečného payloadu', () => {
  const row = mapSpoonacularRecipeToCatalogRow(payload, 'snidane');

  assert.ok(row && typeof row === 'object', 'mapper musí vrátit objekt');
  assert.equal(row.source, 'spoonacular');
  assert.equal(row.source_id, '646515');
  assert.equal(row.name_en, 'Healthy Southwestern Oatmeal');
  assert.equal(row.meal_type, 'snidane');
  assert.equal(row.active, false, 'nový import se nikdy neaktivuje sám');

  // Nutrice se čte přes nutrientAmount — právě tady padal ReferenceError.
  assert.equal(row.kcal, 440, 'kcal zaokrouhlené z 440.15');
  assert.equal(row.protein_g, 26.45);
  assert.equal(row.carbs_g, 31.61);
  assert.equal(row.fat_g, 23.33);

  assert.equal(row.ready_in_minutes, 15, 'readyInMinutes se persistuje');
  assert.equal(row.servings, 1, 'katalog drží vše na jedné porci');
  assert.ok(Array.isArray(row.ingredients) && row.ingredients.length === 6);
  assert.ok(row.diet_tags.includes('gluten_free'), 'diet_tags v podtržítkovém formátu');
});

test('mapper odmítne recept bez nutrice', () => {
  const bezNutrice = { ...payload, nutrition: { nutrients: [] }, calories: undefined };
  assert.throws(() => mapSpoonacularRecipeToCatalogRow(bezNutrice, 'snidane'), /kcal/i);
});

test('mapper odmítne recept bez id', () => {
  const bezId = { ...payload, id: null };
  assert.throws(() => mapSpoonacularRecipeToCatalogRow(bezId, 'snidane'), /id/i);
});
