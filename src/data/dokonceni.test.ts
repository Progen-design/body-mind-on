// Odškrtávání jídel a cviků — souřadnice zápisu a mapování stavu ze serveru.
// Klíčová past: `activity_key` je v každém dni stejný (`snack#2`, `cvik#0`),
// takže bez plan_id a plan_day by se včerejší odškrtnutí namapovalo na dnešek.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  jeHotovo,
  mnozinaDokonceni,
  naJidla,
  naTreninky,
  pouzijDokonceni,
  pouzijDokonceniTreninku
} from './adaptery.ts';

const DNES = new Date().toISOString().slice(0, 10);
const VCERA = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

/** Plán se dvěma dny: včera s tréninkem, dnes s jídly i tréninkem. */
function plan() {
  return {
    id: 'plan-abc',
    structured_plan_json: {
      days: [
        {
          date: VCERA,
          day_name: 'Pondělí',
          workout: { workout_name: 'Nohy', exercises: [{ name_cs: 'Dřep' }] }
        },
        {
          date: DNES,
          day_name: 'Úterý',
          meals: [
            { type: 'breakfast', name_cs: 'Ovesná kaše', kcal: 400 },
            { type: 'snack', name_cs: 'Jogurt', kcal: 150 },
            { type: 'lunch', name_cs: 'Kuře s rýží', kcal: 600 },
            { type: 'snack', name_cs: 'Ořechy', kcal: 200 }
          ],
          workout: {
            workout_name: 'Záda',
            exercises: [{ name_cs: 'Shyby' }, { name_cs: 'Veslování' }]
          }
        }
      ]
    }
  };
}

test('jídla nesou plan_id a index dne, ne pořadí v poli', () => {
  const jidla = naJidla(plan());

  assert.equal(jidla.length, 4);
  for (const j of jidla) {
    assert.equal(j.planId, 'plan-abc');
    assert.equal(j.planDay, 1, 'dnesek je druhy den planu, tedy plan_day 1');
  }
});

test('dvě svačiny v jednom dni mají různý klíč', () => {
  // Regrese k bugu z 15. 8. 2026: „splneno" u jedne svaciny zaskrtlo obe.
  const klice = naJidla(plan()).map(j => j.activityKey);
  assert.equal(new Set(klice).size, klice.length, `klice se opakuji: ${klice.join(', ')}`);
});

test('plan_day tréninku se bere z plánu, ne z předfiltrovaného pole', () => {
  // naTreninky filtruje dny bez treninku, takze index v jeho vystupu
  // neodpovida plan_day. Vcerejsi trenink je den 0, dnesni den 1.
  const dny = naTreninky(plan());

  assert.equal(dny.length, 2);
  assert.equal(dny[0].planDay, 0);
  assert.equal(dny[1].planDay, 1);
});

test('cviky mají klíč podle pořadí, celý trénink vlastní klíč', () => {
  const dnesni = naTreninky(plan())[1];

  assert.equal(dnesni.activityKey, 'plan_day');
  assert.deepEqual(dnesni.exercises.map(e => e.activityKey), ['cvik#0', 'cvik#1']);
});

test('stav ze serveru se namapuje na správné jídlo', () => {
  const jidla = naJidla(plan());
  const hotove = mnozinaDokonceni([
    { activity_type: 'meal', activity_key: 'snack#3', plan_id: 'plan-abc', plan_day: 1 }
  ]);

  const s = pouzijDokonceni(jidla, 'meal', hotove);
  assert.deepEqual(s.map(j => j.completed), [false, false, false, true]);
});

test('včerejší odškrtnutí se nenamapuje na dnešek', () => {
  // Tohle je duvod, proc plan_day musi byt v selectu /api/profile.
  const jidla = naJidla(plan());
  const hotove = mnozinaDokonceni([
    { activity_type: 'meal', activity_key: 'breakfast#0', plan_id: 'plan-abc', plan_day: 0 }
  ]);

  const s = pouzijDokonceni(jidla, 'meal', hotove);
  assert.equal(s.some(j => j.completed), false, 'vcerejsi zaznam prosakl do dneska');
});

test('odškrtnutí z jiného plánu se nezapočítá', () => {
  const jidla = naJidla(plan());
  const hotove = mnozinaDokonceni([
    { activity_type: 'meal', activity_key: 'breakfast#0', plan_id: 'jiny-plan', plan_day: 1 }
  ]);

  assert.equal(pouzijDokonceni(jidla, 'meal', hotove).some(j => j.completed), false);
});

test('typ aktivity se nesmí zaměnit — cvik#0 není jídlo', () => {
  const jidla = naJidla(plan());
  const hotove = mnozinaDokonceni([
    { activity_type: 'workout', activity_key: 'breakfast#0', plan_id: 'plan-abc', plan_day: 1 }
  ]);

  assert.equal(pouzijDokonceni(jidla, 'meal', hotove).some(j => j.completed), false);
});

test('trénink: cviky i příznak celého dne se nastaví zvlášť', () => {
  const dny = naTreninky(plan());
  const hotove = mnozinaDokonceni([
    { activity_type: 'workout', activity_key: 'cvik#0', plan_id: 'plan-abc', plan_day: 1 },
    { activity_type: 'workout', activity_key: 'plan_day', plan_id: 'plan-abc', plan_day: 0 }
  ]);

  const s = pouzijDokonceniTreninku(dny, hotove);

  assert.equal(s[0].isCompleted, true, 'vcerejsi trenink ma byt hotovy');
  assert.equal(s[0].exercises[0].completed, false);
  assert.equal(s[1].isCompleted, false, 'dnesni trenink jeste hotovy neni');
  assert.deepEqual(s[1].exercises.map(e => e.completed), [true, false]);
});

test('položka bez plan_day se nepovažuje za hotovou', () => {
  // Seed data z initialData.ts souradnice nemaji — nesmi vypadat odskrtnute.
  const hotove = mnozinaDokonceni([
    { activity_type: 'meal', activity_key: 'breakfast#0', plan_id: null, plan_day: null }
  ]);

  assert.equal(jeHotovo({ activityKey: 'breakfast#0' }, 'meal', hotove), false);
});

test('prázdná odpověď serveru nikoho neodškrtne ani nespadne', () => {
  const hotove = mnozinaDokonceni(undefined);
  assert.equal(hotove.size, 0);
  assert.equal(pouzijDokonceni(naJidla(plan()), 'meal', hotove).some(j => j.completed), false);
});
