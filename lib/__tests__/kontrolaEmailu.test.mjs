/**
 * Kontrola e-mailu v registraci — závod odpovědí.
 *
 * Chyba z 24. 9. 2026: pod polem E-mail svítilo současně „Tento e-mail už je
 * registrovaný" i „E-mail je volný". Pomalá odpověď na STARÝ e-mail dorazila
 * po rychlé odpovědi na NOVÝ a zapsala se. Tady se simuluje rychlé opakované
 * volání s odpověďmi, které dorazí v opačném pořadí, než odešly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hlaskaEmailu, stavZVysledku, vytvorKontroluEmailu } from '../registration/kontrolaEmailu.js';
import { EMAIL_TAKEN_MESSAGE_CS, fetchRegistrationEmailAvailable } from '../registration/checkEmailAvailableClient.js';

const KOREN = join(import.meta.dirname, '..', '..');
const cti = (p) => readFileSync(join(KOREN, p), 'utf8');

/**
 * Atrapa endpointu: každý e-mail má vlastní zpoždění a odpověď. Zapisuje,
 * co přišlo a jestli se to zrušilo (signal.aborted), jako skutečný fetch.
 */
function atrapaEndpointu(odpovedi) {
  const volani = [];
  const zkontroluj = (email, { signal } = {}) => {
    const { available, zpozdeniMs } = odpovedi[email];
    const zaznam = { email, zruseno: false };
    volani.push(zaznam);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({ available }), zpozdeniMs);
      signal?.addEventListener('abort', () => {
        zaznam.zruseno = true;
        clearTimeout(t);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    });
  };
  return { volani, zkontroluj };
}

test('pomalá odpověď na starý e-mail nepřepíše rychlou na nový', async () => {
  const { zkontroluj, volani } = atrapaEndpointu({
    'obsazeny@x.cz': { available: false, zpozdeniMs: 60 }, // starý, pomalý
    'volny@x.cz': { available: true, zpozdeniMs: 5 },      // nový, rychlý
  });
  const kontrola = vytvorKontroluEmailu(zkontroluj);

  const stary = kontrola.over('obsazeny@x.cz');
  const novy = kontrola.over('volny@x.cz');
  const [vStary, vNovy] = await Promise.all([stary, novy]);

  assert.equal(vStary, null, 'odpověď na starší dotaz se musí zahodit');
  assert.deepEqual(vNovy, { available: true });
  assert.equal(stavZVysledku(vNovy), 'volny');
  assert.equal(volani[0].zruseno, true, 'starší dotaz se má zrušit (AbortController)');
});

test('rychlé psaní: 10 dotazů za sebou, platí jen poslední — i když dorazí první', async () => {
  const odpovedi = {};
  for (let i = 0; i < 10; i++) {
    // Starší dotazy odpovídají POMALEJI než novější → dorazí až po posledním.
    odpovedi[`a${i}@x.cz`] = { available: i === 9, zpozdeniMs: (10 - i) * 5 };
  }
  const { zkontroluj, volani } = atrapaEndpointu(odpovedi);
  const kontrola = vytvorKontroluEmailu(zkontroluj);

  const vysledky = await Promise.all(Object.keys(odpovedi).map((email) => kontrola.over(email)));

  assert.deepEqual(vysledky.slice(0, 9), Array(9).fill(null), 'žádná starší odpověď se nesmí použít');
  assert.deepEqual(vysledky[9], { available: true });
  assert.equal(volani.filter((v) => v.zruseno).length, 9, 'všech devět starších dotazů se zrušilo');
});

test('i bez zrušení (endpoint abort ignoruje) rozhodne pořadové číslo', async () => {
  // Server, který na signal nereaguje: odpověď na starý dotaz přijde stejně.
  const zkontroluj = (email) => new Promise((resolve) => {
    setTimeout(() => resolve({ available: email === 'novy@x.cz' }), email === 'novy@x.cz' ? 5 : 40);
  });
  const kontrola = vytvorKontroluEmailu(zkontroluj);
  const [stary, novy] = await Promise.all([kontrola.over('stary@x.cz'), kontrola.over('novy@x.cz')]);
  assert.equal(stary, null);
  assert.deepEqual(novy, { available: true });
});

test('zrus(): běžící dotaz se zahodí (e-mail se změnil na neplatný tvar)', async () => {
  const { zkontroluj } = atrapaEndpointu({ 'a@x.cz': { available: false, zpozdeniMs: 20 } });
  const kontrola = vytvorKontroluEmailu(zkontroluj);
  const bezici = kontrola.over('a@x.cz');
  kontrola.zrus();
  assert.equal(await bezici, null);
});

