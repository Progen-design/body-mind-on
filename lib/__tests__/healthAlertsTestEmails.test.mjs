/**
 * HLÍDKA NESMÍ HLÁSIT NAŠE VLASTNÍ TESTY — A NESMÍ ZTRATIT security_invoker.
 *
 * PROČ TENHLE TEST EXISTUJE
 * Do 13. 8. 2026 nechával každý běh `npm run verify:paid-path` v `registrations`
 * osiřelý řádek (úklid mazal podle user_id, jenže `registrations` se váže
 * e-mailem). Větev `registrations_viselec` na to spolehlivě křičela — k 13. 8.
 * ležely v produkci 4 takové registrace. Hlídka, která pravidelně křičí bez
 * příčiny, se přestane číst.
 *
 * Druhá věc: `CREATE OR REPLACE VIEW ... AS` bez klauzule `WITH` reloptions
 * NEZACHOVÁVÁ, přepíše je na výchozí. Migrace 20260805130000 tím view připravila
 * o `security_invoker`, který mu 20260729110816 schválně nastavila — a nikdo si
 * toho pět dní nevšiml. Proto se to tady kontroluje u KAŽDÉ migrace, která view
 * přepisuje, ne jen u té poslední.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');
const MIGRACE = join(KOREN, 'supabase', 'migrations');

function souboryMigraci() {
  return readdirSync(MIGRACE).filter((f) => f.endsWith('.sql')).sort();
}

test('úklid verify-paid-path maže i registrations', () => {
  const zdroj = readFileSync(join(KOREN, 'scripts', 'verify-paid-path.mjs'), 'utf8');

  const i = zdroj.indexOf('async function uklid()');
  assert.ok(i > 0, 'funkce uklid() se nenašla');
  const telo = zdroj.slice(i);

  assert.match(
    telo,
    /from\('registrations'\)\s*\.delete\(\)\s*\.eq\('email',\s*email\)/,
    'uklid() musí smazat řádek v registrations podle e-mailu — user_id tam není'
  );
});

test('úklid po sobě ověří, že nic nezůstalo', () => {
  const zdroj = readFileSync(join(KOREN, 'scripts', 'verify-paid-path.mjs'), 'utf8');
  const telo = zdroj.slice(zdroj.indexOf('async function uklid()'));

  assert.match(telo, /zbytk/i, 'uklid() musí po sobě zkontrolovat zbytky, ne jen mazat');
  assert.match(telo, /registrations=/, 'kontrola zbytků musí zahrnout i registrations');
});

test('migrace zavádí filtr testovacích e-mailů do obou registračních větví', () => {
  const soubor = souboryMigraci().find((f) => f.includes('ignoruj_testovaci_emaily'));
  assert.ok(soubor, 'migrace s filtrem testovacích e-mailů se nenašla');

  const sql = readFileSync(join(MIGRACE, soubor), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.je_testovaci_email/,
    'filtr musí být funkce, aby ho šlo použít víc hlídkami');
  assert.match(sql, /SET search_path = ''/,
    'funkce musí mít pevný search_path (jinak ji Supabase advisor hlásí)');

  // Obě větve čtou tentýž osiřelý join; filtrovat jen jednu nechává tutéž minu.
  assert.match(sql, /vyskytu <> 2/,
    'migrace musí trvat na obou výskytech, ne tiše upravit jeden');
});

test('každá migrace, která přepisuje system_health_alerts, drží security_invoker', () => {
  const provinilci = [];

  for (const f of souboryMigraci()) {
    const sql = readFileSync(join(MIGRACE, f), 'utf8');
    if (!/CREATE OR REPLACE VIEW[^;]*?system_health_alerts/is.test(sql)) continue;
    // Baseline i patchovací migrace skládají příkaz z proměnné — stačí, když
    // se security_invoker v souboru vyskytuje spolu s přepisem view.
    if (!/security_invoker/i.test(sql)) provinilci.push(f);
  }

  assert.deepEqual(
    provinilci,
    [
      // Historické migrace, které o security_invoker přišly. Nechávají se tu
      // pojmenované schválně: 20260813214759 ho vrátila zpět, ale kdyby se
      // seznam rozrostl o nový soubor, je to regrese.
      '20260721215134_calorie_target_health_alert.sql',
      '20260721223051_ingredient_aliases_and_normalization.sql',
      '20260721223217_system_health_alerts_nenormalizovana_surovina.sql',
      '20260729090134_spoonacular_import_rotation_and_observability.sql',
      '20260729090308_system_health_alerts_import_pipeline.sql',
      '20260805130000_health_alerts_ticho_je_taky_porucha.sql',
      '20260813183836_alert_stripe_zahozena_udalost.sql',
    ],
    'nová migrace přepisuje system_health_alerts bez security_invoker — view tím obejde RLS'
  );
});
