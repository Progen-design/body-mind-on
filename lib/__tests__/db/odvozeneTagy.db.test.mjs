/**
 * Odvozene dietni tagy — test, ktery funkci OPRAVDU SPUSTI.
 *
 * ===========================================================================
 * PROC TENHLE SOUBOR EXISTUJE
 * ===========================================================================
 * 24. 8. 2026 spadla migrace 20260824120000 v produkci:
 *
 *   ERROR: 22P02: malformed array literal: "low_carb"
 *   QUERY: v_tagy := v_tagy || 'low_carb'
 *
 * Netypovany literal Postgres u `||` nad text[] vyhodnoti jako
 * anyarray || anyarray, ne jako pridani prvku. Spravne je `'low_carb'::text`.
 *
 * Testy v lib/__tests__/dietTagy.test.mjs to chytit NEMOHLY. Overuji SQL
 * regexem nad textem souboru, takze `assert.match(sql, /array_remove\(v_tagy,
 * 'low_carb'\)/)` projde i nad SQL, ktere se nikdy nespusti. Typy, syntax
 * ani chovani Postgresu pro takovy test neexistuji.
 *
 * Tenhle test nic negrepuje. Pripoji se k databazi a funkci zavola.
 *
 * ===========================================================================
 * JAK HO SPUSTIT
 * ===========================================================================
 *   npx supabase start
 *   npx supabase db reset --local
 *   node scripts/local-db-pro-testy.mjs
 *   npm run test:db
 *
 * NIKDY `--linked` — to resetuje PRODUKCI.
 *
 * TEN TRETI RADEK TAM NENI NAVIC. `db reset --local` v tomhle repu NEDOJEDE:
 * 29 z 90 migraci si po sobe kontroluje produkcni pocty radku a na prazdne
 * lokalni databazi ty kontroly padaji. Skript doaplikuje zbytek a vypise,
 * co preskocil — duvod je u nej popsany podrobne. Lokalni schema je proto
 * NEUPLNE; na testy funkci to staci, na cokoli jineho se na nej nespolehej.
 *
 * V CI NEBEZI. Workflow tests.yml nema databazi a stavet ji kvuli jednomu
 * souboru by bylo vic infrastruktury nez uzitku. Proto tenhle test NENI
 * v `test:unit` a ma vlastni skript. Kdyz se nema kam pripojit, spadne
 * s navodem — mlcky se nepreskakuje, to by byl zase test, ktery nic neoveri.
 *
 * NIC PO SOBE NENECHAVA. Vsechno bezi v jedne transakci, ktera se na konci
 * odrolovava.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';

/** Lokalni Supabase Postgres. Port je z supabase/config.toml, sekce [db]. */
const DB_URL = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const NAVOD = [
  'Nepodarilo se pripojit k databazi.',
  '',
  '  npx supabase db reset --local',
  '  npm run test:db',
  '',
  `Adresa: ${DB_URL} (prepsat pres SUPABASE_DB_URL)`,
].join('\n');

/**
 * Suroviny, ktere si test zaklada sam.
 *
 * PROC VLASTNI A NE ZE SEEDU. Aby test nezavisel na tom, co zrovna lezi ve
 * slovniku — jinak by ho posunul kazdy dalsi import surovin. Vyjimka je
 * `ovesné vločky`: tam se schvalne overuje SEEDOVANY radek, protoze smyslem
 * je zkontrolovat, ze ho vzor v migraci opravdu oznacil jako lepkovy.
 */
const BEZLEPKA = 'Zkouskovina bezlepka';
const LEPKOVINA = 'Zkouskovina lepkovina';
const NEZNAMA = 'Zkouskovina kterou slovnik nezna';

let client;

test.before(async () => {
  client = new pg.Client({ connectionString: DB_URL });
  try {
    await client.connect();
  } catch (chyba) {
    throw new Error(`${NAVOD}\n\nPuvodni chyba: ${chyba.message}`);
  }

  await client.query('begin');
  await client.query(
    `insert into public.ingredients_nutrition
       (name_en, name_cs, name_normalized, kcal_per_100g, obsahuje_lepek, is_vegan, is_vegetarian)
     values
       ($1, $2, $3, 50, false, true, true),
       ($4, $5, $6, 50, true,  true, true)`,
    [
      'test gluten free thing', BEZLEPKA, 'zkouskovina bezlepka',
      'test gluten thing', LEPKOVINA, 'zkouskovina lepkovina',
    ],
  );
});

