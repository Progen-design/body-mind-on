/**
 * KOMUNITA: ČÍST S AKTIVNÍM ČLENSTVÍM, PSÁT JEN ON CLUB (a tým).
 *
 * Celé endpointy api/community/* se tu projdou s atrapou Supabase
 * (nastavSupabaseServerProTesty) — brána musí stát na serveru, ne jen v UI.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { nastavSupabaseServerProTesty } from '../supabaseServer.js';
import {
  KOMUNITA_BEZ_PREDPLATNEHO,
  KOMUNITA_PSANI_JEN_ON_CLUB,
  pravaKomunity,
} from '../membershipHelpers.js';
import komunita from '../../api/community/index.js';
import reply from '../../api/community/reply.js';
import like from '../../api/community/like.js';
import tema from '../../api/community/topic/[id].js';
import kategorie from '../../api/community/categories.js';
import nahlaseni from '../../api/community/report.js';

const DEN = 86_400_000;
const za = (d) => new Date(Date.now() + d * DEN).toISOString();

/** Uživatelé podle tokenu + jejich členství. */
const UZIVATELE = {
  start: { user: { id: 'u-start', email: 'start@seznam.cz' }, clenstvi: { tier: 'START', status: 'active', trial_ends_at: null } },
  startTrial: { user: { id: 'u-trial', email: 'trial@seznam.cz' }, clenstvi: { tier: 'START', status: 'trial', trial_ends_at: za(3) } },
  onClub: { user: { id: 'u-club', email: 'club@seznam.cz' }, clenstvi: { tier: 'ON_CLUB', status: 'active', trial_ends_at: null } },
  prosly: { user: { id: 'u-prosly', email: 'prosly@seznam.cz' }, clenstvi: { tier: 'START', status: 'trial', trial_ends_at: za(-2) } },
  zruseny: { user: { id: 'u-zrus', email: 'zrus@seznam.cz' }, clenstvi: { tier: 'ON_CLUB', status: 'canceled', trial_ends_at: null } },
  admin: { user: { id: 'u-admin', email: 'tym@bodyandmindon.cz' }, clenstvi: null },
};

/**
 * Atrapa Supabase klienta: `from(tabulka)` vrací řetězitelný dotaz, který se
 * „await" rozbalí na odpověď podle tabulky a operace. Zápisy se zaznamenají.
 */
function atrapaSupabase() {
  const zapisy = [];
  const podleId = Object.fromEntries(Object.values(UZIVATELE).map((u) => [u.user.id, u]));

  function dotaz(tabulka) {
    const stav = { tabulka, op: 'select', filtry: {}, radek: null };
    const odpoved = () => {
      if (stav.op === 'insert') {
        zapisy.push({ tabulka, radek: stav.radek });
        return { data: { id: `${tabulka}-1`, created_at: '2026-09-25T10:00:00Z', reply_count: 0, like_count: 0, ...stav.radek }, error: null };
      }
      if (stav.op === 'delete') { zapisy.push({ tabulka, smazano: true }); return { error: null }; }
      switch (tabulka) {
        case 'memberships': return { data: podleId[stav.filtry.user_id]?.clenstvi ?? null, error: null };
        case 'souhlasy_uzivatelu': return { data: [{ odvolano_at: null }], error: null };
        case 'profiles': return { data: stav.jeden ? { preferred_address: 'Honzo', avatar_url: null } : [], error: null };
        case 'community_posts':
          if (stav.hlava) return { count: 0, error: null };
          if (stav.jeden) return { data: { id: 'p-1', user_id: 'u-jiny', is_hidden: false, like_count: 1 }, error: null };
          return { data: [], error: null };
        case 'community_likes': return { data: stav.jeden ? null : [], error: null };
        case 'community_reports': return { data: null, error: null };
        default: return { data: stav.jeden ? null : [], error: null };
      }
    };
    const b = {
      select(_s, opt) { if (opt?.head) stav.hlava = true; return b; },
      insert(radek) { stav.op = 'insert'; stav.radek = radek; return b; },
      update() { stav.op = 'update'; return b; },
      delete() { stav.op = 'delete'; return b; },
      eq(k, v) { stav.filtry[k] = v; return b; },
      maybeSingle() { stav.jeden = true; return b; },
      single() { stav.jeden = true; return b; },
      then(ok, chyba) { return Promise.resolve(odpoved()).then(ok, chyba); },
    };
    for (const m of ['or', 'order', 'range', 'in', 'gte', 'lte', 'limit', 'not', 'neq', 'is']) b[m] = () => b;
    return b;
  }

  return {
    zapisy,
    klient: {
      auth: {
        async getUser(token) {
          const u = UZIVATELE[token];
          return u ? { data: { user: u.user }, error: null } : { data: { user: null }, error: new Error('bad token') };
        },
      },
      from: dotaz,
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    },
  };
}

