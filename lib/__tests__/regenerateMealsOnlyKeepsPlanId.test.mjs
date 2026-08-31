/**
 * PŘEGENEROVÁNÍ JÍDELNÍČKU NA AKTUÁLNÍ CÍL NESMÍ ZTRATIT TÝDEN ROZPRACOVANÝ.
 *
 * docs/DALSI_KROK.md 7.2a. Ověřeno na datech 31. 8. 2026:
 *   generatePlanForEmail             → vždy nový řádek ai_generated_plans
 *                                       s novým id, pokud se nepošle stejné
 *                                       valid_from jako má aktivní plán
 *   daily_activity_completions.plan_id → páruje se na `plan_id` (viz
 *                                       klicDokonceni v src/data/adaptery.ts)
 * Tlačítko „Přegenerovat jídelníček" proto MUSÍ:
 *   1) poslat `mealsOnly: true`, ať se trénink kopíruje beze změny
 *      (loadResolvedWorkoutsFromLatestPlan) a jeho odškrtnutí zůstanou platná,
 *   2) poslat stejné `valid_from`/`valid_until`, jaké má aktivní plán, ať
 *      upsert (unique constraint `uq_ai_generated_plans_user_valid_from`)
 *      aktualizuje TENTÝŽ řádek místo založení nového.
 *
 * Bez DB mocku nejde spustit celý handler — stejný vzor jako
 * lib/__tests__/invalidHabitIds.test.mjs a lib/__tests__/heightUpdatePatch.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const HANDLER = fs.readFileSync(new URL('../../api/profile-preferences.js', import.meta.url), 'utf8');

test('regenerateMealsOnly čte se z těla požadavku', () => {
  assert.match(HANDLER, /regenerateMealsOnly\s*=\s*b\.regenerateMealsOnly\s*===\s*true/);
});

test('mealsOnly je true i jen díky regenerateMealsOnly, ne jen díky onlyDietChanged', () => {
  assert.match(HANDLER, /mealsOnly:\s*onlyDietChanged\s*\|\|\s*regenerateMealsOnly/);
});

test('při regenerateMealsOnly se dotáže na valid_from/valid_until aktivního plánu', () => {
  const iRegenerace = HANDLER.indexOf('if (regenerateMealsOnly)');
  assert.ok(iRegenerace > -1, 'chybí větev pro regenerateMealsOnly');
  const vyrez = HANDLER.slice(iRegenerace, iRegenerace + 500);
  assert.match(vyrez, /from\('ai_generated_plans'\)/, 'nečte se aktivní plán');
  assert.match(vyrez, /valid_from,\s*valid_until/, 'nečtou se obě data pro shodu s unique constraintem');
  assert.match(vyrez, /is_active',\s*true/, 'nebere se konkrétně AKTIVNÍ plán');
});

test('validFromOverride/validUntilOverride se posílají do generatePlanForEmail, jen když jsou k dispozici', () => {
  const iGenerate = HANDLER.indexOf('generatePlanForEmail(email');
  assert.ok(iGenerate > -1);
  const vyrez = HANDLER.slice(iGenerate, iGenerate + 300);
  assert.match(vyrez, /validFromOverride/);
  assert.match(vyrez, /validUntilOverride/);
});

test('handler dřív žádný dotaz na ai_generated_plans neměl — regrese na to, že by se import zapomněl', () => {
  // supabaseServer je už importovaný pro body_metrics/user_habits, novej
  // dotaz na ai_generated_plans ho jen znovu použije — žádný nový import.
  assert.match(HANDLER, /import \{ supabaseServer \} from '\.\.\/lib\/supabaseServer\.js';/);
});
