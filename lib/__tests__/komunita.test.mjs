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

/**
 * DODATEK PR 2 — komentáře v kartě, sekce Dotazy a týmová odpověď.
 */
test('migrace zakládá Dotazy idempotentně a přidává is_team', () => {
  const migrace = cti('supabase/migrations/20260923010000_komunita_pr2.sql');

  assert.match(migrace, /where not exists \(\s*select 1 from public\.community_categories where slug = 'dotazy'/);
  assert.match(migrace, /'Dotazy', 'dotazy'/);
  assert.match(
    migrace,
    /community_categories \(name, slug, description, sort_order\)[\s\S]{0,240}BMON\.', 5/,
    'Dotazy mají stát mezi Můj progres (0) a Trénink (10)',
  );
  assert.match(migrace, /add column if not exists is_team boolean not null default false/);
});

test('is_team nastavuje server podle tokenu, nikdy klient', () => {
  const reply = cti('api/community/reply.js');

  assert.match(reply, /const jeTym = jeAdminSUctem\(req\);/);
  assert.match(reply, /is_team: jeTym,/);
  // Kdyby se příznak bral z těla, označí se za tým kdokoli.
  assert.doesNotMatch(reply, /is_team:\s*req\.body/, 'is_team chodí z prohlížeče');
  assert.doesNotMatch(reply, /body\?\.is_team/, 'is_team chodí z prohlížeče');
});

test('admin token na týmovou odpověď jde hlavičkou, ne v URL ani v těle', () => {
  const auth = cti('lib/adminAuth.js');

  assert.match(auth, /req\.headers\['x-admin-token'\]/);
  // Authorization tu nést ADMIN_TOKEN nemůže: odpověď potřebuje skutečného
  // autora, takže tam jede uživatelská session.
  assert.doesNotMatch(auth, /req\.query/, 'token v query by skončil v logu');
  assert.doesNotMatch(auth, /req\.body/, 'token v těle by skončil v logu');
});

test('souhlas s pravidly platí i pro komentáře, tým je z něj ven', () => {
  const reply = cti('api/community/reply.js');

  assert.match(reply, /if \(!jeTym && !\(await maSouhlasKomunity\(user\.id\)\)\)/);
  assert.match(reply, /needs_consent: true/);
});

test('karta bere komentáře z last_replies, nechodí si pro ně zvlášť', () => {
  const karta = cti('src/components/komunita/KartaPrispevku.tsx');
  const komentare = cti('src/components/komunita/KomentareVKarte.tsx');

  assert.match(karta, /odpovedi=\{prispevek\.last_replies \?\? \[\]\}/);
  // Jediné volání v komentářích je odeslání nové odpovědi. Kdyby si každá
  // karta tahala vlákno sama, znamenal by jeden scroll feedu dvacet dotazů.
  // Počítá se volání, ne import — `apiFetch(` i `apiFetch<T>(`.
  const volani = komentare.match(/await apiFetch/g) ?? [];
  assert.equal(volani.length, 1, `komentáře volají API ${volani.length}×, čekalo se jen odeslání`);
  assert.match(komentare, /'\/api\/community\/reply'/);
});

test('„Čeká na odpověď" se ukazuje jen v Dotazech', () => {
  const karta = cti('src/components/komunita/KartaPrispevku.tsx');

  assert.match(karta, /\{jeDotaz && !prispevek\.team_answered && \(/);
  // Jinde by štítek sliboval reakci týmu, kterou nikdo neslíbil.
  assert.doesNotMatch(karta, /!prispevek\.team_answered && \(\s*<span[\s\S]{0,80}Čeká/, 'štítek není podmíněný kategorií');
});

test('team_answered se počítá ze všech odpovědí, ne jen z náhledu', () => {
  const index = cti('api/community/index.js');

  // Náhled drží jen dvě odpovědi — kdyby se příznak počítal z nich, dotaz
  // s týmovou odpovědí na čtvrtém místě by vypadal jako nevyřízený.
  assert.match(index, /const maOdpovedTymu = new Set\(allReplies\.filter\(\(r\) => r\.is_team\)/);
  assert.match(index, /team_answered: maOdpovedTymu\.has\(t\.id\)/);
});

test('fronta dotazů je za admin gatem a odpovídá se přes /api/community/reply', () => {
  const endpoint = cti('api/admin/community-questions.js');

  assert.match(endpoint, /if \(!isAdmin\(req\)\) return res\.status\(403\)/);
  // Druhá cesta do community_replies by znamenala druhé místo, kde jde
  // zapomenout na is_team.
  assert.doesNotMatch(endpoint, /from\('community_replies'\)\s*\.insert/, 'admin endpoint vkládá odpovědi sám');

  const ui = cti('src/components/admin/AdminDotazy.tsx');
  assert.match(ui, /'\/api\/community\/reply'/);
  assert.match(ui, /'x-admin-token': token/);
});
