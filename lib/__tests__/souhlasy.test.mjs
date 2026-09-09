// Zapis souhlasu pri registraci — GDPR cl. 7 odst. 1.
//
// PROC TENHLE TEST EXISTUJE. Souhlas je jedina vec, ktera se v registraci
// NEPROJEVI na obrazovce: kdyz se prestane zapisovat, uzivatel to nepozna,
// plan se vygeneruje a chybi az ve chvili, kdy se souhlas ma dolozit. Test
// je tedy jediny mechanismus, ktery to chyti.
import test from 'node:test';
import assert from 'node:assert/strict';

import { zapisSouhlasy, DRUHY_SOUHLASU, UCINNOST_PRAVNICH_TEXTU } from '../souhlasy.js';

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

test('registrace zapise oba druhy souhlasu', async () => {
  const client = fakeClient();
  const v = await zapisSouhlasy('u-1', { client });

  assert.equal(v.ok, true);
  assert.equal(client.zapsano.length, 1);
  assert.equal(client.zapsano[0].tabulka, 'souhlasy_uzivatelu');
  assert.deepEqual(
    client.zapsano[0].radky.map((r) => r.druh).sort(),
    ['obchodni_podminky', 'zdravotni_udaje'],
  );
});

test('kazdy radek nese ucinnost dokumentu, zdroj a uzivatele', async () => {
  const client = fakeClient();
  await zapisSouhlasy('u-2', { client, zdroj: 'profil' });

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
  const v = await zapisSouhlasy('u-4', { client });

  assert.equal(v.ok, false);
  assert.match(v.error, /spojeni selhalo/);
});

test('ucinnost dokumentu je datum ve tvaru YYYY-MM-DD', () => {
  // Musi sedet s PROVOZOVATEL.ucinnostOd na webu; tvar hlida aspon format.
  assert.match(UCINNOST_PRAVNICH_TEXTU, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([...DRUHY_SOUHLASU], ['obchodni_podminky', 'zdravotni_udaje']);
});
