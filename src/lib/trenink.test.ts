// Regrese k padu, ktery shodil zalozku "Treninkovy plan" kazdemu uzivateli
// se 3 a mene treninky tydne: workouts[3] bylo undefined a komponenta pak
// cetla todayWorkout.title -> TypeError -> cerna obrazovka.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEN_BEZ_TRENINKU, dnesniTrenink, jeNaplanovany, vybranyTrenink } from './trenink.ts';
import type { WorkoutDay } from '../types.ts';

const DNY = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

function plan(pocetDni: number, indexDneska: number | null = null): WorkoutDay[] {
  return Array.from({ length: pocetDni }, (_, i) => ({
    dayName: DNY[i],
    dayShort: DNY[i].slice(0, 2).toUpperCase(),
    title: `Trénink ${i + 1}`,
    durationMin: 60,
    caloriesBurned: 400,
    isToday: i === indexDneska,
    isCompleted: false,
    focus: 'Síla',
    exercises: []
  }));
}

test('plán s 1, 3, 5 i 7 dny vrátí trénink, nikdy undefined', () => {
  for (const pocet of [1, 3, 5, 7]) {
    const workouts = plan(pocet);

    const dnesni = dnesniTrenink(workouts);
    assert.ok(dnesni, `${pocet} dni: dnesniTrenink vratil nic`);
    assert.equal(typeof dnesni.title, 'string', `${pocet} dni: chybi title`);
    assert.ok(Array.isArray(dnesni.exercises), `${pocet} dni: chybi exercises`);

    const vybrany = vybranyTrenink(workouts, null);
    assert.ok(vybrany && typeof vybrany.title === 'string', `${pocet} dni: vybranyTrenink selhal`);
  }
});

test('prázdný plán projde bez pádu a vrátí zástupce', () => {
  const dnesni = dnesniTrenink([]);

  assert.equal(dnesni.title, DEN_BEZ_TRENINKU.title);
  assert.deepEqual(dnesni.exercises, []);
  assert.equal(jeNaplanovany(dnesni), false);
});

test('den označený isToday má přednost před prvním dnem', () => {
  const workouts = plan(5, 2);
  assert.equal(dnesniTrenink(workouts).dayName, 'Středa');
});

test('bez isToday se vezme první den plánu, ne čtvrtý', () => {
  // Driv tu bylo workouts[3] natvrdo — u tridenniho planu undefined.
  const workouts = plan(3);
  assert.equal(dnesniTrenink(workouts).dayName, 'Pondělí');
});

test('vybraný den se najde podle jména', () => {
  const workouts = plan(5);
  assert.equal(vybranyTrenink(workouts, 'Čtvrtek').dayName, 'Čtvrtek');
});

test('vybraný den, který v plánu není, spadne na dnešek místo na undefined', () => {
  // Nastane po pregenerovani planu, kdy si UI drzelo stary nazev dne.
  const workouts = plan(3, 1);

  assert.equal(vybranyTrenink(workouts, 'Neděle').dayName, 'Úterý');
  assert.equal(vybranyTrenink([], 'Neděle').title, DEN_BEZ_TRENINKU.title);
});

test('jeNaplanovany odliší skutečný trénink od zástupce', () => {
  assert.equal(jeNaplanovany(DEN_BEZ_TRENINKU), false);
  assert.equal(jeNaplanovany(plan(1)[0]), true);
});

test('zástupce nenese vymyšlená čísla', () => {
  // Prazdny plan nesmi tvarit, ze uzivatel ma naplanovanych 400 kcal.
  assert.equal(DEN_BEZ_TRENINKU.durationMin, 0);
  assert.equal(DEN_BEZ_TRENINKU.caloriesBurned, 0);
  assert.equal(DEN_BEZ_TRENINKU.focus, '');
});
