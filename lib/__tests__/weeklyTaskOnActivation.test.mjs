/**
 * PO ZAPLACENÍ MUSÍ VZNIKNOUT ÚLOHA NA PLÁN — HNED.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 13. 8. 2026 uživatel zaplatil v 16:31. Webhook správně přepnul členství na
 * `active` a skončil `break` — nic nezaložil. Úlohy `weekly_plan_update`
 * zakládal jen denní cron ve 04:00 UTC (06:00 Praha), takže na plán, za který
 * právě zaplatil, by čekal 11,5 hodiny. Při platbě těsně po cronu skoro den.
 * V produkční DB do té doby neexistoval ani jeden `weekly_plan_update`.
 *
 * Rozbité nebyly ani cron, ani producent — chybělo propojení.
 *
 * Testuje se přes `produceWeeklyTaskForUser` s PODVRŽENÝM klientem: žádná
 * síť, žádné zásahy do DB. Webhook tu funkci jen zavolá, takže tohle je to
 * místo, kde se rozhoduje, jestli úloha vznikne a kolikrát.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  produceWeeklyTaskForUser,
  buildWeeklyIdempotencyKey,
  computeTargetFrom,
} from '../weeklyPlanProducer.js';

const USER = '11111111-2222-3333-4444-555555555555';

/**
 * Minimální dvojník supabase klienta.
 *
 * `ai_tasks` se chová jako produkční tabulka: UNIQUE na `idempotency_key`.
 * Právě o to jde — idempotenci drží databáze, ne kód, takže dvojník musí
 * duplicitu odmítnout stejně jako Postgres.
 */
function fakeClient({ membership, plans = [], tasks = [] }) {
  const ulozene = [...tasks];
  const client = {
    ulozene,
    from(table) {
      const q = {
        _table: table,
        _filters: {},
        select() { return q; },
        eq(col, val) { q._filters[col] = val; return q; },
        maybeSingle() {
          if (table === 'memberships') return Promise.resolve({ data: membership, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve) {
          // `await client.from('ai_generated_plans').select(...).eq(...).eq(...)`
          if (table === 'ai_generated_plans') {
            const aktivni = plans.filter((p) => p.is_active !== false);
            return Promise.resolve({ data: aktivni, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
        insert(row) {
          if (ulozene.some((t) => t.idempotency_key === row.idempotency_key)) {
            return Promise.resolve({
              error: { message: 'duplicate key value violates unique constraint "idx_ai_tasks_idempotency"' },
            });
          }
          ulozene.push(row);
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return client;
}

const AKTIVNI = { user_id: USER, tier: 'START', status: 'active', trial_ends_at: null };
const NOW = new Date('2026-08-13T18:00:00Z');

test('(a) aktivované členství založí právě jednu úlohu', () => {
  const client = fakeClient({ membership: AKTIVNI, plans: [] });

  return produceWeeklyTaskForUser(USER, { client, now: NOW }).then((v) => {
    assert.equal(v.created, true, 'úloha musí vzniknout');
    assert.equal(v.reason, 'subscription_activated_no_active_plan');
    assert.equal(client.ulozene.length, 1, 'právě jedna');

    const t = client.ulozene[0];
    assert.equal(t.task_type, 'weekly_plan_update');
    assert.equal(t.agent_slug, 'trainer');
    assert.equal(t.status, 'pending');
    assert.equal(t.user_id, USER);
    assert.ok(t.idempotency_key, 'bez klíče by DB řádek nepřijala');
  });
});

test('(b) druhý průchod téhož eventu nezaloží nic', async () => {
  // Stripe přehraje webhook při každé 5xx odpovědi i při ručním resendu.
  const client = fakeClient({ membership: AKTIVNI, plans: [] });

  const prvni = await produceWeeklyTaskForUser(USER, { client, now: NOW });
  const druhy = await produceWeeklyTaskForUser(USER, { client, now: NOW });

  assert.equal(prvni.created, true);
  assert.equal(druhy.created, false, 'podruhé už ne');
  assert.equal(druhy.reason, 'duplicate');
  assert.equal(client.ulozene.length, 1, 'v DB zůstane jedna úloha, ne dvě');
  assert.equal(prvni.idempotency_key, druhy.idempotency_key, 'stejný klíč = stejné období');
});

test('(b2) cron a webhook si nelezou do zelí — sdílejí klíč', async () => {
  // Klíč je odvozený z uživatele a cílového týdne, ne z toho, KDO úlohu zakládá.
  // Kdyby si webhook vyrobil vlastní tvar klíče, vznikly by dva plány na týden.
  const client = fakeClient({ membership: AKTIVNI, plans: [{ valid_until: '2026-08-16', is_active: true }] });

  const zWebhooku = await produceWeeklyTaskForUser(USER, { client, now: NOW });
  assert.equal(zWebhooku.created, true);

  const cronovyKlic = buildWeeklyIdempotencyKey(USER, computeTargetFrom('2026-08-16', '2026-08-13'));
  assert.equal(zWebhooku.idempotency_key, cronovyKlic, 'webhook musí použít týž klíč jako producent');
  assert.equal(zWebhooku.target_from, '2026-08-17', 'nový plán navazuje dnem po konci starého');
});

test('brána platí i tady — trial úlohu nedostane', async () => {
  const zitra = new Date(NOW.getTime() + 86400000).toISOString();
  const client = fakeClient({
    membership: { user_id: USER, tier: 'START', status: 'trial', trial_ends_at: zitra },
    plans: [],
  });

  const v = await produceWeeklyTaskForUser(USER, { client, now: NOW });
  assert.equal(v.created, false);
  assert.equal(v.reason, 'start_trial_allows_initial_plan_only');
  assert.equal(client.ulozene.length, 0, 'webhook nesmí zakládat plán, který scheduler stejně odmítne');
});

test('bez členství se nic nezakládá', async () => {
  const client = fakeClient({ membership: null, plans: [] });
  const v = await produceWeeklyTaskForUser(USER, { client, now: NOW });
  assert.equal(v.created, false);
  assert.equal(v.reason, 'missing_membership_for_plan_task');
  assert.equal(client.ulozene.length, 0);
});

test('cílový týden navazuje na konec platného plánu, jinak začíná dnes', () => {
  // Doběhové pravidlo: komu plán propadl před týdnem, dostane plán OD DNEŠKA.
  assert.equal(computeTargetFrom('2026-08-09', '2026-08-13'), '2026-08-13');
  assert.equal(computeTargetFrom('2026-08-16', '2026-08-13'), '2026-08-17');
  assert.equal(computeTargetFrom(null, '2026-08-13'), '2026-08-13');
});