test.after(async () => {
  if (!client) return;
  // Nic po sobe nenechavat. ROLLBACK, ne DELETE — kdyby test spadl uprostred,
  // odrolovani probehne stejne.
  await client.query('rollback');
  await client.end();
});

/**
 * Dotaz izolovany savepointem.
 *
 * PROC. Kdyz dotaz spadne, Postgres cely transakci ODMITNE dal obsluhovat
 * a vsechny nasledujici dotazy padaji na "current transaction is aborted".
 * Bez savepointu tedy jedna chyba zbarvi cervene i testy, ktere s ni nemaji
 * nic spolecneho — a schova, co se vlastne rozbilo. Overeno: bez tehle
 * izolace shodila vadna funkce vsech 14 testu vcetne toho, ktery jen cte
 * slovnik.
 */
async function dotaz(sql, parametry = []) {
  await client.query('savepoint t');
  try {
    return await client.query(sql, parametry);
  } catch (chyba) {
    await client.query('rollback to savepoint t');
    throw chyba;
  } finally {
    await client.query('release savepoint t').catch(() => {});
  }
}

/** Zavola prepocet a vrati tagy jako pole. */
async function prepocti({ tagy = [], suroviny = [], kcal = 500, carbs = 60 }) {
  const { rows } = await dotaz(
    `select public.prepocti_odvozene_tagy($1::text[], $2::jsonb, $3::numeric, $4::numeric) as tagy`,
    [tagy, JSON.stringify(suroviny.map((name) => ({ name }))), kcal, carbs],
  );
  return rows[0].tagy;
}

// ===========================================================================
// Regrese na pad migrace
// ===========================================================================

test('funkce vubec probehne — tohle byl ten pad v produkci', async () => {
  // `v_tagy || 'low_carb'` bez pretypovani hodilo 22P02 malformed array
  // literal. Ten tvar, ktery spadl: neprazdne pole a pridani OBOU tagu.
  const tagy = await prepocti({
    tagy: ['vegan'],
    suroviny: [BEZLEPKA],
    kcal: 400,
    carbs: 20,
  });

  assert.ok(tagy.includes('gluten_free'), 'gluten_free se nepridal');
  assert.ok(tagy.includes('low_carb'), 'low_carb se nepridal');
  assert.ok(tagy.includes('vegan'), 'vegan zmizel');
});

// ===========================================================================
// gluten_free
// ===========================================================================

test('recept bez lepkove suroviny gluten_free dostane', async () => {
  const tagy = await prepocti({ suroviny: [BEZLEPKA] });
  assert.ok(tagy.includes('gluten_free'), `tag chybi, vraceno: ${JSON.stringify(tagy)}`);
});

test('recept s lepkovou surovinou gluten_free nedostane', async () => {
  const tagy = await prepocti({ suroviny: [BEZLEPKA, LEPKOVINA] });
  assert.ok(!tagy.includes('gluten_free'), `tag zustal, vraceno: ${JSON.stringify(tagy)}`);
});

test('ovesne vlocky jsou ve slovniku vedene jako lepkove', async () => {
  // Overuje SEEDOVANY radek: ze ho vzor v migraci 20260824120000 opravdu
  // chytil. Bezne vlocky se melou na stejne lince jako psenice.
  const { rows } = await dotaz(
    `select obsahuje_lepek from public.ingredients_nutrition where name_cs = 'ovesné vločky'`,
  );
  assert.equal(rows.length, 1, 'ovesné vločky nejsou ve slovniku — zmenil se seed?');
  assert.equal(rows[0].obsahuje_lepek, true, 'ovesné vločky nejsou oznacene jako lepkove');
});

test('recept s ovesnymi vlockami gluten_free nedostane', async () => {
  const tagy = await prepocti({ suroviny: ['ovesné vločky'] });
  assert.ok(!tagy.includes('gluten_free'), `tag zustal, vraceno: ${JSON.stringify(tagy)}`);
});

