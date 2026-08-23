// Vyber treninkoveho dne na jednom miste. Driv si kazda komponenta sahala
// do pole vlastnim zpusobem (workouts[3]) a plan se 3 dny shodil stranku.
import type { WorkoutDay } from '../types';

/**
 * Zástupce pro stav „v plánu dnes žádný trénink není".
 * Prázdný plán je platný stav — nový uživatel, plán se právě generuje,
 * nebo je prostě den volna. Není to chybějící údaj.
 */
export const DEN_BEZ_TRENINKU: WorkoutDay = {
  dayName: '',
  dayShort: '',
  title: 'Dnes bez tréninku',
  durationMin: 0,
  caloriesBurned: 0,
  isToday: true,
  isCompleted: false,
  focus: '',
  exercises: []
};

/** Pozná zástupce od skutečně naplánovaného tréninku. */
export function jeNaplanovany(workout: WorkoutDay): boolean {
  return workout.dayName !== '' || workout.exercises.length > 0;
}

/**
 * Trénink na dnešek: označený `isToday`, jinak první den plánu.
 * Nikdy nevrací `undefined` — volající čtou `.title` bez guardu.
 */
export function dnesniTrenink(workouts: WorkoutDay[]): WorkoutDay {
  return workouts.find(w => w.isToday) ?? workouts[0] ?? DEN_BEZ_TRENINKU;
}

/**
 * Trénink pro vybraný den. Když vybraný den v plánu není (uživatel nic
 * nevybral, nebo se plán mezitím přegeneroval), spadne to na dnešek.
 */
export function vybranyTrenink(
  workouts: WorkoutDay[],
  vybranyDen: string | null
): WorkoutDay {
  if (vybranyDen) {
    const nalezeny = workouts.find(w => w.dayName === vybranyDen);
    if (nalezeny) return nalezeny;
  }
  return dnesniTrenink(workouts);
}
