/**
 * Poukazy (public.vouchers) — „START – 1 měsíc zdarma".
 *
 * Nejdůležitější: kód nejde uplatnit dvakrát ani při souběhu. Atrapa
 * databáze níž vyhodnocuje UPDATE s podmínkami atomicky (jako Postgres),
 * takže test souběhu je skutečný, ne jen tvar zdrojáku.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  HLASKY_POUKAZU,
  duvodNeplatnosti,
  konecTrialu,
  normalizujKod,
  overPoukaz,
  poukazUzivatele,
  uplatniPoukaz,
  vratPoukaz,
} from '../poukazy.js';
import { membershipFromRegistration } from '../membershipRegistration.js';
import { stripeTrialProCheckout } from '../trialEligibility.js';

const KOREN = join(import.meta.dirname, '..', '..');
const cti = (p) => readFileSync(join(KOREN, p), 'utf8');

const TED = Date.parse('2026-09-24T12:00:00Z');
const ZITRA_ROK = '2027-09-24T00:00:00Z';

// ---------------------------------------------------------------- atrapa tabulky vouchers

/**
 * Minimální PostgREST-like klient nad polem řádků. UPDATE se vyhodnotí
 * najednou (filtr + zápis v jednom kroku), stejně jako jeden SQL UPDATE.
 */
function atrapa(radky) {
  const tabulka = radky.map((r) => ({ ...r }));
  const dotaz = () => {
    const filtry = [];
    let zmena = null;
    let jeUpdate = false;
    let limit = null;
    const q = {
      select() { return q; },
      update(z) { jeUpdate = true; zmena = z; return q; },
      eq(k, v) { filtry.push((r) => r[k] === v); return q; },
      gte(k, v) { filtry.push((r) => r[k] != null && Date.parse(r[k]) >= Date.parse(v)); return q; },
      order() { return q; },
      limit(n) { limit = n; return q; },
      async maybeSingle() {
        const shoda = tabulka.filter((r) => filtry.every((f) => f(r)));
        const vybrane = limit ? shoda.slice(0, limit) : shoda;
        if (jeUpdate) vybrane.forEach((r) => Object.assign(r, zmena));
        return { data: vybrane[0] ? { ...vybrane[0] } : null, error: null };
      },
      then(ok, ko) {
        // `await db.from().update().eq()…` bez maybeSingle (vratPoukaz)
        const shoda = tabulka.filter((r) => filtry.every((f) => f(r)));
        if (jeUpdate) shoda.forEach((r) => Object.assign(r, zmena));
        return Promise.resolve({ data: null, error: null }).then(ok, ko);
      },
    };
    return q;
  };
  return { tabulka, from: () => dotaz() };
}

const poukaz = (kod, extra = {}) => ({
  code: kod, status: 'unused', discount_days: 30, valid_until: ZITRA_ROK, redeemed_by: null, redeemed_at: null, ...extra,
});

// ---------------------------------------------------------------- čisté funkce

test('normalizace kódu: velká písmena, mezery pryč, pomlčky doplní', () => {
  assert.equal(normalizujKod('abcd-1e2f-g3hi'), 'ABCD-1E2F-G3HI');
  assert.equal(normalizujKod('  ABCD 1E2F G3HI '), 'ABCD-1E2F-G3HI');
  assert.equal(normalizujKod('abcd1e2fg3hi'), 'ABCD-1E2F-G3HI');
  assert.equal(normalizujKod('ABCD–1E2F—G3HI'), 'ABCD-1E2F-G3HI', 'pomlčky z telefonu (– —)');
  for (const nesmysl of ['', '   ', 'ABCD-1E2F', 'ABCD-1E2F-G3HI-JKLM', 'ABCD-1E2F-G3H!', null, 42, 'x'.repeat(100)]) {
    assert.equal(normalizujKod(nesmysl), null, String(nesmysl));
  }
});

test('důvod neplatnosti: neexistuje / použitý / zrušený / prošlý', () => {
  assert.equal(duvodNeplatnosti(null, TED), 'neexistuje');
  assert.equal(duvodNeplatnosti(poukaz('A', { status: 'redeemed' }), TED), 'pouzity');
  assert.equal(duvodNeplatnosti(poukaz('A', { status: 'void' }), TED), 'zruseny');
  assert.equal(duvodNeplatnosti(poukaz('A', { status: 'expired' }), TED), 'expirovany');
  assert.equal(duvodNeplatnosti(poukaz('A', { valid_until: '2026-09-01T00:00:00Z' }), TED), 'expirovany');
  assert.equal(duvodNeplatnosti(poukaz('A', { valid_until: null }), TED), 'expirovany', 'bez valid_until neplatí (valid_until >= now())');
  assert.equal(duvodNeplatnosti(poukaz('A'), TED), null);
});