test('recept s neznamou surovinou gluten_free nedostane', async () => {
  // "Nevime" neni "bez lepku" — to je spravna strana chyby.
  const tagy = await prepocti({ suroviny: [BEZLEPKA, NEZNAMA] });
  assert.ok(!tagy.includes('gluten_free'), `tag zustal, vraceno: ${JSON.stringify(tagy)}`);
});

test('tvrzeni modelu o lepku se zahodi', async () => {
  // Model tag dat muze, do katalogu se nedostane.
  const tagy = await prepocti({ tagy: ['gluten_free'], suroviny: [LEPKOVINA] });
  assert.ok(!tagy.includes('gluten_free'), 'tag od modelu prezil prepocet');
});

// ===========================================================================
// low_carb
// ===========================================================================

test('recept pod prahem low_carb dostane', async () => {
  // 20 g sacharidu pri 400 kcal = 20 % energie.
  const tagy = await prepocti({ suroviny: [BEZLEPKA], kcal: 400, carbs: 20 });
  assert.ok(tagy.includes('low_carb'), `tag chybi, vraceno: ${JSON.stringify(tagy)}`);
});

test('recept nad prahem low_carb nedostane', async () => {
  // 40 g sacharidu pri 400 kcal = 40 % energie.
  const tagy = await prepocti({ suroviny: [BEZLEPKA], kcal: 400, carbs: 40 });
  assert.ok(!tagy.includes('low_carb'), `tag zustal, vraceno: ${JSON.stringify(tagy)}`);
});

test('presne na prahu recept projde', async () => {
  // 26 g pri 400 kcal = 26 %, coz je prah, ne hranice.
  const tagy = await prepocti({ suroviny: [BEZLEPKA], kcal: 400, carbs: 26 });
  assert.ok(tagy.includes('low_carb'), '26 % ma projit');
});

test('bez maker se low_carb neprideluje', async () => {
  // "Nevime" neni "nizkosacharidove". Kdyby se chybejici hodnota cetla jako
  // nula, recept bez maker by vysel jako nulasacharidovy.
  const tagy = await prepocti({ suroviny: [BEZLEPKA], kcal: 400, carbs: null });
  assert.ok(!tagy.includes('low_carb'), `tag zustal, vraceno: ${JSON.stringify(tagy)}`);
});

// ===========================================================================
// Ostatni tagy
// ===========================================================================

test('ostatni tagy zustanou nedotcene', async () => {
  // U vegan a vegetarian je tag i ROZHODNUTI o zarazeni, ne jen popis
  // slozeni. Prepocet se jich tykat nesmi.
  const tagy = await prepocti({
    tagy: ['vegan', 'vegetarian', 'high_fiber'],
    suroviny: [LEPKOVINA],
    kcal: 400,
    carbs: 80,
  });

  for (const ocekavany of ['vegan', 'vegetarian', 'high_fiber']) {
    assert.ok(tagy.includes(ocekavany), `${ocekavany} zmizel, vraceno: ${JSON.stringify(tagy)}`);
  }
  assert.ok(!tagy.includes('gluten_free'));
  assert.ok(!tagy.includes('low_carb'));
});

test('prazdny a NULL vstup nic neshodi', async () => {
  const zPrazdna = await prepocti({ tagy: [], suroviny: [BEZLEPKA] });
  assert.ok(Array.isArray(zPrazdna));

  const { rows } = await dotaz(
    `select public.prepocti_odvozene_tagy(null, '[]'::jsonb, null, null) as tagy`,
  );
  // Recept bez surovin nema konflikt, takze gluten_free dostane; bez maker
  // low_carb ne.
  assert.deepEqual(rows[0].tagy, ['gluten_free']);
});

// ===========================================================================
// Backfill
// ===========================================================================

/**
 * Backfill se bere DOSLOVA z migrace, nepise se tu znovu.
 *
 * PROC. Kdyby ho test opsal, overoval by svou vlastni kopii — presne ta chyba,
 * kvuli ktere tenhle soubor vznikl. Takhle se spousti tentyz text, ktery pojede
 * na produkci.
 */
