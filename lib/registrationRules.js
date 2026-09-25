/**
 * Jedna zdrojová pravda pro pravidla registrace ve všech programech (START, ON Club, VIP).
 * Registrace musí vždy probíhat dle pravidel ON Club: https://app.bodyandmindon.cz/on-club
 *
 * - 5 kroků: (1) Jméno, e-mail, heslo (2) Pohlaví, datum narození, výška, váha (3) Aktivita, stres, cíl, frekvence, tréninkové dny
 *   (4) Strava a omezení – volitelné (5) Výběr návyků
 * - Jediný backend: POST /api/body-metrics s polem program: 'START' | 'ON_CLUB' | 'VIP'
 * - Stejná validace: výška 100–250 cm, váha 30–300 kg, věk 15–100, heslo min. 10 znaků
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

/**
 * Věk: min/max (registrace — datum narození).
 * Od 25. 9. 2026 je minimum 18 (dřív 15): smlouvu o placeném předplatném
 * uzavírá sám uživatel a obchodní podmínky počítají se zletilým spotřebitelem.
 * Hlídá klient (krok 2 registrace) i server (api/body-metrics, profile-body-data).
 */
export const AGE_MIN = 18;
export const AGE_MAX = 100;
export const AGE_MIN_MESSAGE_CS = 'Body & Mind ON je pro lidi od 18 let.';

/**
 * Minimální délka hesla. MUSÍ sedět s politikou Supabase Auth projektu
 * (min. 10 znaků). Do 25. 9. 2026 tu bylo 6: heslo o 6–9 znacích prošlo
 * naší validací, Supabase ho odmítl (422 „Password should be at least 10
 * characters.") a registrace to vydávala za „účet už existuje".
 */
export const PASSWORD_MIN_LENGTH = 10;

/** Hláška při krátkém hesle — jedna pro frontend, API i chybu ze Supabase. */
export const PASSWORD_TOO_SHORT_MESSAGE_CS = `Heslo musí mít alespoň ${PASSWORD_MIN_LENGTH} znaků.`;

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
  if (n < AGE_MIN) return { valid: false, error: AGE_MIN_MESSAGE_CS };
  if (n > AGE_MAX) {
    return { valid: false, error: `Věk musí být mezi ${AGE_MIN} a ${AGE_MAX}.` };
  }
  return { valid: true };
}

/**
 * Ověří heslo (min. délka). Vrací { valid: boolean, error?: string }.
 */
export function validatePassword(value) {
  if (typeof value !== 'string') return { valid: false, error: PASSWORD_TOO_SHORT_MESSAGE_CS };
  if (value.trim().length < PASSWORD_MIN_LENGTH) return { valid: false, error: PASSWORD_TOO_SHORT_MESSAGE_CS };
  return { valid: true };
}
