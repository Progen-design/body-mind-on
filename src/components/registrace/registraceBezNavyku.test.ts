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

test('server založí výchozí sadu, když klient žádnou nepošle', () => {
  assert.match(HABITS, /export function seedHabitIdsForRegistration/);
  assert.match(HANDLER, /seedHabitIdsForRegistration\(payload\)/);
});

test('seed bere jen pozitivní návyky — zlozvyky se nikde nesledují', async () => {
  const { seedHabitIdsForRegistration, NEGATIVE_HABITS } = await import('../../../lib/habits.js');
  const sada = seedHabitIdsForRegistration({
    goal: 'redukce',
    activity: 'sedavy',
    stress_level: 'high',
    notes: 'kouřím a piju alkohol',
  });

  assert.ok(sada.length > 0, 'prázdná sada by znamenala prázdnou záložku Návyky');
  assert.ok(sada.length <= 6, 'víc než šest návyků na start nikdo neudrží');
  assert.equal(new Set(sada).size, sada.length, 'žádný návyk se nesmí opakovat');
  for (const zlozvyk of NEGATIVE_HABITS) {
    assert.ok(!sada.includes(zlozvyk.id), `seed nesmí obsahovat zlozvyk ${zlozvyk.id}`);
  }
});

test('bez metrik seed spadne na výchozí sadu, ne na prázdno', async () => {
  const { seedHabitIdsForRegistration, VYCHOZI_NAVYKY } = await import('../../../lib/habits.js');
  assert.deepEqual(seedHabitIdsForRegistration({}), VYCHOZI_NAVYKY);
  assert.deepEqual(seedHabitIdsForRegistration(null), VYCHOZI_NAVYKY);
});
