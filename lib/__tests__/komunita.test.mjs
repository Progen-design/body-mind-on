/**
 * KOMUNITA — ROZHODNUTÍ, KTERÁ SE DAJÍ OVĚŘIT BEZ DATABÁZE.
 *
 * `test:unit` musí projít i bez spojení na Supabase, takže se testují čisté
 * funkce vytažené z `lib/community.js`: jméno autora, denní strop a to, jestli
 * uživatel potřebuje potvrdit pravidla. Zbytek (RLS, signed URL, sharp) se
 * ověřuje v produkci, tady by to byl jen mock kontrolující sám sebe.
 *
 * Zdrojové kontroly dole hlídají věci, které se snadno tiše rozejdou:
 * duplicitu nahlášení, admin gate a to, že souhlas s komunitou nespadl do
 * seznamu, který vyžaduje registrace.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DUVODY_NAHLASENI,
  MAX_PRISPEVKU_DENNE,
  jeNadDennimLimitem,
  potrebujeSouhlasKomunity,
  vyberJmenoAutora,
} from '../community.js';
import { DRUHY_SOUHLASU, DRUH_SOUHLASU_KOMUNITA } from '../souhlasyKonstanty.js';

const KOREN = join(import.meta.dirname, '..', '..');
const cti = (p) => readFileSync(join(KOREN, p), 'utf8');

test('jméno autora: přezdívka vyhrává nad jménem i e-mailem', () => {
  assert.equal(
    vyberJmenoAutora({ prezdivka: 'Honza', jmenoProfilu: 'Jan Novák', email: 'jan@example.com' }),
    'Honza',
  );
  assert.equal(vyberJmenoAutora({ jmenoProfilu: 'Jan Novák', email: 'jan@example.com' }), 'Jan Novák');
});

test('celý e-mail se do komunity nedostane ani jako záloha', () => {
  const jmeno = vyberJmenoAutora({ email: 'jan.novak@example.com' });

  assert.equal(jmeno, 'jan.novak');
  assert.doesNotMatch(jmeno, /@/, 'e-mailová adresa by se ukázala ostatním členům');
});

test('bez čehokoli je autor „Člen", ne prázdno', () => {
  assert.equal(vyberJmenoAutora({}), 'Člen');
  assert.equal(vyberJmenoAutora({ prezdivka: '   ' }), 'Člen', 'samé mezery nejsou jméno');
  assert.equal(vyberJmenoAutora(), 'Člen');
});

test('jméno se ořezává na 100 znaků — sloupec víc neunese', () => {
  assert.equal(vyberJmenoAutora({ prezdivka: 'x'.repeat(250) }).length, 100);
});

test('denní limit pouští devátý příspěvek a zastaví desátý', () => {
  assert.equal(MAX_PRISPEVKU_DENNE, 10);
  assert.equal(jeNadDennimLimitem(0), false);
  assert.equal(jeNadDennimLimitem(MAX_PRISPEVKU_DENNE - 1), false);
  assert.equal(jeNadDennimLimitem(MAX_PRISPEVKU_DENNE), true, 'limit je „nejvýš 10", ne „11"');
  assert.equal(jeNadDennimLimitem(99), true);
});

test('nespočitatelný počet limit nezavře — chyba dotazu nesmí zablokovat psaní', () => {
  assert.equal(jeNadDennimLimitem(NaN), false);
  assert.equal(jeNadDennimLimitem(undefined), false);
});

test('souhlas: bez řádku se ptáme, s platným ne', () => {
  assert.equal(potrebujeSouhlasKomunity([]), true);
  assert.equal(potrebujeSouhlasKomunity(null), true, 'chybějící odpověď není souhlas');
  assert.equal(potrebujeSouhlasKomunity([{ odvolano_at: null }]), false);
});

test('odvolaný souhlas neplatí, i když řádek v logu zůstává', () => {
  // GDPR čl. 7: odvolání nesmí smazat důkaz, že souhlas kdysi byl — řádek
  // tedy zůstává a rozhoduje `odvolano_at`.
  assert.equal(potrebujeSouhlasKomunity([{ odvolano_at: '2026-09-23T10:00:00Z' }]), true);
  // Odvolaný i nový platný: platí ten nový.
  assert.equal(
    potrebujeSouhlasKomunity([{ odvolano_at: '2026-09-01T10:00:00Z' }, { odvolano_at: null }]),
    false,
  );
});

test('souhlas s komunitou NENÍ v seznamu, který vyžaduje registrace', () => {
  // `DRUHY_SOUHLASU.some(...)` v lib/registration/bodyMetricsRegistration.js
  // vyžaduje seznam CELÝ. Kdyby tam „komunita" přibyla, nikdo by nezaložil
  // účet, dokud neodsouhlasí pravidla komunity — a to při registraci nikdo
  // nenabízí.
  assert.ok(!DRUHY_SOUHLASU.includes(DRUH_SOUHLASU_KOMUNITA), 'komunita zablokovala registraci');
  assert.equal(DRUH_SOUHLASU_KOMUNITA, 'komunita');

  const migrace = cti('supabase/migrations/20260923010000_komunita_pr2.sql');
  assert.match(migrace, /'komunita'::text/, 'CHECK v migraci nový druh nezná');
});

test('důvody nahlášení jsou stejné na serveru i v UI', () => {
  const zUi = cti('src/components/komunita/typy.ts');
  for (const d of DUVODY_NAHLASENI) {
    assert.ok(zUi.includes(d.label), `UI nezná důvod „${d.label}"`);
  }
  assert.equal(DUVODY_NAHLASENI.length, 4);
});

test('nahlášení: duplicita je 200, ne chyba', () => {
  const endpoint = cti('api/community/report.js');

  assert.match(endpoint, /duplicitni: true/, 'duplicita se neřeší');
  assert.match(endpoint, /error\.code === '23505'/, 'souběh dvou kliků spadne na unikátním indexu');
  assert.doesNotMatch(endpoint, /status\(409\)/, 'duplicita nemá být chyba uživatele');

  const migrace = cti('supabase/migrations/20260923010000_komunita_pr2.sql');
  assert.match(migrace, /community_reports_reporter_post_uniq[\s\S]{0,200}where post_id is not null/i);
  assert.match(migrace, /community_reports_reporter_reply_uniq[\s\S]{0,200}where reply_id is not null/i);
});

test('admin endpointy stojí na isAdmin, gate je před rozvětvením', () => {
  const endpoint = cti('api/admin/community-reports.js');

  assert.match(endpoint, /import \{ isAdmin \} from '\.\.\/\.\.\/lib\/adminAuth\.js'/);
  const gate = endpoint.indexOf('if (!isAdmin(req))');
  const prvniVetev = endpoint.indexOf("if (req.method === 'GET')");
  assert.ok(gate > 0 && gate < prvniVetev, 'isAdmin se kontroluje až uvnitř větve');
});

test('mazání cizího příspěvku smí jen admin', () => {
  const endpoint = cti('api/community/post/[id].js');

  assert.match(endpoint, /const jeAdmin = isAdmin\(req\);/);
  assert.match(endpoint, /if \(!jeAdmin && post\.user_id !== user\.id\)/, 'cizí příspěvek smaže kdokoli');
  // Vlastník musí mít v DELETE pojistku na user_id; admin ji mít nesmí,
  // jinak by cizí příspěvek nikdy nesmazal.
  assert.match(endpoint, /if \(!jeAdmin\) mazani = mazani\.eq\('user_id', user\.id\);/);
});

test('POST /api/community bez souhlasu vrací 403 s needs_consent', () => {
  const endpoint = cti('api/community/index.js');

  assert.match(endpoint, /needs_consent: true/);
  assert.match(endpoint, /'Nejdřív potvrď pravidla komunity\.'/);

  // apiFetch překládá každou 403 na hlášku o členství — komunita musí mít
  // výjimku, jinak uživatel místo pokynu čte něco o neaktivním tarifu.
  const api = cti('src/lib/api.ts');
  assert.match(api, /odpoved\.status === 403 && telo\?\.needs_consent === true/);
});

test('smazání účtu uklidí fotky ze storage — kaskáda je nemaže', () => {
  const endpoint = cti('api/delete-account.js');

  assert.match(endpoint, /smazFotkyUzivatele\(userId\)/);
  // Musí běžet PŘED delete_user_data: potom by nebylo podle čeho soubory najít.
  assert.ok(
    endpoint.indexOf('smazFotkyUzivatele') < endpoint.indexOf("rpc('delete_user_data'"),
    'úklid fotek běží až po smazání řádků',
  );
  // A nesmí shodit smazání účtu.
  assert.match(endpoint, /catch \(err\) \{[\s\S]{0,200}uklid fotek komunity selhal/);
});
