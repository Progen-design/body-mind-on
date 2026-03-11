/**
 * Jedna zdrojová pravda pro pravidla registrace ve všech programech (START, ON Club, VIP).
 * Registrace musí vždy probíhat dle pravidel ON Club: https://app.bodyandmindon.cz/on-club
 *
 * - 5 kroků: (1) Jméno, e-mail, heslo (2) Pohlaví, věk, výška, váha (3) Aktivita, stres, cíl, frekvence, tréninkové dny
 *   (4) Strava a omezení – volitelné (5) Výběr návyků
 * - Jediný backend: POST /api/body-metrics s polem program: 'START' | 'ON_CLUB' | 'VIP'
 * - Stejná validace: výška 100–250 cm, váha 30–300 kg, věk 15–120, heslo min. 6 znaků
 * - Po registraci: createInitialAITasks, scheduler/direct execute, memberships upsert, redirect na přihlášení
 */

export const REGISTRATION_REFERENCE_URL = 'https://app.bodyandmindon.cz/on-club';

/** Počet kroků registračního formuláře (všechny programy). */
export const REGISTRATION_STEPS = 5;

/** Povolené hodnoty pole program v body-metrics. */
export const PROGRAMS = Object.freeze(['START', 'ON_CLUB', 'VIP']);

/** Výška: min/max v cm (validace na API i frontendu). */
export const HEIGHT_CM_MIN = 100;
export const HEIGHT_CM_MAX = 250;

/** Váha: min/max v kg. */
export const WEIGHT_KG_MIN = 30;
export const WEIGHT_KG_MAX = 300;

/** Věk: min/max. */
export const AGE_MIN = 15;
export const AGE_MAX = 120;

/** Minimální délka hesla. */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * Ověří výšku (cm). Vrací { valid: boolean, error?: string }.
 */
export function validateHeightCm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return { valid: false, error: 'Výška musí být číslo.' };
  if (n < HEIGHT_CM_MIN || n > HEIGHT_CM_MAX) return { valid: false, error: 'Výška musí být mezi 100 a 250 cm.' };
  return { valid: true };
}

/**
 * Ověří váhu (kg). Vrací { valid: boolean, error?: string }.
 */
export function validateWeightKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return { valid: false, error: 'Váha musí být číslo.' };
  if (n < WEIGHT_KG_MIN || n > WEIGHT_KG_MAX) return { valid: false, error: 'Váha musí být mezi 30 a 300 kg.' };
  return { valid: true };
}

/**
 * Ověří věk. Vrací { valid: boolean, error?: string }.
 */
export function validateAge(value) {
  if (value == null || value === '') return { valid: true };
  const n = Number(value);
  if (!Number.isFinite(n)) return { valid: false, error: 'Věk musí být číslo.' };
  if (n < AGE_MIN || n > AGE_MAX) return { valid: false, error: 'Věk musí být mezi 15 a 120.' };
  return { valid: true };
}

/**
 * Ověří heslo (min. délka). Vrací { valid: boolean, error?: string }.
 */
export function validatePassword(value) {
  if (typeof value !== 'string') return { valid: false, error: 'Heslo musí mít alespoň 6 znaků.' };
  if (value.trim().length < PASSWORD_MIN_LENGTH) return { valid: false, error: 'Heslo musí mít alespoň 6 znaků.' };
  return { valid: true };
}
