// Nejbližší další trénink ve dni volna — ukazatel „Trénink" v hero,
// PROMPT_DNES_HERO.md: „Volno" + „zítra A · 60 min".
import type { WorkoutDay } from '../types.ts';

export interface NejblizsiTrenink {
  kdyText: string;
  nazev: string;
  durationMin: number;
}

function zaKolikDni(pocetDni: number): string {
  if (pocetDni === 1) return 'zítra';
  const tvar = pocetDni >= 2 && pocetDni <= 4 ? 'dny' : 'dní';
  return `za ${pocetDni} ${tvar}`;
}

/**
 * `workouts` je celý týden v pořadí, v jakém ho appka jinde prochází
 * (`treninkoveDny`, `dnesniTrenink` v lib/trenink.ts) — funkce jen hledá
 * od dnešního dne (`isToday`) dál, s obtočením na začátek pole.
 *
 * @returns `null`, když dnešek v poli není nebo žádný další trénink nenajde
 * (celý týden volno).
 */
export function najdiNejblizsiTrenink(workouts: WorkoutDay[]): NejblizsiTrenink | null {
  const dnesniIndex = workouts.findIndex((w) => w.isToday);
  if (dnesniIndex === -1 || workouts.length === 0) return null;

  for (let posun = 1; posun < workouts.length; posun += 1) {
    const den = workouts[(dnesniIndex + posun) % workouts.length];
    if (den.maTrenink !== false && den.exercises.length > 0) {
      return { kdyText: zaKolikDni(posun), nazev: den.title, durationMin: den.durationMin };
    }
  }
  return null;
}
