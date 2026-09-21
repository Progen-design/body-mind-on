import test from 'node:test';
import assert from 'node:assert/strict';
import { najdiNejblizsiTrenink } from './nejblizsiTrenink.ts';
import type { WorkoutDay } from '../types.ts';

function den(nazev: string, isToday: boolean, maTrenink: boolean, durationMin = 60): WorkoutDay {
  return {
    dayName: nazev,
    dayShort: nazev.slice(0, 2),
    title: maTrenink ? nazev : 'Volno',
    durationMin: maTrenink ? durationMin : 0,
    caloriesBurned: 0,
    isToday,
    isCompleted: false,
    focus: '',
    maTrenink,
    exercises: maTrenink ? [{ id: 'e1', name: 'Dřep', sets: 3, reps: '8-10', completed: false }] as any : [],
  };
}

test('den volna, trénink hned zítra', () => {
  const workouts = [
    den('Pondělí', true, false),
    den('Úterý', false, true, 45),
    den('Středa', false, false),
  ];
  assert.deepEqual(najdiNejblizsiTrenink(workouts), { kdyText: 'zítra', nazev: 'Úterý', durationMin: 45 });
});

test('nejbližší trénink je až za pár dní', () => {
  const workouts = [
    den('Pondělí', true, false),
    den('Úterý', false, false),
    den('Středa', false, false),
    den('Čtvrtek', false, true, 50),
  ];
  assert.deepEqual(najdiNejblizsiTrenink(workouts), { kdyText: 'za 3 dny', nazev: 'Čtvrtek', durationMin: 50 });
});

test('celý týden volno — žádný nejbližší trénink', () => {
  const workouts = [den('Pondělí', true, false), den('Úterý', false, false)];
  assert.equal(najdiNejblizsiTrenink(workouts), null);
});

test('obtočení na začátek týdne funguje', () => {
  const workouts = [den('Sobota', false, true, 30), den('Neděle', true, false)];
  assert.deepEqual(najdiNejblizsiTrenink(workouts), { kdyText: 'zítra', nazev: 'Sobota', durationMin: 30 });
});

test('dnešek chybí v poli — nic se nehádá', () => {
  assert.equal(najdiNejblizsiTrenink([den('Pondělí', false, true)]), null);
});
