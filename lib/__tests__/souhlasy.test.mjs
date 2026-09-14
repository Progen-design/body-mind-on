// Zapis souhlasu pri registraci — GDPR cl. 7 odst. 1.
//
// PROC TENHLE TEST EXISTUJE. Souhlas je jedina vec, ktera se v registraci
// NEPROJEVI na obrazovce: kdyz se prestane zapisovat, uzivatel to nepozna,
// plan se vygeneruje a chybi az ve chvili, kdy se souhlas ma dolozit. Test
// je tedy jediny mechanismus, ktery to chyti.
import test from 'node:test';
import assert from 'node:assert/strict';

import { zapisSouhlasy, DRUHY_SOUHLASU, UCINNOST_PRAVNICH_TEXTU } from '../souhlasy.js';
import { parseAndValidateRegistrationBody } from '../registration/bodyMetricsRegistration.js';

/** Minimální platný registrační formulář — jen pole, co parseAndValidateRegistrationBody vyžaduje. */
function platnaRegistrace(extra = {}) {
  return {
    email: 'test@example.com',
    height: 180,
    weight: 80,
    birth_date: '1990-01-01',
    ...extra,
  };
}

/** Minimalni nahrada supabase klienta — zajima nas jen, co se posle do insert(). */
function fakeClient(vysledek = { error: null }) {
  const zapsano = [];
  return {
    zapsano,
    from(tabulka) {
      return {
        insert(radky) {
          zapsano.push({ tabulka, radky });
          return Promise.resolve(vysledek);
        },
      };
    },
  };
}

test('registrace zapise oba druhy souhlasu, kdyz je volajici explicitne posle', async () => {
  const client = fakeClient();
  const v = await zapisSouhlasy('u-1', { client, druhy: DRUHY_SOUHLASU });

  assert.equal(v.ok, true);
  assert.equal(client.zapsano.length, 1);
  assert.equal(client.zapsano[0].tabulka, 'souhlasy_uzivatelu');
  assert.deepEqual(
    client.zapsano[0].radky.map((r) => r.druh).sort(),
    ['obchodni_podminky', 'zdravotni_udaje'],
  );
});

test('pozadavek bez souhlasu (zadne "druhy") se neulozi — zadny vychozi seznam', async () => {
  // Presne tohle byla produkcni chyba: api/body-metrics.js volalo
  // zapisSouhlasy() bez `druhy` a funkce si donedavna domyslela cely
  // DRUHY_SOUHLASU sama. Holy POST bez zaskrtnuti tak zapsal oba radky,
  // presteze uzivatel nic neodsouhlasil.
  const client = fakeClient();
  const v = await zapisSouhlasy('u-1', { client });

  assert.equal(v.ok, false);
  assert.match(v.error, /druh/);
  assert.equal(client.zapsano.length, 0);
});

test('kazdy radek nese ucinnost dokumentu, zdroj a uzivatele', async () => {
  const client = fakeClient();
  await zapisSouhlasy('u-2', { client, zdroj: 'profil', druhy: DRUHY_SOUHLASU });

  for (const r of client.zapsano[0].radky) {
    assert.equal(r.user_id, 'u-2');
    assert.equal(r.ucinnost_dokumentu, UCINNOST_PRAVNICH_TEXTU);
    assert.equal(r.zdroj, 'profil');
    // Datum udeleni doplnuje databaze (default now()), ne aplikace — cas
    // serveru je duveryhodnejsi nez cas volajiciho.
    assert.equal('udeleno_at' in r, false);
  }
});

test('neznamy druh souhlasu se nezapise', async () => {
  const client = fakeClient();
  const v = await zapisSouhlasy('u-3', { client, druhy: ['vymysleny_souhlas'] });

  assert.equal(v.ok, false);
  assert.equal(client.zapsano.length, 0);
});

test('bez user_id se nic nezapisuje', async () => {
  const client = fakeClient();
  const v = await zapisSouhlasy(null, { client });

  assert.equal(v.ok, false);
  assert.equal(client.zapsano.length, 0);
});

test('chyba databaze se vrati, ale nevyhodi vyjimku — registrace nesmi spadnout', async () => {
  const client = fakeClient({ error: { message: 'spojeni selhalo' } });
  const v = await zapisSouhlasy('u-4', { client, druhy: DRUHY_SOUHLASU });

  assert.equal(v.ok, false);
  assert.match(v.error, /spojeni selhalo/);
});

test('ucinnost dokumentu je datum ve tvaru YYYY-MM-DD', () => {
  // Musi sedet s PROVOZOVATEL.ucinnostOd na webu; tvar hlida aspon format.
  assert.match(UCINNOST_PRAVNICH_TEXTU, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([...DRUHY_SOUHLASU], ['obchodni_podminky', 'zdravotni_udaje']);
});

// ─────────────────────────────────────────────────────────────────────────
// HRANICE API: parseAndValidateRegistrationBody musí registraci bez platného
// souhlasu odmítnout 400 — PŘED tím, než api/body-metrics.js založí účet
// (createRegistrationAuthUser). Vzor testu: lib/__tests__/registracniValidaceVyberu.test.mjs.
// ─────────────────────────────────────────────────────────────────────────

test('registrace bez pole "souhlasy" vrati 400, ne tichy pruchod', () => {
  const res = parseAndValidateRegistrationBody(platnaRegistrace());
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.match(res.error, /souhlas/i);
});

test('registrace s prazdnym polem "souhlasy" vrati 400', () => {
  const res = parseAndValidateRegistrationBody(platnaRegistrace({ souhlasy: [] }));
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test('registrace jen s jednim z povinnych druhu vrati 400', () => {
  const res = parseAndValidateRegistrationBody(platnaRegistrace({ souhlasy: ['obchodni_podminky'] }));
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test('registrace s neplatnym retezcem misto pole "souhlasy" vrati 400, nespadne', () => {
  const res = parseAndValidateRegistrationBody(platnaRegistrace({ souhlasy: 'obchodni_podminky' }));
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test('registrace se vsemi povinnymi druhy souhlasu projde a nese je mimo payload', () => {
  const res = parseAndValidateRegistrationBody(platnaRegistrace({
    souhlasy: ['obchodni_podminky', 'zdravotni_udaje'],
  }));
  assert.equal(res.ok, true);
  assert.deepEqual(res.souhlasy.sort(), ['obchodni_podminky', 'zdravotni_udaje']);
  // Nejde do body_metrics — tabulka na to nema sloupec, zapisuje se
  // samostatne přes zapisSouhlasy() do souhlasy_uzivatelu.
  assert.equal('souhlasy' in res.payload, false);
});

test('neznamy druh navic v poli neprojde jako platny, ale povinne druhy staci k uspechu', () => {
  const res = parseAndValidateRegistrationBody(platnaRegistrace({
    souhlasy: ['obchodni_podminky', 'zdravotni_udaje', 'vymysleny_souhlas'],
  }));
  assert.equal(res.ok, true);
  assert.deepEqual(res.souhlasy.sort(), ['obchodni_podminky', 'zdravotni_udaje']);
});
