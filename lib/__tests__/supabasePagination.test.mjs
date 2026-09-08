/**
 * nactiVsechnyRadky() — sdílené stránkování Supabase/PostgREST
 * (lib/supabasePagination.js). Naměřeno 9. 9. 2026: bez tohohle
 * scripts/doplneni-postupu-receptu.mjs zpracoval jen 1000 z 1114 receptů
 * a výstup to nijak neřekl. Stejný vzor se ještě našel u
 * scripts/report-beta-activation.mjs a api/trainer/clients.js — proto je
 * to jedna sdílená funkce, ne tři kopie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { nactiVsechnyRadky } from '../supabasePagination.js';

/**
 * Falešný Supabase klient — napodobí `.from().select().order().range()`
 * pro stránku dat a `.from().select('*', {count:'exact', head:true})` pro
 * počet. `zaznamVolani`, když je zadané, sbírá volání `.eq()`/`.gte()`/
 * `.not()`, ať jde ověřit, že se filtr aplikuje na obojí.
 */
function fakeClient(pocetRadku, { pocetJinak, zaznamVolani } = {}) {
  const radky = Array.from({ length: pocetRadku }, (_, i) => ({ id: i + 1 }));
  return {
    from() {
      /** @type {{ count?: boolean, range?: [number, number] }} */
      const stav = {};
      const chain = {
        select(_cols, opts) {
          stav.count = opts?.count === 'exact';
          return chain;
        },
        eq(col, val) { zaznamVolani?.push(['eq', col, val]); return chain; },
        gte(col, val) { zaznamVolani?.push(['gte', col, val]); return chain; },
        not(col, op, val) { zaznamVolani?.push(['not', col, op, val]); return chain; },
        order(col, opts) { stav.order = [col, opts]; return chain; },
        range(od, doo) { stav.range = [od, doo]; return chain; },
        then(onFulfilled, onRejected) {
          try {
            const vysledek = stav.count
              ? { count: pocetJinak ?? radky.length, error: null }
              : { data: radky.slice(stav.range[0], stav.range[1] + 1), error: null };
            return Promise.resolve(onFulfilled(vysledek));
          } catch (e) {
            if (onRejected) return Promise.resolve(onRejected(e));
            throw e;
          }
        },
      };
      return chain;
    },
  };
}

test('nactiVsechnyRadky: stránkuje přes .range() — 1114 řádků při stránce 1000 vrátí všech 1114', async () => {
  const client = fakeClient(1114);
  const vysledek = await nactiVsechnyRadky({ client, tabulka: 'x', sloupce: 'id' });
  assert.equal(vysledek.length, 1114);
  assert.equal(vysledek[vysledek.length - 1].id, 1114);
});

test('nactiVsechnyRadky: přesný násobek velikosti stránky se dočte celý', async () => {
  const client = fakeClient(1000);
  const vysledek = await nactiVsechnyRadky({ client, tabulka: 'x', sloupce: 'id' });
  assert.equal(vysledek.length, 1000);
});

test('nactiVsechnyRadky: nesoulad počtu proti count(*) shodí běh', async () => {
  const client = fakeClient(100, { pocetJinak: 150 });
  await assert.rejects(
    () => nactiVsechnyRadky({ client, tabulka: 'product_events', sloupce: 'id', velikostStranky: 20 }),
    /nesoulad počtu.*150.*100/s
  );
});

test('nactiVsechnyRadky: shodný počet (i s malou stránkou) neshodí běh', async () => {
  const client = fakeClient(250);
  const vysledek = await nactiVsechnyRadky({ client, tabulka: 'x', sloupce: 'id', velikostStranky: 100 });
  assert.equal(vysledek.length, 250);
});

test('nactiVsechnyRadky: filtr se aplikuje NA OBOJÍ — na count(*) i na každou stránku dat', async () => {
  const volani = [];
  const client = fakeClient(50, { zaznamVolani: volani });
  await nactiVsechnyRadky({
    client,
    tabulka: 'x',
    sloupce: 'id',
    velikostStranky: 20,
    filtr: (dotaz) => dotaz.eq('source', 'llm_generated'),
  });
  // 1× pro count(*) + 3 stránky (20 + 20 + 10) = 4 volání filtru.
  const eqVolani = volani.filter((v) => v[0] === 'eq');
  assert.equal(eqVolani.length, 4);
  assert.ok(eqVolani.every((v) => v[1] === 'source' && v[2] === 'llm_generated'));
});

test('nactiVsechnyRadky: bez filtru (výchozí) se nic nefiltruje a nic nespadne', async () => {
  const client = fakeClient(30);
  const vysledek = await nactiVsechnyRadky({ client, tabulka: 'x', sloupce: 'id' });
  assert.equal(vysledek.length, 30);
});

test('nactiVsechnyRadky: řadí podle zadaného sloupce, když je `poradi` zadané', async () => {
  let zachyceno = null;
  const client = {
    from() {
      const stav = {};
      const chain = {
        select(_cols, opts) { stav.count = opts?.count === 'exact'; return chain; },
        order(col, opts) { zachyceno = [col, opts]; return chain; },
        range(od, doo) { stav.range = [od, doo]; return chain; },
        then(onFulfilled) {
          const vysledek = stav.count ? { count: 3, error: null } : { data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null };
          return Promise.resolve(onFulfilled(vysledek));
        },
      };
      return chain;
    },
  };
  await nactiVsechnyRadky({ client, tabulka: 'x', sloupce: 'id', poradi: { sloupec: 'created_at', ascending: false } });
  assert.deepEqual(zachyceno, ['created_at', { ascending: false }]);
});

// --- Oba naměřené nálezy skutečně používají sdílenou funkci, ne kopii -----
// (žádný client injection, testuje se tvarem zdrojáku jako zbytek téhle sady).

test('scripts/report-beta-activation.mjs: loadEvents() čte product_events přes nactiVsechnyRadky, ne jedním .select()', () => {
  const zdroj = readFileSync(new URL('../../scripts/report-beta-activation.mjs', import.meta.url), 'utf8');
  assert.match(zdroj, /nactiVsechnyRadky/);
  assert.doesNotMatch(
    zdroj,
    /admin\.from\('product_events'\)\.select\(/,
    'loadEvents už nesmí volat .from(product_events).select(...) přímo bez stránkování'
  );
});

test('api/trainer/clients.js: body_metrics se čte přes nactiVsechnyRadky, ne jedním .select() bez rozsahu', () => {
  const zdroj = readFileSync(new URL('../../api/trainer/clients.js', import.meta.url), 'utf8');
  assert.match(zdroj, /nactiVsechnyRadky/);
  assert.doesNotMatch(
    zdroj,
    /\.from\('body_metrics'\)\s*\n?\s*\.select\(/,
    'body_metrics už nesmí mít vlastní .select(...) bez stránkování'
  );
});
