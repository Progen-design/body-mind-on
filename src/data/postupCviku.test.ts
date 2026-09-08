// docs/DALSI_KROK.md 9.9 — postup cviku doteče až do karty v UI.
//
// /api/profile doplní do plánu `instructions_cs` z registru cviků a adaptér
// z nich udělá `postup` na ExerciseItem. Když kroky chybí, je `postup`
// undefined a UI nekreslí NIC — žádný náhradní text, žádná angličtina.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { krokyPostupuCviku, naTreninky, cvikZPlanu } from './adaptery.ts';

test('krokyPostupuCviku: jen neprázdné kroky, jinak undefined', () => {
  assert.deepEqual(krokyPostupuCviku(['Postav se.', '  Zvedni činku.  ', '']), ['Postav se.', 'Zvedni činku.']);
  assert.equal(krokyPostupuCviku([]), undefined);
  assert.equal(krokyPostupuCviku(['', '  ']), undefined);
  assert.equal(krokyPostupuCviku(null), undefined);
  assert.equal(krokyPostupuCviku('Postav se.'), undefined, 'postup je pole kroků, ne slepený text');
});

test('naTreninky nese postup z instructions_cs; cvik bez kroků ho nemá vůbec', () => {
  const plan = {
    id: 'p1',
    structured_plan_json: {
      days: [{
        date: '2026-09-07',
        day_name: 'Pondělí',
        workout: {
          workout_name: 'Trénink A',
          duration_minutes: 40,
          exercises: [
            { canonical_key: 'drep', display_name_cs: 'Dřep', sets: 3, reps: '8-10', instructions_cs: ['Postav se na šířku ramen.', 'Klesej do dřepu.'] },
            { canonical_key: 'klik', display_name_cs: 'Klik', sets: 3, reps: '10' }
          ]
        }
      }]
    }
  };

  const [denTreninku] = naTreninky(plan);
  const [drep, klik] = denTreninku.exercises;
  assert.deepEqual(drep.postup, ['Postav se na šířku ramen.', 'Klesej do dřepu.']);
  assert.equal(klik.postup, undefined, 'bez kroků žádný postup — NULL je poctivější než vymyšlený text');
});

test('naTreninky nese obtiznost i variantu jen s párem klíč+název; canonical_key vždy', () => {
  const plan = {
    id: 'p1',
    structured_plan_json: {
      days: [{
        date: '2026-09-08',
        day_name: 'Pondělí',
        workout: {
          workout_name: 'Trénink A',
          duration_minutes: 40,
          exercises: [
            {
              canonical_key: 'squat', display_name_cs: 'Dřep', sets: 3, reps: '8-10',
              obtiznost: 'lehké',
              harder_key: 'goblet_squat', harder_display_name_cs: 'Goblet dřep',
            },
            {
              // easier_key BEZ jména (druhá dávka ho nenašla) — nesmí se propsat.
              canonical_key: 'bench_press', display_name_cs: 'Tlak na lavici', sets: 3, reps: '8',
              easier_key: 'chest_press',
            },
          ]
        }
      }]
    }
  };

  const [den] = naTreninky(plan);
  const [drep, benchPress] = den.exercises;

  assert.equal(drep.canonicalKey, 'squat');
  assert.equal(drep.obtiznost, 'lehké');
  assert.equal(drep.harderKey, 'goblet_squat');
  assert.equal(drep.harderNazev, 'Goblet dřep');
  assert.equal(drep.easierKey, undefined, 'squat nemá easier_key v datech, nesmí se vymyslet');

  assert.equal(benchPress.easierKey, undefined, 'easier_key bez jména se nesmí propsat');
  assert.equal(benchPress.easierNazev, undefined);
});

test('cvikZPlanu: stejná logika jako naTreninky, ale pro jeden cvik (odpověď POST /api/plan/exercise-variant)', () => {
  const cvik = cvikZPlanu(
    { canonical_key: 'chest_press', display_name_cs: 'Chest press', sets: 3, reps: '10', obtiznost: 'lehké', instructions_cs: ['Krok jedna.'] },
    0, '', 'plan-1', 2
  );
  assert.equal(cvik.id, 'chest_press');
  assert.equal(cvik.name, 'Chest press');
  assert.equal(cvik.obtiznost, 'lehké');
  assert.deepEqual(cvik.postup, ['Krok jedna.']);
  assert.equal(cvik.planId, 'plan-1');
  assert.equal(cvik.planDay, 2);
  assert.equal(cvik.completed, false);
});

test('karta cviku kreslí badge obtížnosti a tlačítka lehčí/těžší varianty jen s párem klíč+název', () => {
  const KOREN = path.join(import.meta.dirname, '..', '..');
  const workoutSection = fs.readFileSync(path.join(KOREN, 'src', 'components', 'WorkoutSection.tsx'), 'utf8');

  assert.match(workoutSection, /ex\.obtiznost && \(/);
  assert.match(workoutSection, /barvyObtiznosti\(ex\.obtiznost\)/);
  assert.match(workoutSection, /ex\.easierKey &&/);
  assert.match(workoutSection, /ex\.harderKey &&/);
  assert.match(workoutSection, /\/api\/plan\/exercise-variant/);
});

test('karta cviku kreslí postup pod obrázkem, sbalený v „Jak na to"', () => {
  const KOREN = path.join(import.meta.dirname, '..', '..');
  const workoutSection = fs.readFileSync(path.join(KOREN, 'src', 'components', 'WorkoutSection.tsx'), 'utf8');

  // Kroky se vypisují jako číslovaný seznam uvnitř rozbalovacího bloku.
  assert.match(workoutSection, /ex\.postup\.map\(/);
  assert.match(workoutSection, /list-decimal/);
  // Tlačítko „Jak na to" se ukáže i cviku, který má jen kroky bez média.
  assert.match(workoutSection, /ex\.ukazkaUrl \|\| \(ex\.postup\?\.length \?\? 0\) > 0/);
  // Seznam se kreslí jen když kroky jsou — bez nich nic, žádný náhradní text.
  assert.match(workoutSection, /\{ex\.postup && ex\.postup\.length > 0 && \(/);
});
