/**
 * Dorovná LOKÁLNÍ databázi na aktuální migrace, aby šel spustit `npm run test:db`.
 *
 * ===========================================================================
 * PROČ TENHLE SKRIPT VŮBEC EXISTUJE
 * ===========================================================================
 * `npx supabase db reset --local` v tomhle repu NEDOJEDE. Zastaví se na první
 * migraci, která tvrdí produkční počty řádků — změřeno 24. 8. 2026:
 *
 *   20260730100000_normalize_diet_tags.sql
 *   ERROR: Aktivnich receptu je 0 (cekali jsme 297 ...)
 *
 * Takových migrací je 29 z 90. Je to logický důsledek toho, jak se tu migrace
 * píšou: každá si po sobě kontroluje, že opravila přesně to, co měla, a čísla
 * má z produkce. Na čerstvé lokální databázi, kde není ani jeden recept, ty
 * kontroly padají — správně, protože tam opravdu není co opravit.
 *
 * TENHLE SKRIPT TO NEOPRAVUJE. Jen aplikuje migraci po migraci a ty, které
 * na datové kontrole spadnou, PŘESKOČÍ a vypíše. Přeskočená migrace se
 * odroluje celá, takže lokální schéma je nutně neúplné — na testy funkcí to
 * stačí, na cokoli jiného se na něj nespoléhej.
 *
 * Dorovnat migrační historii repa tak, aby `db reset` dojel od nuly, je
 * samostatná práce (a stojí za ni) — ne něco, co se udělá mimochodem
 * u jednoho testu.
 *
 * ===========================================================================
 * POUŽITÍ
 * ===========================================================================
 *   npx supabase start
 *   npx supabase db reset --local     # dojede, kam to jde, pak spadne
 *   node scripts/local-db-pro-testy.mjs
 *   npm run test:db
 *
 * NIKDY `--linked`. To by resetovalo PRODUKCI.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const MIGRACE_DIR = 'supabase/migrations';

const DB_URL = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * POJISTKA. Skript aplikuje SQL bez ptaní, takže se nesmí dát omylem namířit
 * jinam než na localhost. Produkce se migruje `supabase db push` z gitu.
 */
function overLokalni(url) {
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(
      `Odmítám se připojit na "${host}". Tenhle skript je jen pro lokální databázi.`,
    );
  }
}

async function hlavni() {
  overLokalni(DB_URL);

  const klient = new pg.Client({ connectionString: DB_URL });
  await klient.connect();

  const { rows } = await klient.query('select version from supabase_migrations.schema_migrations');
  const hotove = new Set(rows.map((r) => r.version));

  const soubory = fs.readdirSync(MIGRACE_DIR).filter((f) => f.endsWith('.sql')).sort();

  const preskocene = [];
  let aplikovano = 0;

  for (const soubor of soubory) {
    const verze = soubor.split('_')[0];
    if (hotove.has(verze)) continue;

    const sql = fs.readFileSync(path.join(MIGRACE_DIR, soubor), 'utf8');
    try {
      await klient.query(sql);
      await klient.query(
        'insert into supabase_migrations.schema_migrations(version) values ($1) on conflict do nothing',
        [verze],
      );
      aplikovano += 1;
    } catch (chyba) {
      preskocene.push({ soubor, duvod: String(chyba.message).split('\n')[0] });
    }
  }

  await klient.end();

  console.log(`Aplikováno ${aplikovano} migrací, přeskočeno ${preskocene.length}.`);

  // PŘESKOČENÉ SE VYPISUJÍ VŠECHNY. Tichý seznam by z neúplného schématu
  // udělal něco, co vypadá jako úplné.
  for (const { soubor, duvod } of preskocene) {
    console.log(`  přeskočeno: ${soubor}\n              ${duvod}`);
  }

  if (aplikovano === 0 && preskocene.length === 0) {
    console.log('Lokální databáze je na aktuálních migracích.');
  }
}

hlavni().catch((chyba) => {
  console.error(chyba.message);
  process.exit(1);
});
