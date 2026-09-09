/**
 * TŘI BEZPEČNOSTNÍ NÁLEZY ZE SUPABASE ADVISORS (9. 9. 2026) — MIGRACE
 * 20260909211914, APLIKOVANÁ v produkci 9. 9. 2026 (viz docs/DALSI_KROK.md, "Pravidla, která
 * platí nade vším" — migraci nasadí druhý Claude před mergem).
 *
 * PROČ TENHLE TEST EXISTUJE. Bez něj by nikdo nepoznal, že se práva na
 * `sync_plan_activation()` v budoucnu vrátily zpátky na `anon`/
 * `authenticated` novou migrací (třeba widgetem, který si "pro jistotu"
 * grantne přístup) — tenhle test čte SOUBOR migrace, ne stav v produkci,
 * takže hlídá jen to, co je v gitu, ale hlídá to napořád a bez dotazu do DB.
 * Do produkce ani do žádné DB se nesahá — `test:unit` musí projít i bez
 * spojení na Supabase.
 *
 * `sync_plan_activation()` je SECURITY DEFINER a dělá globální update přes
 * celou `ai_generated_plans` — bez REVOKE by ji mohl volat kdokoli
 * z internetu přes `/rest/v1/rpc/sync_plan_activation`, bez přihlášení.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRACE = readFileSync(
  new URL('../../supabase/migrations/20260909211914_tri_bezpecnostni_nalezy.sql', import.meta.url),
  'utf8'
);

test('sync_plan_activation() ztrácí EXECUTE pro PUBLIC, anon i authenticated', () => {
  assert.match(MIGRACE, /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.sync_plan_activation\(\)\s+FROM\s+PUBLIC\s*;/i);
  assert.match(MIGRACE, /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.sync_plan_activation\(\)\s+FROM\s+anon\s*;/i);
  assert.match(MIGRACE, /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.sync_plan_activation\(\)\s+FROM\s+authenticated\s*;/i);
});

test('sync_plan_activation() zůstává volatelná pro service_role — cron nesmí přestat fungovat', () => {
  assert.match(MIGRACE, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.sync_plan_activation\(\)\s+TO\s+service_role\s*;/i);
});

test('exercise_registry_expected_keys přechází na security_invoker', () => {
  assert.match(
    MIGRACE,
    // `= true`, ne `= on`: Postgres uklada reloption doslova, takze po `= on`
    // by kontrolni blok v migraci (a advisor) hodnotu nenasel. Chyceno pri
    // nasazeni 9. 9. 2026 — proto to test hlida na presnem tvaru.
    /ALTER\s+VIEW\s+public\.exercise_registry_expected_keys\s+SET\s*\(\s*security_invoker\s*=\s*true\s*\)\s*;/i
  );
});

test('pět funkcí bez pevného search_path dostává SET search_path = public', () => {
  const ocekavaneSignatury = [
    'public.atwater_ok(numeric, numeric, numeric, numeric, numeric, numeric)',
    'public.enforce_exercise_registry_rules()',
    'public.exercise_level_ordinal(text)',
    'public.protect_measured_ready_in_minutes()',
    'public.slot_time_limit(text)',
  ];
  for (const podpis of ocekavaneSignatury) {
    const escaped = podpis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vzor = new RegExp(`ALTER\\s+FUNCTION\\s+${escaped}\\s+SET\\s+search_path\\s*=\\s*public\\s*;`, 'i');
    assert.ok(vzor.test(MIGRACE), `chybí ALTER FUNCTION pro ${podpis}`);
  }
});

test('enforce_exercise_registry_rules() se nepřepisuje přes CREATE OR REPLACE — mění se jen search_path', () => {
  assert.doesNotMatch(
    MIGRACE,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_exercise_registry_rules/i,
    'tahle migrace smí funkci jen ALTERovat (search_path), ne přepsat tělo'
  );
});

test('migrace neaplikuje sama sebe a nemá db push', () => {
  assert.doesNotMatch(MIGRACE, /supabase\s+db\s+push/i);
});

test('kontrolní blok hlídá všechny tři opravy najednou, ne jen jednu', () => {
  assert.match(MIGRACE, /DO\s+\$\$/);
  assert.match(MIGRACE, /has_function_privilege\(\s*'anon'/i);
  assert.match(MIGRACE, /has_function_privilege\(\s*'authenticated'/i);
  assert.match(MIGRACE, /security_invoker/i);
  assert.match(MIGRACE, /search_path/i);
  // Aspoň tři RAISE EXCEPTION uvnitř kontrolního bloku — jeden na nález nestačí.
  const pocetVyjimek = (MIGRACE.match(/RAISE\s+EXCEPTION/gi) || []).length;
  assert.ok(pocetVyjimek >= 3, `kontrolní blok má jen ${pocetVyjimek} RAISE EXCEPTION, čekal jsem aspoň 3`);
});
