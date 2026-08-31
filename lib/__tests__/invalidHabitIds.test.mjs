/**
 * NEZNÁMÝ KLÍČ NÁVYKU SE MÁ ODMÍTNOUT, NE TIŠE ZAHODIT.
 *
 * docs/DALSI_KROK.md 6.7 (nález nad rámec bodu, deset registrací 31. 8.
 * volaných na API přímo, ne přes UI): `selected_habits: ['zdrava_strava',
 * 'kvalitni_spanek']` — české klíče místo anglických
 * `healthy_diet`/`quality_sleep` — prošlo se stavem 200 u všech deseti účtů
 * a `user_habits` zůstalo prázdné. Registrační UI id bere z lib/habits.js,
 * takže samo neplatný klíč neposílá; server ho přesto musí odmítnout, ne
 * mlčky sníst.
 *
 * Druhá polovina nálezu (api/profile-preferences.js): request se samými
 * neplatnými klíči nejdřív smazal existující `user_habits` a validace přišla
 * až potom — tichá ztráta dat, ne jen ignorovaný vstup. Regrese na pořadí
 * (validace před mazáním) je kontrolovaná textem souboru níž, protože bez DB
 * mocku nejde spustit celý handler — stejný vzor jako
 * lib/__tests__/heightUpdatePatch.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { invalidHabitIds, isValidHabitId, ALL_HABIT_IDS } from '../habits.js';

test('platné anglické klíče projdou beze zbytku', () => {
  assert.deepEqual(invalidHabitIds(['healthy_diet', 'quality_sleep', 'hydration']), []);
});

test('přesně produkční nález: české klíče jsou neplatné, ne tiše zahozené', () => {
  const neplatne = invalidHabitIds(['zdrava_strava', 'kvalitni_spanek']);
  assert.deepEqual(neplatne, ['zdrava_strava', 'kvalitni_spanek']);
});

test('směs platných a neplatných vrátí jen ty neplatné', () => {
  assert.deepEqual(
    invalidHabitIds(['healthy_diet', 'zdrava_strava', 'quality_sleep']),
    ['zdrava_strava']
  );
});

test('nestringové položky jsou taky neplatné, ne tiše přeskočené', () => {
  assert.deepEqual(invalidHabitIds(['healthy_diet', null, 42, {}]), [null, 42, {}]);
});

test('prázdný nebo chybějící vstup je v pořádku (nic k odmítnutí)', () => {
  assert.deepEqual(invalidHabitIds([]), []);
  assert.deepEqual(invalidHabitIds(undefined), []);
  assert.deepEqual(invalidHabitIds(null), []);
  assert.deepEqual(invalidHabitIds('healthy_diet'), []);
});

test('mezery kolem klíče nevadí — ověřuje se ořezaná hodnota', () => {
  assert.deepEqual(invalidHabitIds(['  healthy_diet  ']), []);
});

test('ALL_HABIT_IDS a isValidHabitId zůstávají zdrojem pravdy pro validátor', () => {
  for (const id of ALL_HABIT_IDS) {
    assert.equal(isValidHabitId(id), true, `${id} by měl být platný`);
    assert.deepEqual(invalidHabitIds([id]), []);
  }
});

test('api/profile-preferences.js ověří návyky dřív, než cokoli smaže', () => {
  const handler = fs.readFileSync(new URL('../../api/profile-preferences.js', import.meta.url), 'utf8');
  const indexValidace = handler.indexOf('invalidHabitIds(b.selected_habits)');
  const indexMazani = handler.indexOf('.delete()');
  assert.ok(indexValidace > -1, 'profile-preferences.js nevolá invalidHabitIds');
  assert.ok(indexMazani > -1, 'profile-preferences.js nemaže user_habits tam, kde se čekalo');
  assert.ok(
    indexValidace < indexMazani,
    'validace návyků musí v souboru předcházet mazání user_habits — jinak samé neplatné klíče smažou existující seznam beze chyby'
  );
});

test('registrace (api/body-metrics.js) ověří návyky přes sdílenou parseAndValidateRegistrationBody, ne vlastním filtrem', () => {
  const registrace = fs.readFileSync(
    new URL('../registration/bodyMetricsRegistration.js', import.meta.url),
    'utf8'
  );
  assert.match(
    registrace,
    /invalidHabitIds\(b\.selected_habits\)/,
    'bodyMetricsRegistration.js neověřuje selected_habits přes sdílený validátor'
  );
});
