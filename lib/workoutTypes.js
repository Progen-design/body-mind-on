/**
 * Typy zapsaného tréninku — jediný zdroj pravdy pro API i pro SPA.
 *
 * Dřív žil tenhle výčet jen uvnitř api/workouts.js, takže klient neměl podle
 * čeho poznat, jestli hodnotu server přijme. Handler volný text neodmítne,
 * jen ho uloží jak přišel — a `workout_name` pak dopadne na samotný klíč
 * místo popisku. Proto se na klientovi validuje předem a co nesedí, neposílá se.
 *
 * MODUL JE ČISTÝ — bez importů, aby šel spustit i node --test bez transpilace.
 */

export const WORKOUT_TYPE_LABELS = {
  silovy: 'Silový',
  kardio: 'Kardio',
  beh: 'Běh',
  kolo: 'Kolo',
  chuze: 'Chůze',
  plavani: 'Plavání',
  strečink: 'Strečink',
  joga: 'Jóga',
  nordic_walking: 'Nordic walking',
  brusleni: 'Bruslení',
  lyzovani: 'Lyžování',
  sauna: 'Sauna',
  ostatni: 'Ostatní',
};

/** Hodnoty, které api/workouts.js zná a umí k nim doplnit popisek. */
export const WORKOUT_TYPES = Object.keys(WORKOUT_TYPE_LABELS);

/** Obtížnost, jak ji hlídá api/workouts.js — cokoli jiného uloží jako null. */
export const PERCEIVED_DIFFICULTIES = ['easy', 'just_right', 'hard', 'too_hard'];

/** Popisky obtížnosti pro UI. Bez hodnocení uživatele — jen jak to šlo. */
export const PERCEIVED_DIFFICULTY_LABELS = {
  easy: 'Lehké',
  just_right: 'Tak akorát',
  hard: 'Těžké',
  too_hard: 'Nad moje síly',
};

export function isValidWorkoutType(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WORKOUT_TYPE_LABELS, value);
}

export function isValidPerceivedDifficulty(value) {
  return typeof value === 'string' && PERCEIVED_DIFFICULTIES.includes(value);
}
