/**
 * Deduplikace generovaných receptů a zábrana proti duplicitní objednávce.
 *
 * Dedup je jediná obrana proti tomu, aby generátor katalog zaplnil variacemi
 * téhož jídla. Název sám nestačí — „Čočkové kari s rýží“ a „Kari z červené
 * čočky s rýží“ jsou různé řetězce a totéž jídlo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRecipeName,
  ingredientJaccard,
  isDuplicateRecipe,
  surovinyMimoSeznam,
  DEDUP_JACCARD_THRESHOLD,
} from '../recipeGenerator.js';
import { objednejRecepty, PRIORITA } from '../recipeGenerationQueue.js';

test('normalizeRecipeName sundá diakritiku, velikost i interpunkci', () => {
  assert.equal(normalizeRecipeName('Čočkové KARI, ostré!'), 'cockove kari ostre');
  assert.equal(normalizeRecipeName('  Míchaná   vejce  '), 'michana vejce');
  assert.equal(normalizeRecipeName('Řízek (kuřecí)'), 'rizek kureci');
  assert.equal(normalizeRecipeName(null), '');
});

test('normalizeRecipeName srovná zápisy téhož názvu', () => {
  assert.equal(normalizeRecipeName('Tofu se zeleninou'), normalizeRecipeName('TOFU SE ZELENINOU'));
  assert.equal(normalizeRecipeName('Čočka na kyselo'), normalizeRecipeName('cocka na kyselo'));
});

test('ingredientJaccard počítá průnik ku sjednocení', () => {
  assert.equal(ingredientJaccard(['a', 'b'], ['a', 'b']), 1);
  assert.equal(ingredientJaccard(['a', 'b'], ['c', 'd']), 0);
  // {a,b,c} ∩ {a,b,d} = 2, sjednocení 4 → 0,5
  assert.equal(ingredientJaccard(['a', 'b', 'c'], ['a', 'b', 'd']), 0.5);
  assert.equal(ingredientJaccard([], []), 0);
});

test('ingredientJaccard ignoruje diakritiku a velikost', () => {
  assert.equal(ingredientJaccard(['Čočka', 'Rýže'], ['cocka', 'ryze']), 1);
});

test('isDuplicateRecipe chytí shodný název bez ohledu na zápis', () => {
  const existujici = [{ name_cs: 'Tofu se zeleninou', ingredients: [{ name: 'tofu' }] }];
  const v = isDuplicateRecipe(
    { name_cs: 'TOFU se Zeleninou', ingredients: [{ name: 'quinoa' }] },
    existujici,
  );
  assert.equal(v.duplicita, true);
  assert.equal(v.duvod, 'shodny_nazev');
});

test('isDuplicateRecipe chytí jiný název, ale tytéž suroviny', () => {
  const existujici = [{
    name_cs: 'Čočkové kari s rýží',
    ingredients: [{ name: 'čočka' }, { name: 'rýže' }, { name: 'kokosové mléko' }, { name: 'kari koření' }],
  }];
  const novy = {
    name_cs: 'Kari z červené čočky s rýží',
    ingredients: [{ name: 'čočka' }, { name: 'rýže' }, { name: 'kokosové mléko' }, { name: 'kari koření' }],
  };
  const v = isDuplicateRecipe(novy, existujici);
  assert.equal(v.duplicita, true);
  assert.equal(v.duvod, 'prunik_surovin');
  assert.ok(v.skore >= DEDUP_JACCARD_THRESHOLD);
});

test('isDuplicateRecipe pustí recept pod prahem', () => {
  const existujici = [{
    name_cs: 'Čočkové kari',
    ingredients: [{ name: 'čočka' }, { name: 'rýže' }, { name: 'kokosové mléko' }],
  }];
  // Průnik {čočka} = 1, sjednocení 5 → 0,2
  const novy = {
    name_cs: 'Čočkový salát s rajčaty',
    ingredients: [{ name: 'čočka' }, { name: 'rajče' }, { name: 'okurka' }],
  };
  assert.equal(isDuplicateRecipe(novy, existujici).duplicita, false);
});

test('isDuplicateRecipe na prázdném katalogu nic nezahodí', () => {
  assert.equal(isDuplicateRecipe({ name_cs: 'Cokoli', ingredients: [] }, []).duplicita, false);
});

test('surovinyMimoSeznam najde, co není ve slovní zásobě', () => {
  const povolene = new Set(['tofu', 'ryze', 'cocka'].map(normalizeRecipeName));
  const mimo = surovinyMimoSeznam(
    { ingredients: [{ name: 'Tofu' }, { name: 'cizrna' }, { name: 'Rýže' }] },
    povolene,
  );
  assert.deepEqual(mimo, ['cizrna']);
});

test('fronta odmítne duplicitní otevřenou specifikaci', async () => {
  // Klient jen předstírá odpověď Postgresu; testuje se, že unique violation
  // NENÍ chyba, ale normální výsledek — na tom stojí celý signál 'demand'.
  const spec = {
    meal_type: 'vecere', diet_tags: ['vegan'], kcal_min: 450, kcal_max: 700,
    pozadovano: 6, priorita: PRIORITA.SLOT_NEVYRESEN, zdroj: 'demand',
  };

  const prvni = fakeClient({ data: { id: 1 }, error: null });
  const a = await objednejRecepty(spec, prvni);
  assert.deepEqual(a, { created: true, duplicate: false, id: 1 });

  const druhy = fakeClient({
    data: null,
    error: { message: 'duplicate key value violates unique constraint "recipe_gen_queue_unikat"' },
  });
  const b = await objednejRecepty(spec, druhy);
  assert.equal(b.created, false);
  assert.equal(b.duplicate, true);
  assert.equal(b.error, undefined, 'duplicita se nesmí hlásit jako chyba');
});

test('fronta hlásí skutečnou chybu jako chybu', async () => {
  const client = fakeClient({ data: null, error: { message: 'connection refused' } });
  const v = await objednejRecepty({
    meal_type: 'obed', kcal_min: 400, kcal_max: 700,
    pozadovano: 2, priorita: 20, zdroj: 'seed',
  }, client);
  assert.equal(v.created, false);
  assert.equal(v.duplicate, false);
  assert.match(v.error, /connection refused/);
});

/** Minimální náhrada supabase klienta pro řetěz .from().insert().select().maybeSingle() */
function fakeClient(odpoved) {
  return {
    from() {
      const api = {
        insert() { return api; },
        select() { return api; },
        async maybeSingle() { return odpoved; },
      };
      return api;
    },
  };
}