test('výpadek ani zrušení nejsou „obsazený"', () => {
  assert.equal(stavZVysledku({ available: false, networkError: true }), 'nelze');
  assert.equal(stavZVysledku({ available: false, rateLimited: true }), 'nelze');
  assert.equal(stavZVysledku({ available: false, aborted: true }), 'nelze');
  assert.equal(stavZVysledku({ available: false }), 'obsazeny');
  assert.equal(stavZVysledku({ available: true }), 'volny');
});

test('klientský fetch: zrušený dotaz vrací aborted, ne networkError', async () => {
  const puvodni = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  try {
    const ovladac = new AbortController();
    const dotaz = fetchRegistrationEmailAvailable('a@x.cz', { signal: ovladac.signal });
    ovladac.abort();
    assert.deepEqual(await dotaz, { available: false, aborted: true });
  } finally {
    globalThis.fetch = puvodni;
  }
});

// ---------------------------------------------------------------- jediná hláška

test('nová odpověď „volný" nahradí starou chybu „už je registrovaný" — nikdy obě', () => {
  const h = hlaskaEmailu({ stav: 'volny', chybaPole: EMAIL_TAKEN_MESSAGE_CS });
  assert.deepEqual(h, { typ: 'ok', text: 'E-mail je volný.' });
});

test('hláška je vždy nejvýš jedna, pro každou kombinaci stavu a chyby pole', () => {
  for (const stav of ['necinny', 'overuji', 'volny', 'obsazeny', 'nelze']) {
    for (const chybaPole of [null, EMAIL_TAKEN_MESSAGE_CS, 'Zadej platný e-mail.']) {
      const h = hlaskaEmailu({ stav, chybaPole });
      assert.ok(h === null || (typeof h.text === 'string' && ['chyba', 'overuji', 'ok', 'varovani'].includes(h.typ)), `${stav}/${chybaPole}`);
    }
  }
});

test('chyba formátu má přednost, obsazený se ukáže jako chyba, ověřování jako průběh', () => {
  assert.deepEqual(hlaskaEmailu({ stav: 'volny', chybaPole: 'Zadej platný e-mail.' }), { typ: 'chyba', text: 'Zadej platný e-mail.' });
  assert.deepEqual(hlaskaEmailu({ stav: 'obsazeny' }), { typ: 'chyba', text: EMAIL_TAKEN_MESSAGE_CS });
  assert.equal(hlaskaEmailu({ stav: 'overuji', chybaPole: EMAIL_TAKEN_MESSAGE_CS }).typ, 'overuji', 'při ověřování stará chyba nesvítí');
  assert.deepEqual(hlaskaEmailu({ stav: 'necinny', chybaPole: EMAIL_TAKEN_MESSAGE_CS }), { typ: 'chyba', text: EMAIL_TAKEN_MESSAGE_CS }, 'obsazený ze serveru');
  assert.equal(hlaskaEmailu({ stav: 'necinny' }), null);
});

// ---------------------------------------------------------------- napojení

test('registrace: „Dál" nemá vlastní dotaz, jde přes tutéž kontrolu jako psaní', () => {
  const ui = cti('src/components/registrace/StartRegistrace.tsx');
  assert.doesNotMatch(ui, /fetchRegistrationEmailAvailable\(/, 'vlastní dotaz bez ochrany pořadí se vrátil');
  assert.match(ui, /await overEmailHned\(data\.email\)/);
  assert.match(ui, /hlaskaEmailu\(\{ stav: stavEmailu, chybaPole: chyby\.email \|\| null \}\)/);
  // Pole i řádky pod ním čtou JEDNU hlášku, ne stav a chybu zvlášť.
  assert.match(ui, /chyba=\{hlaskaPoleEmail\?\.typ === 'chyba' \? hlaskaPoleEmail\.text : null\}/);
  assert.doesNotMatch(ui, /chyby\.email \|\| \(uctExistuje/, 'dvě nezávislé hlášky se vrátily');
});

test('hook: změna e-mailu hned zruší běžící dotaz a výsledek bere z kontroly', () => {
  const hook = cti('src/hooks/useKontrolaEmailu.ts');
  assert.match(hook, /vytvorKontroluEmailu\(fetchRegistrationEmailAvailable\)/);
  assert.match(hook, /kontrola\.zrus\(\);/);
  assert.match(hook, /if \(vysledek\) setStav\(stavZVysledku\(vysledek\)\)/);
});
