// NÁVYKY SE V REGISTRACI NEVYBÍRAJÍ (9. 9. 2026).
//
// Výběr byl povinný ("Vyber aspoň jeden návyk"), přestože stejný seznam je
// v profilu nepovinný, a stál na posledním kroku před založením účtu. Sadu
// teď zakládá server podle cíle, aktivity a stresu. Kdyby se blok vrátil do
// registrace a zároveň zůstal seed, založily by se návyky dvakrát.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..', '..');
const ZDROJ = fs.readFileSync(path.join(KOREN, 'src', 'components', 'registrace', 'StartRegistrace.tsx'), 'utf8');
const HANDLER = fs.readFileSync(path.join(KOREN, 'api', 'body-metrics.js'), 'utf8');
const HABITS = fs.readFileSync(path.join(KOREN, 'lib', 'habits.js'), 'utf8');

test('registrace neposílá selected_habits ani nenabízí výběr návyků', () => {
  assert.ok(!ZDROJ.includes('selected_habits:'), 'registrace už selected_habits neposílá');
  assert.ok(!ZDROJ.includes('POSITIVE_HABITS'), 'seznam návyků do registrace nepatří');
  assert.ok(!ZDROJ.includes('NEGATIVE_HABITS'), 'seznam zlozvyků do registrace nepatří');
});

test('poslední krok blokuje jen chybějící souhlas, návyky už ne', () => {
  assert.ok(!ZDROJ.includes('Vyber aspoň jeden návyk'), 'povinný výběr návyků je pryč');
  assert.match(ZDROJ, /e\.souhlas = 'Bez souhlasu ti plán nemůžeme začít připravovat\.'/);
});

test('server při registraci návyky NEZAKLÁDÁ (21. 9. 2026)', () => {
  // Záložka Návyky byla odstraněna, web je neslibuje a `habit_logs` je prázdná.
  // Existující `user_habits` se nemažou — jen se přestaly vytvářet.
  assert.ok(!/from\('user_habits'\)/.test(HANDLER), 'registrace zakládá user_habits');
  assert.ok(!/seedHabitIdsForRegistration/.test(HANDLER), 'registrace pořád volá seed návyků');
  assert.ok(!/export function seedHabitIdsForRegistration/.test(HABITS), 'seed návyků je zpátky');
});

test('profil návyky needituje: ani formulář, ani endpoint', () => {
  const MODAL = fs.readFileSync(path.join(KOREN, 'src', 'components', 'PreferencesModal.tsx'), 'utf8');
  const PREFS = fs.readFileSync(path.join(KOREN, 'api', 'profile-preferences.js'), 'utf8');
  assert.ok(!/selected_habits/.test(MODAL), 'formulář profilu pořád nabízí návyky');
  assert.ok(!/Návyky, které chceš sledovat/.test(MODAL), 'formulář profilu pořád nabízí návyky');
  assert.ok(!/from\('user_habits'\)/.test(PREFS), 'profile-preferences pořád píše do user_habits');
});