test('konec trialu: 30 dní od začátku, nesmyslný počet dní → 30', () => {
  assert.equal(konecTrialu('2026-09-24T12:00:00.000Z', 30), '2026-10-24T12:00:00.000Z');
  assert.equal(konecTrialu('2026-09-24T12:00:00.000Z', 0), '2026-10-24T12:00:00.000Z');
  assert.equal(konecTrialu('2026-09-24T12:00:00.000Z', 9999), '2026-10-24T12:00:00.000Z');
});

test('membership START: s poukazem 30 dní, bez něj dál 7', () => {
  const zacatek = '2026-09-24T12:00:00.000Z';
  assert.equal(membershipFromRegistration('START', zacatek, 30).trial_ends_at, '2026-10-24T12:00:00.000Z');
  assert.equal(membershipFromRegistration('START', zacatek).trial_ends_at, '2026-10-01T12:00:00.000Z');
  assert.equal(membershipFromRegistration('START', zacatek, -5).trial_ends_at, '2026-10-01T12:00:00.000Z', 'nesmysl → 7');
  assert.equal(membershipFromRegistration('ON_CLUB', zacatek, 30).trial_ends_at, null, 'poukaz je jen pro START');
});

// ---------------------------------------------------------------- ověření a uplatnění

test('ověření nic nezapisuje', async () => {
  const db = atrapa([poukaz('ABCD-EFGH-IJKL')]);
  assert.deepEqual(await overPoukaz(db, 'abcd-efgh-ijkl', TED), { platny: true, dny: 30 });
  assert.equal(db.tabulka[0].status, 'unused');
  assert.deepEqual(await overPoukaz(db, 'XXXX-XXXX-XXXX', TED), { platny: false, duvod: 'neexistuje', hlaska: HLASKY_POUKAZU.neexistuje });
  assert.deepEqual(await overPoukaz(db, 'nesmysl', TED), { platny: false, duvod: 'tvar', hlaska: HLASKY_POUKAZU.tvar });
});

test('uplatnění: zapíše redeemed_by, redeemed_at a status redeemed', async () => {
  const db = atrapa([poukaz('ABCD-EFGH-IJKL')]);
  const ted = new Date(TED);
  const r = await uplatniPoukaz(db, 'abcd efgh ijkl', 'user-1', ted);
  assert.deepEqual(r, { uplatnen: true, kod: 'ABCD-EFGH-IJKL', dny: 30 });
  assert.equal(db.tabulka[0].status, 'redeemed');
  assert.equal(db.tabulka[0].redeemed_by, 'user-1');
  assert.equal(db.tabulka[0].redeemed_at, ted.toISOString());
});

test('SOUBĚH: dva pokusy o týž kód naráz — projde právě jeden', async () => {
  const db = atrapa([poukaz('ABCD-EFGH-IJKL')]);
  const [a, b] = await Promise.all([
    uplatniPoukaz(db, 'ABCD-EFGH-IJKL', 'user-a', new Date(TED)),
    uplatniPoukaz(db, 'ABCD-EFGH-IJKL', 'user-b', new Date(TED)),
  ]);
  assert.equal([a, b].filter((r) => r.uplatnen).length, 1, 'kód se uplatnil dvakrát');
  const neuspech = [a, b].find((r) => !r.uplatnen);
  assert.equal(neuspech.duvod, 'pouzity');
  assert.ok(['user-a', 'user-b'].includes(db.tabulka[0].redeemed_by));
});

test('použitý, zrušený a prošlý kód: neuplatní se, hláška podle důvodu, DB beze změny', async () => {
  const db = atrapa([
    poukaz('AAAA-AAAA-AAAA', { status: 'redeemed', redeemed_by: 'jiny' }),
    poukaz('BBBB-BBBB-BBBB', { status: 'void' }),
    poukaz('CCCC-CCCC-CCCC', { valid_until: '2026-09-01T00:00:00Z' }),
  ]);
  const pred = JSON.stringify(db.tabulka);
  for (const [kod, duvod] of [['AAAA-AAAA-AAAA', 'pouzity'], ['BBBB-BBBB-BBBB', 'zruseny'], ['CCCC-CCCC-CCCC', 'expirovany'], ['DDDD-DDDD-DDDD', 'neexistuje']]) {
    const r = await uplatniPoukaz(db, kod, 'user-1', new Date(TED));
    assert.equal(r.uplatnen, false, kod);
    assert.equal(r.duvod, duvod, kod);
    assert.equal(r.hlaska, HLASKY_POUKAZU[duvod]);
  }
  assert.equal(JSON.stringify(db.tabulka), pred, 'neplatný kód nesmí nic změnit');
});

test('vrácení poukazu: jen ten, který uplatnil tentýž uživatel', async () => {
  const db = atrapa([poukaz('ABCD-EFGH-IJKL')]);
  await uplatniPoukaz(db, 'ABCD-EFGH-IJKL', 'user-1', new Date(TED));
  await vratPoukaz(db, 'ABCD-EFGH-IJKL', 'cizi-user');
  assert.equal(db.tabulka[0].status, 'redeemed', 'cizí uživatel poukaz nevrátí');
  await vratPoukaz(db, 'ABCD-EFGH-IJKL', 'user-1');
  assert.equal(db.tabulka[0].status, 'unused');
  assert.equal(db.tabulka[0].redeemed_by, null);
});

