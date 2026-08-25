/**
 * Audit normalizace surovin — sber nazvu a rozhodnuti, co se zaloguje.
 *
 * PROC. Do 25. 8. 2026 se cron ptal `resolveCanonicalName().matched`, coz je
 * porovnani proti konstante v lib/ingredientAliasSeed.js (74 kanonickych
 * klicu), ne proti slovniku v databazi (376 surovin, 503 aliasu). Log se tim
 * plnil surovinami, ktere slovnik zna, a watchdog je hlasil jako chybejici —
 * vsech 13 hlasenych (bazalka, granola, ricotta...) melo v DB kanonicky nazev.
 *
 * Otazku "zna slovnik tuhle surovinu?" ted zodpovida DB (`suroviny_mimo_slovnik`,
 * migrace 20260825090000) a testuje lib/__tests__/db/slovnikSurovin.db.test.mjs.
 * Tenhle soubor hlida cistou cast: ze se nazvy posbiraji spravne a ze se
 * zaloguje JEN to, co prislo z DB jako nezname.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nazvySurovinVPlanech,
  radkyKZapisu,
  vsechnyNazvy,
} from '../shoppingNormalizeAudit.js';

/** Plán v tom tvaru, v jakém leží v `ai_generated_plans.structured_plan_json`. */
function plan(id, ...nazvySurovin) {
  return {
    id,
    structured_plan_json: {
      days: [{
        meals: [{
          recipe: {
            ingredients: nazvySurovin.map((name) => ({ name, amount: 100, unit: 'g' })),
          },
        }],
      }],
    },
  };
}

// ------------------------------------------------------------------ sber

test('nazvy se sbiraji po plánech', () => {
  const podle = nazvySurovinVPlanech([
    plan('p1', 'bazalka', 'granola'),
    plan('p2', 'ricotta'),
  ]);

  assert.deepEqual([...podle.keys()].sort(), ['p1', 'p2']);
  assert.deepEqual([...podle.get('p1')].sort(), ['bazalka', 'granola']);
  assert.deepEqual([...podle.get('p2')], ['ricotta']);
});

test('tataz surovina v jednom planu jen jednou', () => {
  // Log je klicovany na (raw_name, plan_id) — duplicita by byla zbytecny zapis.
  const podle = nazvySurovinVPlanech([plan('p1', 'bazalka', 'bazalka')]);
  assert.deepEqual([...podle.get('p1')], ['bazalka']);
});

test('plan bez surovin se nezaznamena', () => {
  const podle = nazvySurovinVPlanech([plan('p1'), { id: 'p2' }, plan('p3', 'bazalka')]);
  assert.deepEqual([...podle.keys()], ['p3']);
});

test('rozbity vstup nic neshodi', () => {
  assert.equal(nazvySurovinVPlanech(null).size, 0);
  assert.equal(nazvySurovinVPlanech([]).size, 0);
  assert.equal(nazvySurovinVPlanech([{ structured_plan_json: null }]).size, 0);
  assert.equal(nazvySurovinVPlanech([{ id: 'p1', structured_plan_json: { days: null } }]).size, 0);
});

test('vsechnyNazvy sloucí plany do jednoho seznamu bez duplicit', () => {
  const podle = nazvySurovinVPlanech([
    plan('p1', 'bazalka', 'granola'),
    plan('p2', 'bazalka', 'ricotta'),
  ]);
  assert.deepEqual(vsechnyNazvy(podle).sort(), ['bazalka', 'granola', 'ricotta']);
});

// ------------------------------------------------------------- co se logu je

test('loguje se jen to, co slovnik nezna', () => {
  // TOHLE je ta oprava. Driv se zapisovalo vsechno, co neznal JS seed —
  // vcetne bazalky a granoly, ktere slovnik v DB zna.
  const podle = nazvySurovinVPlanech([plan('p1', 'bazalka', 'granola', 'vymysl xyz')]);
  const radky = radkyKZapisu(podle, new Set(['vymysl xyz']), '2026-08-25T07:00:00.000Z');

  assert.deepEqual(radky, [
    { plan_id: 'p1', raw_name: 'vymysl xyz', seen_at: '2026-08-25T07:00:00.000Z' },
  ]);
});

test('kdyz slovnik zna vsechno, nezapisuje se nic', () => {
  const podle = nazvySurovinVPlanech([plan('p1', 'bazalka'), plan('p2', 'granola')]);
  assert.deepEqual(radkyKZapisu(podle, new Set(), '2026-08-25T07:00:00.000Z'), []);
});

test('neznama surovina ve dvou planech da dva radky', () => {
  // Klic je (raw_name, plan_id), takze se hlasi u kazdeho planu zvlast —
  // jinak by po smazani jednoho planu zmizel zaznam i pro ten druhy.
  const podle = nazvySurovinVPlanech([plan('p1', 'vymysl'), plan('p2', 'vymysl')]);
  const radky = radkyKZapisu(podle, new Set(['vymysl']), '2026-08-25T07:00:00.000Z');

  assert.equal(radky.length, 2);
  assert.deepEqual(radky.map((r) => r.plan_id).sort(), ['p1', 'p2']);
});
