/**
 * Slouceni fronty — test, ktery to opravdu SPUSTI.
 *
 * PROC. Jednorazovy blok v migraci 20260825120000 maze a prepisuje otevrene
 * polozky fronty. Presne takovy blok shodil 24. 8. migraci 20260824120000
 * (netypovany literal v `||`), a regex nad SQL to chytit nemohl.
 *
 * Blok v migraci se lokalne prohnal frontou, kterou tam nasazely seedy —
 * roztristenou podobu z produkce nikdy nevidel. Tenhle test si ji proto
 * vyrobi sam a pusti nad ni TYZ kod, vzaty doslova z migrace.
 *
 * Kazdy test si frontu uklidi uvnitr savepointu, protoze lokalni databaze
 * seed polozky obsahuje a cizi radky by vysledek zkreslily.
 *
 * Spousteni je stejne jako u odvozeneTagy.db.test.mjs — `npm run test:db`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';

const DB_URL = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const MIGRACE = 'supabase/migrations/20260825120000_fronta_slucuje_poptavku.sql';

/**
 * Sloucovaci blok DOSLOVA z migrace.
 *
 * Opsat ho by znamenalo overovat vlastni kopii — ta chyba, kvuli ktere
 * db testy vznikly.
 */
function slouceniZMigrace() {
  const sql = fs.readFileSync(MIGRACE, 'utf8');
  const zacatek = sql.indexOf('DO $$', sql.indexOf('sloučení stávající fronty'));
  assert.ok(zacatek > 0, 'sloucovaci blok se v migraci nenasel');
  const konec = sql.indexOf('END $$;', zacatek);
  assert.ok(konec > zacatek, 'konec sloucovaciho bloku se nenasel');
  return sql.slice(zacatek, konec + 'END $$;'.length);
}

let client;

test.before(async () => {
  client = new pg.Client({ connectionString: DB_URL });
  try {
    await client.connect();
  } catch (chyba) {
    throw new Error(
      `Nepodarilo se pripojit k ${DB_URL}.\n`
      + 'Postup je v hlavicce lib/__tests__/db/odvozeneTagy.db.test.mjs.\n'
      + `Puvodni chyba: ${chyba.message}`,
    );
  }
  await client.query('begin');
});

test.after(async () => {
  if (!client) return;
  await client.query('rollback');
  await client.end();
});

// ------------------------------------------------------- kanonicke pasmo

test('kanonicke pasmo zna ctyri chody a nic si nevymysli', async () => {
  const ocekavane = {
    snidane: [300, 520],
    obed: [450, 680],
    vecere: [300, 650],
    svacina: [170, 370],
  };

  for (const [chod, [min, max]] of Object.entries(ocekavane)) {
    const { rows } = await client.query('select * from public.kanonicke_pasmo_slotu($1)', [chod]);
    assert.equal(rows.length, 1, `${chod}: pasmo chybi`);
    assert.equal(rows[0].kcal_min, min, `${chod}: spodni hranice`);
    assert.equal(rows[0].kcal_max, max, `${chod}: horni hranice`);
  }

  const neznamy = await client.query('select * from public.kanonicke_pasmo_slotu($1)', ['brunch']);
  assert.equal(neznamy.rows.length, 0, 'neznamy chod dostal vymyslene pasmo');
});

// ------------------------------------------------------------- slouceni

test('roztristena fronta se slouci na jednu polozku na kombinaci', async () => {
  await client.query('savepoint s');
  try {
    // Lokalni fronta neni prazdna — migrace do ni sazeji seed polozky.
    // Test si scenu uklidi, rollback ji vrati.
    await client.query("delete from public.recipe_generation_queue where stav = 'pending'");

    // Peti polozek na tentyz slot+dietu, lisi se JEN pasmem — presne ten tvar,
    // ktery na produkci nadelal ze 17 kombinaci sto polozek.
    await client.query(
      `insert into public.recipe_generation_queue
         (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, priorita, zdroj, stav)
       values
         ('snidane', '{gluten_free}',  50, 2500, 29, 10, 'demand', 'pending'),
         ('snidane', '{gluten_free}', 400,  750,  8, 20, 'demand', 'pending'),
         ('snidane', '{gluten_free}', 912, 1200,  4, 30, 'seed',   'pending'),
         ('obed',    '{}',            450, 1200, 48, 10, 'demand', 'pending'),
         ('obed',    '{}',            800, 1200,  3, 50, 'seed',   'pending')`,
    );

    await client.query(slouceniZMigrace());

    const { rows } = await client.query(
      `select meal_type, diet_tags, kcal_min, kcal_max, pozadovano, vyrobeno
         from public.recipe_generation_queue where stav = 'pending'
        order by meal_type`,
    );

    assert.equal(rows.length, 2, `ze peti polozek maji zbyt dve, zbylo ${rows.length}`);

    const obed = rows.find((r) => r.meal_type === 'obed');
    const snidane = rows.find((r) => r.meal_type === 'snidane');

    assert.deepEqual([snidane.kcal_min, snidane.kcal_max], [300, 520], 'snidane nema kanonicke pasmo');
    assert.deepEqual([obed.kcal_min, obed.kcal_max], [450, 680], 'obed nema kanonicke pasmo');

    // 29+8+4 = 41 a 48+3 = 51, oboji se zastropuje na 7.
    assert.equal(snidane.pozadovano, 7, 'snidane neni zastropovana');
    assert.equal(obed.pozadovano, 7, 'obed neni zastropovan');
    assert.equal(snidane.vyrobeno, 0, 'sloucena polozka se tvari zcasti hotova');
  } finally {
    await client.query('rollback to savepoint s');
  }
});