test('poukaz uživatele pro checkout', async () => {
  const db = atrapa([poukaz('ABCD-EFGH-IJKL', { status: 'redeemed', redeemed_by: 'user-1' })]);
  assert.equal((await poukazUzivatele(db, 'user-1'))?.code, 'ABCD-EFGH-IJKL');
  assert.equal(await poukazUzivatele(db, 'user-2'), null);
});

// ---------------------------------------------------------------- Stripe trial_end

test('Stripe trial_end: poukazový trial (30 dní) zůstane celý — stejná funkce jako běžný trial', () => {
  // Členství z registrace s poukazem: trial_ends_at = +30 dní.
  const clenstvi = { status: 'trial', ...membershipFromRegistration('START', '2026-09-24T12:00:00.000Z', 30), stripe_subscription_id: null };
  const trial = stripeTrialProCheckout('START', clenstvi, TED);
  assert.equal(trial.trial_end, Date.parse('2026-10-24T12:00:00Z') / 1000, 'první platba až 31. den');
  assert.equal(trial.trial_period_days, undefined);
  assert.deepEqual(stripeTrialProCheckout('START', { ...clenstvi, stripe_subscription_id: 'sub_1' }, TED), {});
});

// ---------------------------------------------------------------- napojení (tvar zdrojáku)

test('registrace: poukaz jen pro START a nové členství, s návratem při chybě', () => {
  const api = cti('api/body-metrics.js');
  assert.match(api, /typeof b\.kod_poukazu === 'string'/);
  const uplatneni = api.indexOf('await uplatniPoukaz(supabaseServer, kodPoukazu, payload.user_id)');
  const zachovani = api.indexOf('if (shouldPreserveMembership(existing))');
  const zalozeni = api.indexOf('membershipFromRegistration(program, startedAt, trialDni)');
  assert.ok(zachovani > -1 && uplatneni > zachovani && zalozeni > uplatneni, 'poukaz se uplatňuje až u nového členství, před jeho založením');
  assert.match(api, /String\(program\)\.toUpperCase\(\) === 'START'/);
  assert.match(api, /await vratPoukaz\(supabaseServer, poukaz\.kod, payload\.user_id\)/, 'po chybě členství se poukaz vrací');
  assert.match(api, /response\.poukaz = poukaz\.uplatnen/);
});

test('uplatnění je jeden podmíněný UPDATE (code + status unused + valid_until), ne SELECT a UPDATE', () => {
  const lib = cti('lib/poukazy.js');
  const i = lib.indexOf('export async function uplatniPoukaz');
  const telo = lib.slice(i, lib.indexOf('export async function vratPoukaz'));
  assert.match(telo, /\.update\(\{ status: 'redeemed', redeemed_by: userId, redeemed_at: tedIso/);
  assert.match(telo, /\.eq\('code', kod\)\s*\.eq\('status', 'unused'\)\s*\.gte\('valid_until', tedIso\)\s*\.select\(/);
  // Ověřovací SELECT smí přijít až PO neúspěšném UPDATE (kvůli hlášce).
  assert.ok(telo.indexOf('.update(') < telo.indexOf('overPoukaz('), 'SELECT před UPDATE = závod');
});

test('ověřovací endpoint je veřejný s rate limitem a nic nezapisuje', () => {
  const api = cti('api/registration/voucher-check.js');
  assert.match(api, /enforcePublicEndpointRateLimit/);
  assert.match(api, /overPoukaz\(supabaseServer, req\.body\?\.kod\)/);
  assert.doesNotMatch(api, /uplatniPoukaz|\.update\(/);
});

test('Stripe checkout: poukaz jen v metadatech, trial z jednoho rozhodnutí pro všechny', () => {
  const api = cti('api/stripe/create-checkout-session.js');
  assert.match(api, /const trial = stripeTrialProCheckout\(tier, membership\);/);
  assert.match(api, /voucher_code: poukaz\.code/);
  assert.doesNotMatch(api, /stripeTrialEndZPoukazu/, 'paralelní poukazová logika se vrátila');
});

test('middleware: přesměrování z webu na appku zachová ?kod= z QR', () => {
  assert.match(cti('middleware.ts'), /new URL\(url\.pathname \+ url\.search, getPublicAppUrl\(\)\)/);
});

test('registrace: pole „Mám kód poukazu" předvyplněné z ?kod=', () => {
  const ui = cti('src/components/registrace/StartRegistrace.tsx');
  assert.match(ui, /new URLSearchParams\(window\.location\.search\)\.get\('kod'\)/);
  assert.match(ui, /popisek="Mám kód poukazu"/);
  assert.match(ui, /volitelne/);
  assert.match(ui, /'\/api\/registration\/voucher-check'/);
  assert.match(ui, /kod_poukazu: kodPoukazu\.trim\(\)/);
});
