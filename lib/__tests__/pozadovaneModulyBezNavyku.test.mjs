/**
 * docs/DALSI_KROK.md 9.1/D — `habits` v `required_modules` initial_plan
 * úlohy nikdy nedopadne jako `completed`, u ŽÁDNÉ z deseti čerstvých
 * registrací 7. 9. 2026. Kořen: registrační initial_plan běží vždy přes
 * deterministický katalogový pipeline (`useOpenAI` se v jeho payloadu
 * nikdy nenastavuje na `true`), který nemá žádnou cestu, jak vyplnit
 * `planJson.habits`/`mindset_week`/`mindset`/`mindset_tip` ani HTML —
 * `planHasHabitsModule()` (lib/taskExecutors.js) tak nemůže uspět ze své
 * podstaty, ne kvůli chybě v generování. Skutečné návyky (`selected_habits`
 * → `user_habits`) fungují nezávisle na `ai_tasks`/`initial_plan`.
 *
 * `INITIAL_PLAN_REQUIRED_MODULES`/`validateInitialPlanModules` nejsou
 * exportované (interní detail `lib/taskExecutors.js`) — kontroluje se proto
 * zdrojový text, stejný vzor jako v `lib/__tests__/cilVyzivyUlozeny.test.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function zdroj(relativniCesta) {
  return readFileSync(new URL(relativniCesta, import.meta.url), 'utf8');
}

test('INITIAL_PLAN_REQUIRED_MODULES v taskExecutors.js už nežádá habits', () => {
  const text = zdroj('../taskExecutors.js');
  const m = text.match(/const INITIAL_PLAN_REQUIRED_MODULES = (\[[^\]]*\]);/);
  assert.ok(m, 'INITIAL_PLAN_REQUIRED_MODULES nenalezeno');
  const seznam = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepEqual(seznam, ['nutrition', 'training']);
});

test('createInitialAITasks.js posílá required_modules bez habits', () => {
  const text = zdroj('../createInitialAITasks.js');
  const m = text.match(/required_modules:\s*(\[[^\]]*\])/);
  assert.ok(m, 'required_modules v createInitialAITasks.js nenalezeno');
  const seznam = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepEqual(seznam, ['nutrition', 'training']);
});

test('diagnostické fallbacky (registrace, profil) taky nežádají habits', () => {
  for (const cesta of ['../registration/bodyMetricsRegistration.js', '../../api/profile.js']) {
    const text = zdroj(cesta);
    const m = text.match(/required_modules:[^\n]*\?\?\s*(\[[^\]]*\])/);
    assert.ok(m, `fallback required_modules nenalezen v ${cesta}`);
    const seznam = JSON.parse(m[1].replace(/'/g, '"'));
    assert.deepEqual(seznam, ['nutrition', 'training'], cesta);
  }
});