test('slouceni nesahne na hotove ani neuspesne polozky', async () => {
  await client.query('savepoint s');
  try {
    // Lokalni fronta neni prazdna — migrace do ni sazeji seed polozky.
    // Test si scenu uklidi, rollback ji vrati.
    await client.query("delete from public.recipe_generation_queue where stav = 'pending'");

    await client.query(
      `insert into public.recipe_generation_queue
         (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, vyrobeno, priorita, zdroj, stav)
       values
         ('vecere', '{}', 999, 1500, 40, 40, 10, 'demand', 'done'),
         ('vecere', '{}', 111, 1400, 30,  2, 10, 'demand', 'failed')`,
    );

    await client.query(slouceniZMigrace());

    const { rows } = await client.query(
      `select stav, kcal_min, kcal_max, pozadovano from public.recipe_generation_queue
        where stav in ('done','failed') and kcal_max in (1500, 1400) order by stav`,
    );
    assert.equal(rows.length, 2, 'slouceni smazalo uzavrene polozky');
    assert.equal(rows[0].pozadovano, 40, 'slouceni prepsalo hotovou polozku');
    assert.equal(rows[1].kcal_min, 111, 'slouceni prepsalo neuspesnou polozku');
  } finally {
    await client.query('rollback to savepoint s');
  }
});

test('rozlisne diety se neslucuji dohromady', async () => {
  await client.query('savepoint s');
  try {
    // Lokalni fronta neni prazdna — migrace do ni sazeji seed polozky.
    // Test si scenu uklidi, rollback ji vrati.
    await client.query("delete from public.recipe_generation_queue where stav = 'pending'");

    await client.query(
      `insert into public.recipe_generation_queue
         (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, priorita, zdroj, stav)
       values
         ('svacina', '{}',          100, 900, 9, 10, 'demand', 'pending'),
         ('svacina', '{low_carb}',  150, 800, 9, 10, 'demand', 'pending'),
         ('svacina', '{vegetarian}',150, 700, 9, 10, 'demand', 'pending')`,
    );

    await client.query(slouceniZMigrace());

    const { rows } = await client.query(
      `select count(*)::int as n from public.recipe_generation_queue
        where stav='pending' and meal_type='svacina'`,
    );
    assert.equal(rows[0].n, 3, 'slouceni spojilo ruzne diety');
  } finally {
    await client.query('rollback to savepoint s');
  }
});

// --------------------------------------------------------------- plnic

test('plnic nezalozi druhou objednavku na tutez (slot, dieta)', async () => {
  await client.query('savepoint s');
  try {
    // Lokalni fronta neni prazdna — migrace do ni sazeji seed polozky.
    // Test si scenu uklidi, rollback ji vrati.
    await client.query("delete from public.recipe_generation_queue where stav = 'pending'");

    // Otevrena objednavka s JINYM pasmem, nez jake by plnic zalozil.
    // Stary dedup porovnaval pasmo na presnou shodu, takze by pridal druhou.
    await client.query(
      `insert into public.recipe_generation_queue
         (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, priorita, zdroj, stav)
       values ('obed', '{}', 111, 999, 5, 10, 'demand', 'pending')`,
    );

    await client.query(
      `insert into public.catalog_slot_demand
         (den, meal_type, diet_tags, kcal_min, kcal_max, reseni, nevyresenych, kandidatu_min, chybi_max)
       values (current_date, 'obed', '{}', 400, 800, 5, 3, 0, 9)
       on conflict do nothing`,
    );

    const { rows } = await client.query('select public.fill_recipe_queue_from_demand(7, 3) as v');
    assert.equal(rows[0].v.zalozeno, 0, 'plnic zalozil druhou objednavku na tutez diru');
  } finally {
    await client.query('rollback to savepoint s');
  }
});
