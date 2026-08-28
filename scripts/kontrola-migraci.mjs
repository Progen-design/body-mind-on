/**
 * Co je v repu a není v produkci (a naopak).
 *
 * ===========================================================================
 * PROČ
 * ===========================================================================
 * Migrace aplikuje člověk ručně a nestíhá to hlídat. 26. 8. 2026 se
 * `20260826100000_generator_mlceni_je_porucha.sql` neaplikovala vůbec
 * a přišlo se na to až o dva dny později tím, že spadla jiná migrace, která
 * na ni navazovala. Produkce to tedy oznámila dřív než my.
 *
 * ===========================================================================
 * PROČ NESTAČÍ `supabase migration list --linked`
 * ===========================================================================
 * Páruje na VERZI, a ta se rozešla. Migrace aplikované přes MCP
 * `apply_migration` si razítkují vlastní timestamp podle času aplikace:
 *
 *   repo   20260825120000_fronta_slucuje_poptavku.sql
 *   prod   20260826101605  fronta_slucuje_poptavku
 *
 * `migration list` proto od 23. 8. hlásí ~16 řádků jako nespárované, přestože
 * aplikované jsou. V tom šumu skutečná mezera zanikne — přesně to se stalo.
 *
 * PÁRUJE SE NA JMÉNO. Ověřeno proti produkci 28. 8. 2026: `schema_migrations`
 * má sloupec `name` a je v něm název souboru bez timestampu a bez `.sql`.
 * Sedělo to na všech 136 řádcích, žádný neměl `name` prázdné. Verze se bere
 * jako druhá možnost — u migrací nasazených přes `db push` sedí přesně.
 *
 * ===========================================================================
 * POUŽITÍ
 * ===========================================================================
 *   node scripts/kontrola-migraci.mjs
 *
 * Nic nekonfiguruje — bere přihlášení z linknutého projektu, stejně jako
 * `supabase migration list`. Trvá to ~30 s, protože jediný způsob, jak se
 * dostat ke sloupci `name`, je dump té tabulky.
 *
 * Návratový kód 1, když v produkci něco chybí — dá se tím zablokovat release.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const MIGRACE_DIR = 'supabase/migrations';
const TABULKA = '"supabase_migrations"."schema_migrations"';

/**
 * Rozdělí řetězec na prvky oddělené čárkou a respektuje SQL uvozovky.
 *
 * `''` uvnitř řetězce je escapovaná apostrofa, ne konec hodnoty — statements
 * migrací jsou plné SQL kódu s apostrofami, takže naivní `split(',')` by je
 * roztrhal uprostřed.
 */