let db;
before(() => {
  process.env.ADMIN_EMAILS = 'tym@bodyandmindon.cz';
});
after(() => nastavSupabaseServerProTesty(null));

async function zavolej(handler, { token, method = 'GET', body = {}, query = {} }) {
  db = atrapaSupabase();
  nastavSupabaseServerProTesty(db.klient);
  const res = { stav: null, telo: null };
  res.status = (s) => { res.stav = s; return res; };
  res.json = (t) => { res.telo = t; return res; };
  const puvodni = console.error;
  console.error = () => {};
  try {
    await handler({ method, headers: { authorization: `Bearer ${token}` }, body, query }, res);
  } finally {
    console.error = puvodni;
  }
  return res;
}

const PRISPEVEK = { content: 'Dnes 5 km', souhlas_s_pravidly: true };

// ---------------------------------------------------------------- pravidla

test('pravaKomunity: START čte, ON CLUB čte i píše, prošlý/zrušený nic', () => {
  assert.deepEqual(pravaKomunity(UZIVATELE.start.clenstvi), { cist: true, psat: false });
  assert.deepEqual(pravaKomunity(UZIVATELE.startTrial.clenstvi), { cist: true, psat: false });
  assert.deepEqual(pravaKomunity(UZIVATELE.onClub.clenstvi), { cist: true, psat: true });
  assert.deepEqual(pravaKomunity(UZIVATELE.prosly.clenstvi), { cist: false, psat: false });
  assert.deepEqual(pravaKomunity(UZIVATELE.zruseny.clenstvi), { cist: false, psat: false });
  assert.deepEqual(pravaKomunity(null), { cist: false, psat: false });
  assert.deepEqual(pravaKomunity({ tier: 'ON_CLUB', status: 'pending_payment' }), { cist: false, psat: false });
});

// ---------------------------------------------------------------- psaní

test('START POST příspěvku → 403 „Psát do komunity můžeš v ON CLUBU.", nic se nezapíše', async () => {
  const res = await zavolej(komunita, { token: 'start', method: 'POST', body: PRISPEVEK });
  assert.equal(res.stav, 403);
  assert.equal(res.telo.error, 'Psát do komunity můžeš v ON CLUBU.');
  assert.equal(KOMUNITA_PSANI_JEN_ON_CLUB, 'Psát do komunity můžeš v ON CLUBU.');
  assert.equal(db.zapisy.length, 0);
});

test('START v trialu POST → taky 403 (psaní je jen ON CLUB)', async () => {
  const res = await zavolej(komunita, { token: 'startTrial', method: 'POST', body: PRISPEVEK });
  assert.equal(res.stav, 403);
  assert.equal(res.telo.error, KOMUNITA_PSANI_JEN_ON_CLUB);
});

test('ON CLUB POST příspěvku → 201 a příspěvek se zapíše', async () => {
  const res = await zavolej(komunita, { token: 'onClub', method: 'POST', body: PRISPEVEK });
  assert.equal(res.stav, 201);
  assert.equal(res.telo.topic.content, 'Dnes 5 km');
  assert.ok(db.zapisy.some((z) => z.tabulka === 'community_posts' && z.radek.user_id === 'u-club'));
});

