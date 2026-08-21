/**
 * SPUŠTĚNÍ ČEKAJÍCÍHO PLÁNU PO ZAPLACENÍ — a co se stane, když selže.
 *
 * PROČ TENHLE TEST EXISTUJE
 * První verze tohohle modulu dělala ze selhání terminální stav: úloha skončila
 * jako `failed`, scheduler ji už nikdy nesebral (bere jen `pending`)
 * a producent ji nezaložil znovu, protože idempotency klíč je stejný a UNIQUE
 * ho odmítne jako duplicitu. Jedna přechodná chyba by znamenala zaplaceného
 * uživatele bez plánu natrvalo.
 *
 * Druhá vada: `last_error` se při neúspěchu zapisoval jako `null`, takže se
 * ztratil důvod.
 *
 * Třetí: endpoint závodil se Stripe webhookem. Redirect z checkoutu bývá
 * rychlejší než doručení webhooku, takže se často nenašla žádná úloha
 * a uživatel čekal na ranní cron.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { claimAndExecutePlanTask, runPendingWeeklyTaskForUser } from '../runPendingPlanTask.js';

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * Dvojník supabase klienta nad jedním polem úloh.
 * Claim je podmíněný na `status = 'pending'`, stejně jako v produkci.
 */
function fakeClient(tasks = []) {
  const db = { tasks: [...tasks], updates: [] };

  db.from = () => {
    const q = { _filters: {}, _patch: null };
    q.update = (patch) => { q._patch = patch; return q; };
    q.select = () => q;
    q.eq = (col, val) => { q._filters[col] = val; return q; };
    q.order = () => q;
    q.limit = () => q;
    q.insert = (row) => {
      if (db.tasks.some((t) => t.idempotency_key && t.idempotency_key === row.idempotency_key)) {
        return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint' } });
      }
      db.tasks.push({ id: `t${db.tasks.length + 1}`, attempts: 0, ...row });
      return Promise.resolve({ error: null });
    };
    q.maybeSingle = () => {
      const cil = db.tasks.find((t) => Object.entries(q._filters)
        .every(([k, v]) => String(t[k] ?? '') === String(v)));
      if (q._patch) {
        if (!cil) return Promise.resolve({ data: null, error: null });
        Object.assign(cil, q._patch);
        db.updates.push({ id: cil.id, ...q._patch });
        return Promise.resolve({ data: { ...cil }, error: null });
      }
      return Promise.resolve({ data: cil ? { ...cil } : null, error: null });
    };
    // `await client.from(...).update(...).eq(...)` bez .select()
    q.then = (resolve) => {
      if (q._patch) {
        const cil = db.tasks.find((t) => String(t.id) === String(q._filters.id));
        if (cil) {
          Object.assign(cil, q._patch);
          db.updates.push({ id: cil.id, ...q._patch });
        }
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    return q;
  };

  return db;
}

const PENDING = { id: 't1', user_id: USER, task_type: 'weekly_plan_update', status: 'pending', attempts: 0, payload: {} };

test('(a) selhání vrátí úlohu do fronty, ne do terminálního stavu', async () => {
  const db = fakeClient([{ ...PENDING }]);

  const v = await claimAndExecutePlanTask({ id: 't1' }, {
    client: db,
    execute: async () => { throw new Error('Spoonacular timeout'); },
    maxAttempts: 3,
  });

  assert.equal(v.ok, false);
  assert.equal(v.status, 'retry_scheduled');

  const uloha = db.tasks[0];
  assert.equal(uloha.status, 'pending', 'scheduler bere jen pending — jinak by ji už nikdy nesebral');
  assert.equal(uloha.attempts, 1, 'pokus se musí započítat');
  assert.ok(uloha.next_retry_at, 'bez next_retry_at by se zkoušela hned dokola');
  assert.equal(uloha.processed_at, null, 'nedoběhla, takže není zpracovaná');
});

test('(a2) vyčerpané pokusy jdou do DLQ, ne zpět do fronty', async () => {
  const db = fakeClient([{ ...PENDING, attempts: 2 }]);

  const v = await claimAndExecutePlanTask({ id: 't1' }, {
    client: db,
    execute: async () => { throw new Error('porad to same'); },
    maxAttempts: 3,
  });

  assert.equal(v.status, 'dlq');
  assert.equal(db.tasks[0].status, 'dlq');
  assert.equal(db.tasks[0].attempts, 3);
  assert.ok(db.tasks[0].dead_lettered_at, 'DLQ se musí dát poznat');
  assert.equal(db.tasks[0].next_retry_at, null);
});

test('(b) last_error nese důvod, ne null', async () => {
  const db = fakeClient([{ ...PENDING }]);

  await claimAndExecutePlanTask({ id: 't1' }, {
    client: db,
    execute: async () => { throw new Error('Spoonacular timeout'); },
    maxAttempts: 3,
  });
  assert.match(db.tasks[0].last_error, /Spoonacular timeout/);

  // „Hotovo bez plan_id“ je taky selhání a taky musí mít důvod.
  const db2 = fakeClient([{ ...PENDING }]);
  await claimAndExecutePlanTask({ id: 't1' }, {
    client: db2,
    execute: async () => ({ ok: true, result: { outcome_type: 'plan_generated', plan_id: null } }),
    maxAttempts: 3,
  });
  assert.equal(db2.tasks[0].status, 'pending', 'i tohle se musí zkusit znovu');
  assert.match(db2.tasks[0].last_error, /Completed without plan_id/);

  // A chyba z výsledku executoru se přenese celá.
  const db3 = fakeClient([{ ...PENDING }]);
  await claimAndExecutePlanTask({ id: 't1' }, {
    client: db3,
    execute: async () => ({ ok: false, result: { error: 'CATALOG_SLOT_UNRESOLVED: dinner' } }),
    maxAttempts: 3,
  });
  assert.match(db3.tasks[0].last_error, /CATALOG_SLOT_UNRESOLVED/);
});

test('úspěch úlohu uzavře a smaže starou chybu', async () => {
  const db = fakeClient([{ ...PENDING, attempts: 1, last_error: 'predchozi pokus' }]);

  const v = await claimAndExecutePlanTask({ id: 't1' }, {
    client: db,
    execute: async () => ({ ok: true, result: { outcome_type: 'plan_generated', plan_id: 'plan-1' } }),
  });

  assert.equal(v.ok, true);
  assert.equal(db.tasks[0].status, 'completed');
  assert.equal(db.tasks[0].last_error, null);
  assert.ok(db.tasks[0].processed_at);
});

test('claim nesebere úlohu, kterou už zpracovává scheduler', async () => {
  const db = fakeClient([{ ...PENDING, status: 'processing' }]);
  let volano = false;

  const v = await claimAndExecutePlanTask({ id: 't1' }, {
    client: db,
    execute: async () => { volano = true; return { ok: true, result: {} }; },
  });

  assert.equal(v.claimed, false);
  assert.equal(v.status, 'already_running');
  assert.equal(volano, false, 'nesmí se spustit podruhé');
});

test('(c) bez čekající úlohy si ji endpoint založí sám a doběhne', async () => {
  // Redirect ze Stripe bývá rychlejší než webhook — bez tohohle by uživatel
  // dostal `no_pending_task` a čekal do rána na cron.
  const db = fakeClient([]);
  let vyrobeno = 0;

  const v = await runPendingWeeklyTaskForUser(USER, {
    client: db,
    produce: async () => {
      vyrobeno += 1;
      db.tasks.push({ id: 't9', user_id: USER, task_type: 'weekly_plan_update', status: 'pending', attempts: 0, payload: {} });
      return { created: true, reason: 'subscription_activated_no_active_plan' };
    },
    execute: async () => ({ ok: true, result: { outcome_type: 'plan_generated', plan_id: 'plan-9' } }),
  });

  assert.equal(vyrobeno, 1, 'úloha se musí založit');
  assert.equal(v.produced, true);
  assert.equal(v.ok, true);
  assert.equal(v.plan_id, 'plan-9');
  assert.equal(db.tasks[0].status, 'completed');
});

test('(c2) souběh s webhookem: duplicate se dohledá a spustí', async () => {
  // Webhook stihl insert o zlomek dřív. Producent vrátí `duplicate` — to není
  // důvod skončit, úloha existuje.
  const db = fakeClient([]);

  const v = await runPendingWeeklyTaskForUser(USER, {
    client: db,
    produce: async () => {
      db.tasks.push({ id: 't7', user_id: USER, task_type: 'weekly_plan_update', status: 'pending', attempts: 0, payload: {} });
      return { created: false, reason: 'duplicate' };
    },
    execute: async () => ({ ok: true, result: { outcome_type: 'plan_generated', plan_id: 'plan-7' } }),
  });

  assert.equal(v.ok, true);
  assert.equal(v.produced, false, 'nezaložil ji tenhle běh');
  assert.equal(v.plan_id, 'plan-7');
});

test('(c3) zamítnutí bránou se nezakrývá výrobou', async () => {
  const db = fakeClient([]);

  const v = await runPendingWeeklyTaskForUser(USER, {
    client: db,
    produce: async () => ({ created: false, reason: 'start_trial_allows_initial_plan_only' }),
    execute: async () => { throw new Error('nemelo se spustit'); },
  });

  assert.equal(v.ok, false);
  assert.equal(v.status, 'start_trial_allows_initial_plan_only');
  assert.equal(db.tasks.length, 0);
});
