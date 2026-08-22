// Sestavení těla pro POST /api/workouts.
//
// PRAVIDLO: posílá se jen to, co uživatel skutečně zadal. Nic se nedopočítává
// a nic se nepředvyplňuje. Chybějící pole je informace („nevíme"), kdežto
// vymyšlená hodnota je tvrzení o tréninku, který jsme neviděli.
import { isValidPerceivedDifficulty, isValidWorkoutType } from '../../lib/workoutTypes.js';

export interface ZapisTreninku {
  workout_date: string;
  duration_min?: number;
  perceived_difficulty?: string;
  workout_type?: string;
  notes?: string;
}

export interface VstupZapisu {
  /** Datum tréninku, YYYY-MM-DD. Jediné povinné pole serveru. */
  datum: string;
  /** Naměřený čas ze stopek v sekundách. 0 nebo undefined = stopky neběžely. */
  sekundyStopek?: number;
  /** Obtížnost, pokud ji uživatel vybral. */
  obtiznost?: string | null;
  /** Kandidát na typ tréninku — třeba název z plánu. Když nesedí na výčet, vynechá se. */
  typKandidat?: string | null;
  notes?: string | null;
}

/**
 * Stopky převádíme na minuty jen od jedné celé nahoru a zaokrouhlujeme DOLŮ.
 *
 * Zaokrouhlení nahoru by z 30 sekund udělalo minutu, kterou uživatel necvičil —
 * a to je vymyšlená hodnota, i když malá. Pod 60 sekund se pole neposílá vůbec:
 * `duration_min: 0` se dole čte jako „trénink trval nula minut", ne jako
 * „neměřeno".
 */
export function minutyZeStopek(sekundy: number | undefined): number | undefined {
  if (!Number.isFinite(sekundy) || (sekundy as number) < 60) return undefined;
  return Math.floor((sekundy as number) / 60);
}

export function sestavZapisTreninku(vstup: VstupZapisu): ZapisTreninku {
  const telo: ZapisTreninku = { workout_date: vstup.datum };

  const minuty = minutyZeStopek(vstup.sekundyStopek);
  if (minuty !== undefined) telo.duration_min = minuty;

  // Server neplatnou obtiznost tise prepise na null — nema smysl ji posilat.
  if (isValidPerceivedDifficulty(vstup.obtiznost)) {
    telo.perceived_difficulty = vstup.obtiznost as string;
  }

  // Volny text server ulozi jak prisel a workout_name pak dopadne na klic
  // misto popisku. Radsi bez typu nez se spatnym.
  if (isValidWorkoutType(vstup.typKandidat)) {
    telo.workout_type = vstup.typKandidat as string;
  }

  const notes = typeof vstup.notes === 'string' ? vstup.notes.trim() : '';
  if (notes) telo.notes = notes;

  return telo;
}
