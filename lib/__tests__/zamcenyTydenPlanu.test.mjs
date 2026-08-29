/**
 * UKÁZKA SE NESMÍ VYGENEROVAT DO MINULOSTI.
 *
 * PROČ TENHLE TEST EXISTUJE
 * Dry-run produkčního cronu 29. 8. 2026 ukázal, že `od = poDnech(konec, 1)`
 * navazuje na konec posledního plánu bez ohledu na to, jak dávno skončil.
 * Komu plán dojel před 19 dny, tomu se vyrobila „ukázka" na týden, který je
 * taky 19 dní starý — paywall by tvrdil „Tvůj další týden je připravený"
 * a ukazoval minulost. Oprava: `od` je pozdější ze dvou dat (den po konci
 * plánu, dnešek), nikdy dřív než dnes.
 *
 * Vedlejší efekt opravy: kontrola duplicity dřív porovnávala datum začátku
 * ukázky (`maUkazkuOd.get(...) === od`). Když se `od` u propadlých trialů
 * mění každý den, ukázka by vznikala znovu a znovu. Test proto hlídá i to,
 * že se duplicita pozná podle „má JAKOUKOLI nepropadlou ukázku", ne podle
 * shody data.
 *
 * Testuje se přes `najdiKandidatyNaUkazku` s PODVRŽENÝM klientem — žádná síť.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// `zamcenyTydenPlanu.js` importuje (přes unifiedPlanPipeline.js) `openai.js`,
// který si `new OpenAI(...)` instancuje hned při importu — bez klíče spadne
// dřív, než se stihne spustit jediný test. Klíč se tu nikdy nepoužije,
// `najdiKandidatyNaUkazku()` na OpenAI nesahá.
process.env.OPENAI_API_KEY ||= 'test-placeholder-nikdy-se-nepouzije';
const { najdiKandidatyNaUkazku } = await import('../zamcenyTydenPlanu.js');

const USER = '11111111-2222-3333-4444-555555555555';
const NOW = new Date('2026-08-29T12:00:00Z');

// Real-past datum: `isExpired()` v planRenewalRules.js porovnává proti
// skutečnému Date.now(), ne proti `opts.now` předanému funkci.
const TRIAL_ENDS_AT_V_MINULOSTI = '2020-01-01T00:00:00Z';

function fakeClient({ memberships = [], plany = [] }) {
  return {
    from(table) {
      const q = {
        _filters: {},
        select() { return q; },
        eq(col, val) { q._filters[col] = val; return q; },
        in(col, vals) { q._filters[col] = vals; return q; },
        then(resolve, reject) {
          if (table === 'memberships') {
            return Promise.resolve({ data: memberships, error: null }).then(resolve, reject);
          }
          if (table === 'ai_generated_plans') {
            const ids = q._filters.user_id;
            const data = ids ? plany.filter((p) => ids.includes(p.user_id)) : plany;
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

const TRIAL = { user_id: USER, tier: 'START', status: 'trial', trial_ends_at: TRIAL_ENDS_AT_V_MINULOSTI };

test('plán skončil před 19 dny → od je dnešek, ne den po konci plánu', async () => {
  const client = fakeClient({
    memberships: [TRIAL],
    plany: [{ user_id: USER, valid_from: '2026-08-04', valid_until: '2026-08-10', locked: false }],
  });

  const kandidati = await najdiKandidatyNaUkazku({ client, now: NOW });
  assert.equal(kandidati.length, 1);
  assert.equal(kandidati[0].od, '2026-08-29', 'od nesmí být v minulosti');
  assert.equal(kandidati[0].do, '2026-09-04');
});

test('plán končí za 2 dny → od je den po konci plánu', async () => {
  const client = fakeClient({
    memberships: [TRIAL],
    plany: [{ user_id: USER, valid_from: '2026-08-25', valid_until: '2026-08-31', locked: false }],
  });

  const kandidati = await najdiKandidatyNaUkazku({ client, now: NOW });
  assert.equal(kandidati.length, 1);
  assert.equal(kandidati[0].od, '2026-09-01');
  assert.equal(kandidati[0].do, '2026-09-07');
});

test('už má ukázku s valid_until v budoucnu → kandidát nevzniká', async () => {
  const client = fakeClient({
    memberships: [TRIAL],
    plany: [
      { user_id: USER, valid_from: '2026-08-25', valid_until: '2026-08-31', locked: false },
      { user_id: USER, valid_from: '2026-09-01', valid_until: '2026-09-05', locked: true },
    ],
  });

  const kandidati = await najdiKandidatyNaUkazku({ client, now: NOW });
  assert.equal(kandidati.length, 0, 'nepropadlá ukázka blokuje nový kandidát');
});

test('už má ukázku, která propadla → kandidát vzniká znovu', async () => {
  const client = fakeClient({
    memberships: [TRIAL],
    plany: [
      { user_id: USER, valid_from: '2026-08-04', valid_until: '2026-08-10', locked: false },
      { user_id: USER, valid_from: '2026-08-14', valid_until: '2026-08-20', locked: true },
    ],
  });

  const kandidati = await najdiKandidatyNaUkazku({ client, now: NOW });
  assert.equal(kandidati.length, 1, 'propadlá ukázka nesmí bránit nové');
  assert.equal(kandidati[0].od, '2026-08-29');
});
