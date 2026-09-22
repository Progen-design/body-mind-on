/**
 * OAUTH ÚDAJE INTEGRACÍ — DB MÁ PŘEDNOST, ENV JE ZÁLOHA.
 *
 * 22. 9. 2026 přibyla admin stránka `/admin/integrace`, kde se Client ID
 * a Secret zadávají v aplikaci místo ve Vercelu. Pořadí zdrojů je to
 * podstatné: kdyby env přebíjelo DB, stránka by tiše nedělala nic a nikdo
 * by nepoznal proč. A kdyby fallback nefungoval, integrace by spadla všem
 * ve chvíli, kdy tabulka ještě žádný řádek nemá.
 *
 * Do žádné DB se nesahá — `test:unit` musí projít i bez spojení na Supabase.
 * Pořadí zdrojů je proto čistá funkce `vyberKlientskeUdaje()`; zbytek se
 * ověřuje ze zdrojáků.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');

/** 64 hex znaků — testovací kořenový klíč, aby šlo šifrovat i dešifrovat. */
process.env.WITHINGS_TOKEN_ENCRYPTION_KEY =
  process.env.WITHINGS_TOKEN_ENCRYPTION_KEY
  || '0'.repeat(63) + '1';

const { encryptSecret, decryptSecret } = await import('../secretBox.js');
const { maskaKonce, vyberKlientskeUdaje } = await import('../integrationCredentials.js');

test('šifrování je obousměrné a tvar odpovídá tomu, co leží v DB', () => {
  const box = encryptSecret('super-tajny-secret');

  assert.equal(box.v, 1);
  assert.equal(box.alg, 'aes-256-gcm');
  assert.ok(box.iv && box.tag && box.data, 'chybí část šifrovaného tvaru');
  assert.doesNotMatch(JSON.stringify(box), /super-tajny-secret/, 'tajemství prosáklo do výstupu');
  assert.equal(decryptSecret(box), 'super-tajny-secret');
});

test('prázdné tajemství se neuloží — prázdný secret by vypadal jako nastavený', () => {
  assert.throws(() => encryptSecret(''), /prázdné tajemství/i);
});

test('maska ukazuje posledních šest znaků, krátkou hodnotu neprozradí', () => {
  assert.equal(maskaKonce('abcdefghijklmnop'), '••••klmnop');
  assert.equal(maskaKonce('abc123'), 'nastaveno', 'u krátké hodnoty by „posledních šest" bylo celé');
  assert.equal(maskaKonce(''), null);
  assert.equal(maskaKonce(null), null);
});

/**
 * FALLBACK. Pořadí zdrojů je čistá funkce `vyberKlientskeUdaje()` — do
 * Supabase ani do env se kvůli tomuhle testu nesahá. Že ji withingsServer
 * opravdu používá (a nepočítá si pořadí po svém), hlídá test pod ní.
 */
test('DB má přednost před env', () => {
  const vysledek = vyberKlientskeUdaje(
    { clientId: 'z-databaze', clientSecret: 'secret-z-databaze' },
    { clientId: 'z-env', clientSecret: 'secret-z-env' },
  );

  assert.equal(vysledek.zdroj, 'db', 'env přebilo DB — admin stránka by tiše nedělala nic');
  assert.equal(vysledek.clientId, 'z-databaze');
  assert.equal(vysledek.clientSecret, 'secret-z-databaze');
});

test('bez řádku v DB se spadne zpátky na env', () => {
  const vysledek = vyberKlientskeUdaje(null, { clientId: 'z-env', clientSecret: 'secret-z-env' });

  assert.equal(vysledek.zdroj, 'env', 'bez fallbacku by integrace spadla všem, než admin stránku poprvé použije');
  assert.equal(vysledek.clientId, 'z-env');
});

test('půlka údajů se nepočítá za nastavenou integraci', () => {
  // Jen ID bez secretu OAuth nespustí — a „nastaveno" by o tom lhalo.
  assert.equal(vyberKlientskeUdaje({ clientId: 'jen-id' }, null).zdroj, null);
  assert.equal(vyberKlientskeUdaje(null, { clientId: 'jen-id' }).zdroj, null);
  assert.equal(vyberKlientskeUdaje({ clientId: 'jen-id' }, { clientId: 'env-id', clientSecret: 'env-secret' }).zdroj, 'env');
});

