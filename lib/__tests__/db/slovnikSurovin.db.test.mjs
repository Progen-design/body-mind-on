/**
 * „Zna slovnik tuhle surovinu?" — test, ktery se pta databaze.
 *
 * ===========================================================================
 * PROC TENHLE SOUBOR EXISTUJE
 * ===========================================================================
 * Watchdog hlasil 25. 8. 2026 tricet surovin jako nenormalizovane. VSECHNY
 * byly ve slovniku — vetev se ptala jen na `ingredient_aliases` a self-alias
 * („granola" -> „granola") nikdo nezaklada, protoze k nicemu neni.
 *
 * Chyba nesla chytit regexem nad SQL: vetev byla syntakticky v poradku
 * a delala presne to, co v ni stalo. Spatne byla OTAZKA. Takove veci se daji
 * overit jedine tak, ze se funkce zavola na skutecnych datech.
 *
 * Spousteni je stejne jako u odvozeneTagy.db.test.mjs — viz hlavicka tam.
 * `npm run test:db`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DB_URL = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Surovina, kterou test zaklada jako KANONICKY nazev — schvalne BEZ aliasu. */
const KANONICKA = 'Zkouskovina kanonicka';
/** Surovina, ktera existuje jen jako alias. */
const ALIASOVANA = 'Zkouskovina aliasovana';
const NEZNAMA = 'Zkouskovina kterou nikdo nezna';

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

  await client.query(
    `insert into public.ingredients_nutrition
       (name_en, name_cs, name_normalized, kcal_per_100g)
     values ($1, $2, $3, 42)`,
    ['test canonical thing', KANONICKA, 'zkouskovina kanonicka'],
  );

  await client.query(
    `insert into public.ingredient_aliases (alias_normalized, canonical_normalized)
     values ($1, $2)`,
    ['zkouskovina aliasovana', 'zkouskovina kanonicka'],
  );
});

test.after(async () => {
  if (!client) return;
  await client.query('rollback');
  await client.end();
});

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

async function jeVeSlovniku(nazev) {
  const { rows } = await dotaz('select public.je_ve_slovniku($1) as x', [nazev]);
  return rows[0].x;
}

// ===========================================================================
// je_ve_slovniku
// ===========================================================================

test('kanonicky nazev alias NEPOTREBUJE', async () => {
  // TOHLE je ta chyba. Nazev, ktery je kanonicky, je normalizovany
  // z definice — vyzadovat k nemu jeste self-alias znamena hlasit
  // falesny poplach pokazde, kdyz plan sahne na dalsi surovinu.
  assert.equal(await jeVeSlovniku(KANONICKA), true);

  const { rows } = await dotaz(
    `select count(*)::int as n from public.ingredient_aliases
      where lower(btrim(alias_normalized)) = public.normalizuj_nazev_suroviny($1)`,
    [KANONICKA],
  );
  assert.equal(rows[0].n, 0, 'test by nemel smysl, kdyby ta surovina alias mela');
});

test('alias slovnik zna taky', async () => {
  assert.equal(await jeVeSlovniku(ALIASOVANA), true);
});

test('surovinu mimo slovnik nezna', async () => {
  assert.equal(await jeVeSlovniku(NEZNAMA), false);
});

test('velikost pismen ani diakritika nerozhoduji', async () => {
  // Porovnava se pres normalizuj_nazev_suroviny — male pismo, bez diakritiky.
  assert.equal(await jeVeSlovniku('ZKOUSKOVINA KANONICKA'), true);
  assert.equal(await jeVeSlovniku('  Zkouškovina kanonická  '), true);
});

test('prazdny nazev slovnik nezna a nespadne na tom', async () => {
  assert.equal(await jeVeSlovniku(''), false);
  const { rows } = await dotaz('select public.je_ve_slovniku(null) as x');
  assert.equal(rows[0].x, null, 'STRICT funkce ma na NULL vratit NULL');
});

// ===========================================================================
// suroviny_mimo_slovnik — to, co vola cron
// ===========================================================================

test('z pole se vrati jen to, co slovnik nezna', async () => {
  const { rows } = await dotaz(
    'select public.suroviny_mimo_slovnik($1::text[]) as x',
    [[KANONICKA, ALIASOVANA, NEZNAMA]],
  );
  assert.deepEqual(rows[0].x, [NEZNAMA]);
});

test('prazdne a nesmyslne vstupy nic neshodi', async () => {
  const prazdne = await dotaz('select public.suroviny_mimo_slovnik($1::text[]) as x', [[]]);
  assert.deepEqual(prazdne.rows[0].x, []);

  const nully = await dotaz('select public.suroviny_mimo_slovnik(null) as x');
  assert.deepEqual(nully.rows[0].x, []);

  // Prazdne retezce se nehlasi — nemaji co doplnit do slovniku.
  const mezery = await dotaz('select public.suroviny_mimo_slovnik($1::text[]) as x', [['', '   ']]);
  assert.deepEqual(mezery.rows[0].x, []);
});

// ===========================================================================
// Watchdog — konec falesnych poplachu
// ===========================================================================

test('watchdog nehlasi surovinu, kterou slovnik zna', async () => {
  await client.query('savepoint w');
  try {
    const { rows: plan } = await client.query(
      `insert into public.ai_generated_plans (is_active) values (true) returning id`,
    );
    const planId = plan[0].id;

    await client.query(
      `insert into public.ingredient_normalization_misses (plan_id, raw_name, seen_at)
       values ($1, $2, now()), ($1, $3, now())`,
      [planId, KANONICKA, NEZNAMA],
    );

    const { rows } = await client.query(
      `select detail, pocet from public.system_health_alerts where kod = 'nenormalizovana_surovina'`,
    );

    assert.equal(rows.length, 1, 'vetev mela nahlasit prave tu jednu neznamou surovinu');
    assert.ok(
      rows[0].detail.includes(NEZNAMA),
      `neznama surovina se nenahlasila: ${rows[0].detail}`,
    );
    assert.ok(
      !rows[0].detail.includes(KANONICKA),
      `watchdog hlasi surovinu, kterou slovnik zna: ${rows[0].detail}`,
    );
  } finally {
    await client.query('rollback to savepoint w');
  }
});
