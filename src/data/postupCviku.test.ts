// docs/DALSI_KROK.md 9.9 — postup cviku doteče až do karty v UI.
//
// /api/profile doplní do plánu `instructions_cs` z registru cviků a adaptér
// z nich udělá `postup` na ExerciseItem. Když kroky chybí, je `postup`
// undefined a UI nekreslí NIC — žádný náhradní text, žádná angličtina.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { krokyPostupuCviku, naTreninky } from './adaptery.ts';

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
