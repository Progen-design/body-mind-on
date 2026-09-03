/**
 * TUKOVÝ STROP DO OBJEDNÁVKY GENEROVANÉHO RECEPTU — docs/DALSI_KROK.md 8.8.
 *
 * Recepty za posledních 48 h (37 kusů, 3. 9. 2026): bílkoviny 32 % kalorií
 * (má protein_hint), tuk 45 % (žádný cíl neexistoval). Tenhle test hlídá
 * čistou funkci `omezStropTukuProObjednavku()`, zápis do fronty a to, že se
 * DB DEFAULT ve migraci nerozejde s JS konstantou — stejný vzor jako
 * `frontaSlucovani.test.mjs` hlídá kanonické kalorické pásmo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CIL_PODILU_TUKU,
  VYCHOZI_STROP_TUKU_OBJEDNAVKY,
  MIN_STROP_TUKU_OBJEDNAVKY,
  omezStropTukuProObjednavku,
} from '../plan/fatHint.js';
import {
  objednejRecepty,
  objednejZNevyresenehoSlotu,
  PRIORITA,
} from '../recipeGenerationQueue.js';
import { buildGeneratorInput } from '../recipeGenerator.js';

// ---------------------------------------------------------- čisté funkce

test('bez zadání se vrátí výchozí strop', () => {
  assert.equal(omezStropTukuProObjednavku(null), VYCHOZI_STROP_TUKU_OBJEDNAVKY);
  assert.equal(omezStropTukuProObjednavku(undefined), VYCHOZI_STROP_TUKU_OBJEDNAVKY);
  assert.equal(omezStropTukuProObjednavku(0), VYCHOZI_STROP_TUKU_OBJEDNAVKY);
  assert.equal(omezStropTukuProObjednavku(-0.1), VYCHOZI_STROP_TUKU_OBJEDNAVKY);
  assert.equal(omezStropTukuProObjednavku('nesmysl'), VYCHOZI_STROP_TUKU_OBJEDNAVKY);
});

test('příliš nízký strop (nesplnitelný) se ořízne nahoru na MIN_STROP_TUKU_OBJEDNAVKY', () => {
  assert.equal(omezStropTukuProObjednavku(0.1), MIN_STROP_TUKU_OBJEDNAVKY);
  assert.equal(omezStropTukuProObjednavku(0.05), MIN_STROP_TUKU_OBJEDNAVKY);
});

test('strop nad dolní mezí projde beze změny — na rozdíl od bílkovin se NEOŘEZÁVÁ shora', () => {
  assert.equal(omezStropTukuProObjednavku(0.28), 0.28);
  assert.equal(omezStropTukuProObjednavku(0.5), 0.5, 'horní strop není omezený, jen dolní');
});

test('konstanty dávají smysl v pořadí MIN < VÝCHOZÍ, cíl systému mezi nimi nebo nad', () => {
  assert.ok(MIN_STROP_TUKU_OBJEDNAVKY < VYCHOZI_STROP_TUKU_OBJEDNAVKY);
  assert.ok(CIL_PODILU_TUKU > 0 && CIL_PODILU_TUKU < 1);
});

// -------------------------------------------------------- zápis do fronty

/** Fake klient, který ZACHYTÍ, co se skutečně vložilo do fronty. */
function fakeClientZachycujici() {
  let zachyceno = null;
  const client = {
    from() {
      return {
        insert(radek) {
          zachyceno = radek;
          return this;
        },
        select() { return this; },
        async maybeSingle() { return { data: { id: 1 }, error: null }; },
      };
    },
  };
  return { client, ziskejRadek: () => zachyceno };
}

test('objednejRecepty zapíše výchozí strop, i když ho nikdo nezadal', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejRecepty({
    meal_type: 'obed',
    diet_tags: [],
    kcal_min: 450,
    kcal_max: 680,
    pozadovano: 5,
    priorita: PRIORITA.SEED,
    zdroj: 'seed',
  }, client);
  assert.equal(ziskejRadek().fat_hint, VYCHOZI_STROP_TUKU_OBJEDNAVKY);
});

test('objednejZNevyresenehoSlotu taky dostane tukový strop — je to systémová vlastnost, ne jen díra', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejZNevyresenehoSlotu({
    mealType: 'svacina',
    dietTags: [],
    slotTargetKcal: 270,
    minPodilBilkovin: null,
  }, client);
  assert.equal(ziskejRadek().fat_hint, VYCHOZI_STROP_TUKU_OBJEDNAVKY);
});

test('vlastní strop se ořízne stejně jako výchozí', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejRecepty({
    meal_type: 'obed',
    diet_tags: [],
    kcal_min: 450,
    kcal_max: 680,
    pozadovano: 5,
    priorita: PRIORITA.SEED,
    zdroj: 'seed',
    max_podil_tuku: 0.05,
  }, client);
  assert.equal(ziskejRadek().fat_hint, MIN_STROP_TUKU_OBJEDNAVKY);
});

// --------------------------------------------------------------- do promptu

test('buildGeneratorInput pošle strop v procentech i v gramech na 100 kcal', () => {
  const polozka = { meal_type: 'obed', diet_tags: [], kcal_min: 450, kcal_max: 680 };
  const vstup = buildGeneratorInput(
    polozka, ['kuřecí prsa'], [], 5, [], null, null, [], 0.30,
  );
  assert.equal(vstup.max_podil_tuku_pct, 30);
  // 0,30 podílu = 30 kcal z tuku na 100 kcal = 30/9 g tuku
  assert.ok(Math.abs(vstup.max_tuku_g_na_100_kcal - 3.3) < 0.05);
});

test('buildGeneratorInput bez stropu pole vůbec nepřidá', () => {
  const polozka = { meal_type: 'obed', diet_tags: [], kcal_min: 450, kcal_max: 680 };
  const vstup = buildGeneratorInput(polozka, ['kuřecí prsa'], [], 5);
  assert.equal('max_podil_tuku_pct' in vstup, false);
  assert.equal('max_tuku_g_na_100_kcal' in vstup, false);
});

// ---------------------------------------------------- SQL a JS se nerozejdou

const MIGRACE = 'supabase/migrations/20260903150000_recipe_generation_queue_fat_hint.sql';
const sql = fs.readFileSync(MIGRACE, 'utf8');

test('DB DEFAULT sloupce fat_hint sedí s VYCHOZI_STROP_TUKU_OBJEDNAVKY', () => {
  // Číselné porovnání, ne shoda řetězce — SQL píše "0.30", JS "0.3" je totéž
  // číslo, ale jiný text.
  const shoda = sql.match(/fat_hint numeric default ([\d.]+)/);
  assert.ok(shoda, 'DEFAULT pro fat_hint v migraci nenalezen');
  assert.equal(
    Number(shoda[1]),
    VYCHOZI_STROP_TUKU_OBJEDNAVKY,
    'DEFAULT ve sloupci se musí shodovat s JS konstantou, jinak SQL cesta '
    + '(fill_recipe_queue_from_demand) dá jinou hodnotu než objednejRecepty()',
  );
});

test('CHECK na fat_hint drží rozsah (0, 1]', () => {
  assert.match(sql, /fat_hint > 0 and fat_hint <= 1/);
});
