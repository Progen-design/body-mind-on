/**
 * docs/DALSI_KROK.md 9.2 — SMAZANÝ ÚČET SE TVÁŘÍ JAKO SPADLÁ REGISTRACE.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 7. 9. 2026: smazání 16 testovacích účtů rozsvítilo warning
 * `registrations_viselec` „Registrace ulozena, ucet nevznikl" — na přesně
 * těch 16 adres. Řádek v `registrations` po smazání účtu správně zůstává
 * (registrace vzniká před účtem), ale mazat ho měla aplikační vrstva a
 * nemazala: `delete_user_data` má na to větev podle e-mailu, jenže
 * api/delete-account.js jí e-mail vůbec neposílalo.
 *
 * `supabaseServer` se nedá podvrhnout přes import, testuje se tvar zdrojáku
 * a migrace (stejně jako stripeSkipAlert.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');

test('(1) delete-account posílá delete_user_data i e-mail — jinak registrace přežije', () => {
  const zdroj = readFileSync(join(KOREN, 'api', 'delete-account.js'), 'utf8');

  const i = zdroj.indexOf("rpc('delete_user_data'");
  assert.ok(i > 0, 'mazání musí jít přes delete_user_data');
  const volani = zdroj.slice(i, i + 200);
  assert.match(volani, /target_user_id:\s*userId/);
  assert.match(volani, /target_email:\s*user\.email/,
    'bez target_email se větev mazání podle e-mailu (registrations, waitlist) vůbec nespustí');

  // Smazání je ZÁMĚRNÉ v aplikační vrstvě — komentář musí říct, proč to
  // NENÍ kandidát na cizí klíč, ať to nikdo „neopraví" FK smyčkou.
  assert.match(zdroj, /ZÁMĚRNÉ smazání/i, 'záměr musí být v kódu pojmenovaný');
  assert.match(zdroj, /cizí klíč/i, 'a výslovně vyloučit FK — registrace vzniká před účtem');
});

test('(2) je_testovaci_email zná +aliasy, ale jen se značkou série, ne lidské štítky', () => {
  const migrace = readdirSync(join(KOREN, 'supabase', 'migrations'))
    .filter((f) => f.includes('smazany_ucet'));
  assert.equal(migrace.length, 1, 'čekána právě jedna migrace k 9.2');

  const sql = readFileSync(join(KOREN, 'supabase', 'migrations', migrace[0]), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.je_testovaci_email/);
  assert.match(sql, /\(t\|r\|u\)\[0-9\]/,
    'značka je písmeno t/r/u + číslice — bez číslice by pravidlo spolklo i +urgent nebo +todo');
  // Žádná konkrétní adresa natvrdo — čí e-mail se testuje je konfigurace
  // osoby, ne pravidlo systému. (V DO bloku s ověřením být smí.)
  const funkce = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('COMMENT ON FUNCTION'));
  assert.equal(funkce.includes('janprikopa'), false, 'funkce nesmí obsahovat konkrétní osobu');

  // Migrace si nové chování sama ověří na obou stranách hranice.
  assert.match(sql, /janprikopa\+u01@gmail\.com/, 'DO blok: alias se značkou JE testovací');
  assert.match(sql, /janprikopa@gmail\.com/, 'DO blok: adresa bez značky NENÍ testovací');
  assert.match(sql, /\+urgent/, 'DO blok: lidský alias NENÍ testovací');
});

test('(3) registrations_viselec hlídá jen posledních 7 dnů a selhava zůstala', () => {
  const migrace = readdirSync(join(KOREN, 'supabase', 'migrations'))
    .filter((f) => f.includes('smazany_ucet'));
  const sql = readFileSync(join(KOREN, 'supabase', 'migrations', migrace[0]), 'utf8');

  assert.match(sql, /r\.created_at > \(now\(\) - ''7 days''::interval\)/,
    'starší registrace už není živý problém — jen by dusila skutečný poplach');

  // Klíčové: view se NEPŘEPISUJE ručně, patchuje se aktuální definice
  // z pg_get_viewdef a security_invoker se obnovuje explicitně.
  assert.match(sql, /pg_get_viewdef/);
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /preskakuji/, 'migrace musí být idempotentní');
  assert.equal(
    /CREATE OR REPLACE VIEW public\.system_health_alerts_zaklad AS\s*\n\s*SELECT/.test(sql),
    false,
    'view se nesmí přepisovat ručně vypsanou definicí'
  );

  // NEDĚLAT z 9.2: registrace_selhava (HAVING count(*) >= 2) se nemění a
  // migrace to po sobě kontroluje; existující řádky registrations se nemažou.
  assert.match(sql, /HAVING count\\\(\\\*\\\) >= 2/, 'kontrola, že selhava přežila patch');
  assert.equal(/DELETE FROM.*registrations/s.test(sql), false,
    'řádky registrations jsou jediná stopa, že registrace proběhly — nemazat');
});