function backfillZMigrace() {
  const sql = fs.readFileSync(
    'supabase/migrations/20260824120000_lepek_a_odvozene_dietni_tagy.sql',
    'utf8',
  );
  const vyskyty = [...sql.matchAll(/^update public\.recipes_catalog/gm)];
  assert.equal(vyskyty.length, 1, `backfill ma byt v migraci prave jeden, nalezeno ${vyskyty.length}`);

  const zacatek = vyskyty[0].index;
  return sql.slice(zacatek, sql.indexOf(';', zacatek) + 1);
}

test('backfill prepise odvozene tagy a na nic jineho nesahne', async () => {
  // Lokalne je katalog prazdny, takze backfill v migraci nic neprepsal.
  // Na produkci pojede pres 598 radku — tady se ta cesta vystavi nasucho.
  await client.query('savepoint backfill');
  try {
    // Stejne jako migrace: brana se na dobu backfillu vypina.
    await client.query('alter table public.recipes_catalog disable trigger trg_enforce_recipe_catalog_rules');

    // `id` je GENERATED ALWAYS, takze se nevnucuje — radky se rozlisi nazvem.
    await client.query(
      `insert into public.recipes_catalog (name_cs, meal_type, kcal, carbs_g, ingredients, diet_tags, active)
       values
         ('zk bezlepkovy lowcarb', 'snidane', 400, 20, $1::jsonb, '{}',               true),
         ('zk ovesny',             'snidane', 400, 20, $2::jsonb, '{gluten_free}',    true),
         ('zk lepkovy vegan',      'obed',    400, 80, $3::jsonb, '{vegan,low_carb}', true),
         ('zk neznama surovina',   'vecere',  400, 80, $4::jsonb, '{gluten_free}',    true)`,
      [
        JSON.stringify([{ name: BEZLEPKA }]),
        JSON.stringify([{ name: 'ovesné vločky' }]),
        JSON.stringify([{ name: LEPKOVINA }]),
        JSON.stringify([{ name: NEZNAMA }]),
      ],
    );

    await client.query(backfillZMigrace());

    const { rows } = await client.query(
      `select name_cs, diet_tags, active from public.recipes_catalog where name_cs like 'zk %'`,
    );
    assert.equal(rows.length, 4, 'testovaci recepty se nezalozily');
    const podle = Object.fromEntries(rows.map((r) => [r.name_cs, r]));

    assert.deepEqual(
      [...podle['zk bezlepkovy lowcarb'].diet_tags].sort(), ['gluten_free', 'low_carb'],
      'bezlepkovy nizkosacharidovy recept mel dostat oba tagy',
    );
    assert.deepEqual(
      podle['zk ovesny'].diet_tags, ['low_carb'],
      'recept s ovesnymi vlockami si mel gluten_free odebrat',
    );
    assert.deepEqual(
      podle['zk lepkovy vegan'].diet_tags, ['vegan'],
      'low_carb mel zmizet a vegan zustat nedotceny',
    );
    assert.deepEqual(
      podle['zk neznama surovina'].diet_tags, [],
      'neznama surovina mela gluten_free shodit',
    );

    // TO PODSTATNE: backfill meni tagy, ne aktivitu.
    for (const [nazev, radek] of Object.entries(podle)) {
      assert.equal(radek.active, true, `backfill deaktivoval recept "${nazev}"`);
    }

    // A po druhem behu uz nema co delat — na tom stoji kontrola v migraci.
    const { rowCount } = await client.query(backfillZMigrace());
    assert.equal(rowCount, 0, 'druhy beh backfillu jeste neco prepsal');
  } finally {
    await client.query('rollback to savepoint backfill');
  }
});

// ===========================================================================
// Idempotence — na ni stoji backfill
// ===========================================================================

test('druhy prepocet uz nic nezmeni', async () => {
  // Backfill zapisuje vysledek prepoctu a kontrola na konci migrace pak overuje,
  // ze se zadny radek od prepoctu nelisi. Kdyby funkce nebyla idempotentni,
  // ta kontrola by migraci shodila.
  const prvni = await prepocti({ tagy: ['vegan'], suroviny: [BEZLEPKA], kcal: 400, carbs: 20 });
  const { rows } = await dotaz(
    `select public.prepocti_odvozene_tagy($1::text[], $2::jsonb, 400, 20) as tagy`,
    [prvni, JSON.stringify([{ name: BEZLEPKA }])],
  );
  assert.deepEqual(rows[0].tagy, prvni, 'prepocet neni idempotentni');
});