function rozdelSloupce(radek) {
  const out = [];
  let cur = '';
  let vUvozovkach = false;

  for (let i = 0; i < radek.length; i += 1) {
    const znak = radek[i];

    if (vUvozovkach) {
      if (znak === "'") {
        if (radek[i + 1] === "'") { cur += "'"; i += 1; continue; }
        vUvozovkach = false;
        continue;
      }
      cur += znak;
      continue;
    }

    if (znak === "'") { vUvozovkach = true; continue; }
    if (znak === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += znak;
  }

  out.push(cur.trim());
  return out;
}

/** Rozpadne `VALUES (...), (...)` na jednotlivé řádky. */
function rozdelRadky(sql, odKud) {
  const radky = [];
  let hloubka = 0;
  let vUvozovkach = false;
  let buf = '';

  for (let i = odKud; i < sql.length; i += 1) {
    const znak = sql[i];

    if (vUvozovkach) {
      if (znak === "'") {
        if (sql[i + 1] === "'") { buf += "''"; i += 1; continue; }
        vUvozovkach = false;
      }
      buf += znak;
      continue;
    }

    if (znak === "'") { vUvozovkach = true; buf += znak; continue; }
    if (znak === '(') { hloubka += 1; if (hloubka === 1) { buf = ''; continue; } }
    if (znak === ')') { hloubka -= 1; if (hloubka === 0) { radky.push(buf); buf = ''; continue; } }
    if (hloubka === 0 && znak === ';') break;
    if (hloubka > 0) buf += znak;
  }

  return radky;
}

/** Přečte `version` a `name` z produkce. */
function nactiProdukci() {
  let dump;
  try {
    // `execSync` s jedním řetězcem, ne `execFileSync` s polem: `npx` je na
    // Windows `.cmd` a bez shellu se nespustí. Příkaz je konstanta bez
    // uživatelského vstupu, takže se nemá co escapovat.
    dump = execSync(
      'npx supabase db dump --linked --data-only --schema supabase_migrations',
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (chyba) {
    throw new Error(
      'Nepodarilo se stahnout stav produkce.\n'
      + 'Zkontroluj, ze je projekt linknuty: npx supabase link --project-ref <ref>\n'
      + `Puvodni chyba: ${chyba.message}`,
    );
  }

  const zacatek = dump.indexOf(`INSERT INTO ${TABULKA}`);
  if (zacatek < 0) {
    // TICHÉ SELHÁNÍ JE HORŠÍ NEŽ ŽÁDNÁ KONTROLA. Kdyby se formát dumpu změnil
    // a skript vrátil prázdno, tvářilo by se to jako „všechno je nasazené".
    throw new Error(`V dumpu nenalezen INSERT do ${TABULKA} — zmenil se format?`);
  }

  // Pořadí sloupců se ČTE z hlavičky, nepředpokládá se. Kdyby ho Supabase
  // prohodila, jinak by se `name` tiše načetlo z jiného sloupce.
  const hlavicka = dump.slice(zacatek, dump.indexOf('VALUES', zacatek));
  const sloupce = [...hlavicka.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).slice(2);
  const iVersion = sloupce.indexOf('version');
  const iName = sloupce.indexOf('name');
  if (iVersion < 0 || iName < 0) {
    throw new Error(`V ${TABULKA} chybi sloupec version nebo name: ${sloupce.join(', ')}`);
  }

  const radky = rozdelRadky(dump, dump.indexOf('VALUES', zacatek) + 'VALUES'.length);
  if (radky.length === 0) {
    throw new Error('Z dumpu se neprecetl ani jeden radek — zmenil se format?');
  }

  return radky.map((r) => {
    const s = rozdelSloupce(r);
    return {
      version: s[iVersion],
      name: s[iName] === 'NULL' ? null : s[iName],
    };
  });
}

/** Rozpad názvu souboru na timestamp a jméno. */
function rozborSouboru(soubor) {
  const m = /^(\d{14})_(.+)\.sql$/.exec(soubor);
  return m ? { soubor, version: m[1], name: m[2] } : { soubor, version: null, name: null };
}

function hlavni() {
  const produkce = nactiProdukci();
  const soubory = fs.readdirSync(MIGRACE_DIR).filter((f) => f.endsWith('.sql')).sort();

  const prodJmena = new Set(produkce.map((p) => p.name).filter(Boolean));
  const prodVerze = new Set(produkce.map((p) => p.version));

  const chybne = [];
  const chybiVProdukci = [];
  const vRepu = new Set();

  for (const soubor of soubory) {
    const { version, name } = rozborSouboru(soubor);
    if (!version) { chybne.push(soubor); continue; }
    vRepu.add(name);
    if (prodVerze.has(version) || prodJmena.has(name)) continue;
    chybiVProdukci.push({ soubor, name });
  }

  const souborVerze = new Set(soubory.map((f) => rozborSouboru(f).version));
  const jenVProdukci = produkce.filter(
    (p) => p.name && !vRepu.has(p.name) && !souborVerze.has(p.version),
  );

  // PŘEJMENOVANÁ MIGRACE VYPADÁ JAKO DVĚ PORUCHY NARÁZ — chybí v produkci
  // a zároveň v produkci přebývá. Spárovat se dá podle společného začátku
  // jména (`sync_plan_activation` vs `sync_plan_activation_by_date`).
  // Je to NÁPOVĚDA, ne verdikt: potvrdit musí člověk.
  const mozneDvojice = [];
  for (const ch of chybiVProdukci) {
    const kandidat = jenVProdukci.find(
      (p) => p.name.startsWith(ch.name) || ch.name.startsWith(p.name),
    );
    if (kandidat) mozneDvojice.push({ repo: ch.soubor, produkce: `${kandidat.version} ${kandidat.name}` });
  }

  console.log(`Repo: ${soubory.length} souboru | Produkce: ${produkce.length} radku\n`);

  if (chybne.length > 0) {
    console.log(`NESTANDARDNI NAZEV (${chybne.length}) — nejde sparovat:`);
    for (const f of chybne) console.log(`  ${f}`);
    console.log('');
  }

  const opravdovaMezera = chybiVProdukci.filter(
    (ch) => !mozneDvojice.some((d) => d.repo === ch.soubor),
  );

  if (opravdovaMezera.length === 0) {
    console.log('CHYBI V PRODUKCI: nic.');
  } else {
    console.log(`CHYBI V PRODUKCI (${opravdovaMezera.length}):`);
    for (const ch of opravdovaMezera) console.log(`  ${ch.soubor}`);
  }

  if (mozneDvojice.length > 0) {
    console.log(`\nPRAVDEPODOBNE PREJMENOVANE (${mozneDvojice.length}) — overit rucne:`);
    for (const d of mozneDvojice) console.log(`  repo ${d.repo}\n       -> produkce ${d.produkce}`);
  }

  if (jenVProdukci.length > 0) {
    console.log(`\nV PRODUKCI, NENI V REPU (${jenVProdukci.length}):`);
    for (const p of jenVProdukci) console.log(`  ${p.version}  ${p.name}`);
  }

  // Nenasazena migrace je duvod zastavit release. Prejmenovane ani prebytky
  // v produkci ne — ty jsou k prozkoumani, ne k panice.
  if (opravdovaMezera.length > 0 || chybne.length > 0) process.exitCode = 1;
}

try {
  hlavni();
} catch (chyba) {
  console.error(chyba.message);
  process.exitCode = 2;
}