test('bez DB i bez env není integrace nakonfigurovaná', () => {
  const vysledek = vyberKlientskeUdaje(null, null);

  assert.equal(vysledek.zdroj, null, 'null znamená „nikde", ne „sáhlo se po env"');
  assert.equal(vysledek.clientId, '');
});

test('withingsServer čte údaje přes tuhle funkci, ne vlastním pořadím', () => {
  const server = readFileSync(join(KOREN, 'lib', 'withingsServer.js'), 'utf8');

  assert.match(server, /import \{[^}]*vyberKlientskeUdaje[^}]*\} from '\.\/integrationCredentials\.js'/);
  assert.match(
    server,
    /const zDb = await nactiUdajeIntegrace\(INTEGRACE_WITHINGS\);\s*return vyberKlientskeUdaje\(zDb, \{/,
    'resolveWithingsCredentials si pořadí zdrojů počítá po svém',
  );
  // Klientské údaje se nesmí číst z env mimo ten jeden fallback.
  const zEnv = server.match(/envValue\('WITHINGS_CLIENT_', '(ID|SECRET)'\)/g) ?? [];
  assert.equal(zEnv.length, 2, `WITHINGS_CLIENT_* se z env čte ${zEnv.length}×, čekaly se 2 (jen ve fallbacku)`);
});

/**
 * ADMIN ENDPOINT. Auth a tvar odpovědi se čtou ze zdroje — volat handler
 * by znamenalo tahat sem Supabase klienta.
 */
test('oba směry endpointu jsou za isAdmin gatem', () => {
  const endpoint = readFileSync(join(KOREN, 'api', 'admin', 'integrations', 'withings.js'), 'utf8');

  assert.match(endpoint, /import \{ isAdmin \} from '\.\.\/\.\.\/\.\.\/lib\/adminAuth\.js'/);
  // Gate musí stát PŘED rozvětvením na GET/POST, ne uvnitř jedné větve.
  const gate = endpoint.indexOf('if (!isAdmin(req))');
  const prvniVetev = endpoint.indexOf("if (req.method === 'GET')");
  assert.ok(gate > 0, 'chybí isAdmin gate');
  assert.ok(gate < prvniVetev, 'isAdmin se kontroluje až uvnitř větve — druhá metoda by prošla');
  assert.match(endpoint, /return res\.status\(403\)\.json\(\{ error: 'Neoprávněný přístup' \}\)/);
});

test('endpoint nikdy nevrací client_secret, ani zašifrovaný', () => {
  const endpoint = readFileSync(join(KOREN, 'api', 'admin', 'integrations', 'withings.js'), 'utf8');

  // Každý `res.json(...)` se prohledá na cokoli, co nese secret.
  const odpovedi = endpoint.match(/res\.status\(\d+\)\.json\(\{[\s\S]*?\}\)/g) ?? [];
  assert.ok(odpovedi.length >= 3, 'čekaly se aspoň tři odpovědi');

  for (const odpoved of odpovedi) {
    assert.doesNotMatch(odpoved, /client_secret(?!:\s*clientSecret\b)/, `secret v odpovědi: ${odpoved}`);
    assert.doesNotMatch(odpoved, /clientSecret/, `secret v odpovědi: ${odpoved}`);
    assert.doesNotMatch(odpoved, /client_secret_encrypted/, `zašifrovaný secret v odpovědi: ${odpoved}`);
  }
});

test('migrace zavírá RLS a pouští jen service_role', () => {
  const migrace = readFileSync(
    join(KOREN, 'supabase', 'migrations', '20260922213000_integration_credentials.sql'),
    'utf8',
  );

  assert.match(migrace, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migrace, /CREATE POLICY integration_credentials_service_role_all[\s\S]{0,200}TO service_role/i);
  assert.match(migrace, /REVOKE ALL ON TABLE public\.integration_credentials FROM anon/i);
  assert.match(migrace, /REVOKE ALL ON TABLE public\.integration_credentials FROM authenticated/i);
  assert.doesNotMatch(migrace, /TO (anon|authenticated)\b/i, 'anon nebo authenticated dostali přístup');
});