test('START komentář i lajk → 403; ON CLUB komentář 201, lajk 200', async () => {
  assert.equal((await zavolej(reply, { token: 'start', method: 'POST', body: { topic_id: 'p-1', content: 'Super' } })).stav, 403);
  assert.equal((await zavolej(like, { token: 'start', method: 'POST', body: { post_id: 'p-1' } })).telo.error, KOMUNITA_PSANI_JEN_ON_CLUB);
  assert.equal((await zavolej(reply, { token: 'onClub', method: 'POST', body: { topic_id: 'p-1', content: 'Super', souhlas_s_pravidly: true } })).stav, 201);
  assert.equal((await zavolej(like, { token: 'onClub', method: 'POST', body: { post_id: 'p-1' } })).stav, 200);
});

test('admin projde i bez členství — příspěvek, komentář, čtení', async () => {
  assert.equal((await zavolej(komunita, { token: 'admin', method: 'POST', body: PRISPEVEK })).stav, 201);
  assert.equal((await zavolej(reply, { token: 'admin', method: 'POST', body: { topic_id: 'p-1', content: 'Tým' } })).stav, 201);
  const cteni = await zavolej(komunita, { token: 'admin' });
  assert.equal(cteni.stav, 200);
  assert.equal(cteni.telo.muze_psat, true);
});

// ---------------------------------------------------------------- čtení

test('prošlý trial GET → 403 „Komunita je dostupná s aktivním předplatným."', async () => {
  const res = await zavolej(komunita, { token: 'prosly' });
  assert.equal(res.stav, 403);
  assert.equal(res.telo.error, 'Komunita je dostupná s aktivním předplatným.');
  assert.equal(KOMUNITA_BEZ_PREDPLATNEHO, res.telo.error);
});

test('zrušené předplatné: feed, téma, kategorie i nahlášení → 403', async () => {
  for (const [nazev, handler, opts] of [
    ['feed', komunita, {}],
    ['téma', tema, { query: { id: 'p-1' } }],
    ['kategorie', kategorie, {}],
    ['nahlášení', nahlaseni, { method: 'POST', body: { post_id: 'p-1', duvod: 'spam' } }],
  ]) {
    const res = await zavolej(handler, { token: 'zruseny', ...opts });
    assert.equal(res.stav, 403, nazev);
    assert.equal(res.telo.error, KOMUNITA_BEZ_PREDPLATNEHO, nazev);
  }
});

test('START GET feedu → 200 s muze_psat: false; ON CLUB muze_psat: true', async () => {
  const start = await zavolej(komunita, { token: 'start' });
  assert.equal(start.stav, 200);
  assert.equal(start.telo.muze_psat, false);
  const club = await zavolej(komunita, { token: 'onClub' });
  assert.equal(club.telo.muze_psat, true);
});

// ---------------------------------------------------------------- napojení

test('brána stojí v každém endpointu hned po přihlášení (ne až v UI)', () => {
  const koren = join(import.meta.dirname, '..', '..', 'api', 'community');
  for (const [soubor, psani] of [
    ['index.js', "req.method === 'POST'"], ['reply.js', 'true'], ['like.js', 'true'],
    ['topic/[id].js', null], ['categories.js', null], ['report.js', null],
  ]) {
    const kod = readFileSync(join(koren, soubor), 'utf8');
    assert.match(kod, /const pristup = await overPravaKomunity\(/, soubor);
    assert.match(kod, /if \(!pristup\.allowed\) return res\.status\(pristup\.status\)/, soubor);
    if (psani) assert.ok(kod.includes(`{ psani: ${psani} }`), soubor);
  }
  const lib = readFileSync(join(import.meta.dirname, '..', 'community.js'), 'utf8');
  assert.match(lib, /if \(jeAdminKomunity\(user\)\) return \{ allowed: true/);
  assert.match(lib, /return requireCommunityAccess\(user\.id, \{ psani \}\)/);
});
