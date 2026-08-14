/**
 * Odvozené hodnoty tréninku: vzdálenost, trvání, kalorie, zátěž.
 *
 * Vytaženo z pages/profil.js (11. 8. → 13. 8. 2026 refaktor), kde to leželo
 * mezi 366 řádky helperů uprostřed stránky a nikdy to nemělo test. Přitom
 * jsou to čisté funkce nad jedním objektem `workout` — nic z toho nepotřebuje
 * React ani DB.
 *
 * POZOR NA TŘETÍ ZDROJ PRAVDY. `lib/progressIntegrity.js` má vlastní
 * `estimatedCaloriesSecondary()` s JINÝMI klíči typů (`cyklistika`, `jine`
 * místo `kolo`, `ostatni`) a plochou tabulkou kcal/min bez vzdálenosti.
 * Ty dvě funkce dávají pro tentýž trénink různá čísla. Sjednocení sem
 * NEPATŘÍ — je to změna chování, ne přesun; viz poznámka v refaktoru.
 */

/** Typy tréninku nabízené v UI. */
export const WORKOUT_TYPES = Object.freeze([
  { id: 'silovy', label: 'Silový', emoji: '🏋️' },
  { id: 'kardio', label: 'Kardio', emoji: '🏃' },
  { id: 'beh', label: 'Běh', emoji: '👟' },
  { id: 'kolo', label: 'Kolo', emoji: '🚴' },
  { id: 'chuze', label: 'Chůze', emoji: '🚶' },
  { id: 'plavani', label: 'Plavání', emoji: '🏊' },
  { id: 'strečink', label: 'Strečink', emoji: '🧘' },
  { id: 'joga', label: 'Jóga', emoji: '🪷' },
  { id: 'nordic_walking', label: 'Nordic walking', emoji: '🥢' },
  { id: 'brusleni', label: 'Bruslení', emoji: '⛸️' },
  { id: 'lyzovani', label: 'Lyžování', emoji: '🎿' },
  { id: 'sauna', label: 'Sauna', emoji: '🧖' },
  { id: 'ostatni', label: 'Ostatní', emoji: '✨' },
]);

export const WORKOUT_DIFFICULTY_OPTIONS = Object.freeze([
  { id: 'easy', label: 'Snadné, zvládl bych více' },
  { id: 'just_right', label: 'Tak akorát' },
  { id: 'hard', label: 'Náročné, ale zvládl jsem to' },
  { id: 'too_hard', label: 'Příliš náročné' },
]);

/** kcal a zátěž na minutu, u pohybových typů i na kilometr. */
export const WORKOUT_TYPE_SPECS = Object.freeze({
  silovy: { kcalPerMin: 5, loadPerMin: 1.1 },
  kardio: { kcalPerMin: 8, loadPerMin: 1.4 },
  beh: { kcalPerMin: 10, loadPerMin: 1.6, kcalPerKm: 60, paceMinPerKm: 6.5, loadPerKm: 9.5 },
  kolo: { kcalPerMin: 7, loadPerMin: 1.3, kcalPerKm: 30, paceMinPerKm: 3.3, loadPerKm: 5.5 },
  chuze: { kcalPerMin: 4, loadPerMin: 0.7, kcalPerKm: 35, paceMinPerKm: 12, loadPerKm: 4.2 },
  plavani: { kcalPerMin: 10, loadPerMin: 1.8, kcalPerKm: 100, loadPerKm: 12 }, // 10 kcal / 100 m
  'strečink': { kcalPerMin: 2.5, loadPerMin: 0.45 },
  strecink: { kcalPerMin: 2.5, loadPerMin: 0.45 }, // fallback bez diakritiky
  joga: { kcalPerMin: 3, loadPerMin: 0.55 },
  nordic_walking: { kcalPerMin: 6, loadPerMin: 1, kcalPerKm: 45, paceMinPerKm: 10, loadPerKm: 6.5 },
  brusleni: { kcalPerMin: 8, loadPerMin: 1.35, kcalPerKm: 50, paceMinPerKm: 5, loadPerKm: 7.8 },
  lyzovani: { kcalPerMin: 8, loadPerMin: 1.45, kcalPerKm: 55, paceMinPerKm: 6, loadPerKm: 8.4 },
  sauna: { kcalPerMin: 1.5, loadPerMin: 0.2 },
  ostatni: { kcalPerMin: 4, loadPerMin: 0.8 },
});

export const WORKOUT_DIFFICULTY_MULTIPLIER = Object.freeze({
  easy: 0.9,
  just_right: 1,
  hard: 1.12,
  too_hard: 1.2,
});

/** @param {string|null|undefined} type */
export function normalizeWorkoutTypeId(type) {
  const raw = String(type || 'ostatni').toLowerCase();
  return raw === 'strecink' ? 'strečink' : raw;
}

/** @param {string|null|undefined} type */
export function getWorkoutTypeSpec(type) {
  const normalized = normalizeWorkoutTypeId(type);
  return WORKOUT_TYPE_SPECS[normalized] || WORKOUT_TYPE_SPECS.ostatni;
}

/**
 * Poznámky uživatele nesou na konci strojová metadata za značkou `[BMO_META]`.
 * @param {string|null|undefined} rawNotes
 * @returns {{ userNotes: string, meta: Record<string, number> }}
 */
export function parseWorkoutMetaFromNotes(rawNotes) {
  const notes = typeof rawNotes === 'string' ? rawNotes : '';
  const marker = /\n?\[BMO_META\](\{[\s\S]*\})$/;
  const m = notes.match(marker);
  if (!m) return { userNotes: notes.trim(), meta: {} };
  try {
    const meta = JSON.parse(m[1]) || {};
    return { userNotes: notes.replace(marker, '').trim(), meta };
  } catch (_) {
    return { userNotes: notes.trim(), meta: {} };
  }
}

/** Kladné číslo, jinak 0. Zvládá i desetinnou čárku. */
export function parsePositiveNumber(value) {
  if (value == null || value === '') return 0;
  const normalized = String(value).trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Uživatelé (a starší data) píšou vzdálenost jednou v km, jednou v metrech.
 * Rozhoduje se podle toho, jestli by výsledek dával fyzicky smysl za daný čas.
 */
export function normalizeDistanceKmForType(type, rawKm, durationMin) {
  let km = parsePositiveNumber(rawKm);
  if (km <= 0) return 0;

  // Legacy / user-input guard: values like "1000" for run are often meters.
  if (km >= 200) km = km / 1000;

  const minutes = parsePositiveNumber(durationMin);
  if (minutes <= 0) return km;

  const hours = minutes / 60;
  const maxSpeedByType = {
    beh: 28,
    chuze: 10,
    nordic_walking: 12,
    brusleni: 45,
    lyzovani: 90,
    kolo: 90,
    plavani: 12,
  };
  const maxSpeed = maxSpeedByType[type] || 40;
  const maxReasonableKm = maxSpeed * hours * 1.25;
  if (km > maxReasonableKm) {
    const asMetersKm = km / 1000;
    if (asMetersKm > 0 && asMetersKm <= maxReasonableKm) return asMetersKm;
  }

  return km;
}

/** Protějšek parseWorkoutMetaFromNotes — zapíše metadata zpět za značku. */
export function serializeWorkoutNotesWithMeta(userNotes, meta) {
  const clean = (userNotes || '').trim();
  const normalizedMeta = {};
  Object.entries(meta || {}).forEach(([key, value]) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      normalizedMeta[key] = numeric;
    }
  });
  if (Object.keys(normalizedMeta).length === 0) return clean;
  const payload = `${clean}\n[BMO_META]${JSON.stringify(normalizedMeta)}`.trim();
  return payload;
}

/** Plavání se ukládá v metrech, ostatní v kilometrech. */
export function getWorkoutDistanceKm(workout) {
  const type = normalizeWorkoutTypeId(workout?.workout_type);
  const { meta } = parseWorkoutMetaFromNotes(workout?.notes);
  const durationMin = parsePositiveNumber(workout?.duration_min);
  if (type === 'plavani') {
    const meters = parsePositiveNumber(meta?.distance_m);
    return meters > 0 ? meters / 1000 : 0;
  }
  const km = parsePositiveNumber(meta?.distance_km);
  if (km > 0) return normalizeDistanceKmForType(type, km, durationMin);

  const metersFallback = parsePositiveNumber(meta?.distance_m);
  if (metersFallback > 0) return normalizeDistanceKmForType(type, metersFallback / 1000, durationMin);
  return 0;
}

/** Zadané trvání, jinak dopočet ze vzdálenosti a typického tempa. */
export function getWorkoutDurationMinutes(workout) {
  const explicit = Number(workout?.duration_min) || 0;
  if (explicit > 0) return explicit;
  const type = normalizeWorkoutTypeId(workout?.workout_type);
  const km = getWorkoutDistanceKm(workout);
  const pace = getWorkoutTypeSpec(type)?.paceMinPerKm;
  if (km > 0 && pace) return Math.round(km * pace);
  return 0;
}

/** Popisek pro UI — „1 500 m“ u plavání, „12 km“ jinde, prázdno bez vzdálenosti. */
export function getWorkoutDetailLabel(workout) {
  const type = normalizeWorkoutTypeId(workout?.workout_type);
  const { meta } = parseWorkoutMetaFromNotes(workout?.notes);
  if (type === 'plavani') {
    const meters = parsePositiveNumber(meta?.distance_m);
    if (meters > 0) return `${meters} m`;
  }
  const km = getWorkoutDistanceKm(workout);
  if (km > 0) return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  return '';
}

/** Odhad kalorií: přednost má vzdálenost, teprve pak čas. */
export function estimatedCalories(workout) {
  const type = normalizeWorkoutTypeId(workout?.workout_type);
  const spec = getWorkoutTypeSpec(type);
  const km = getWorkoutDistanceKm(workout);
  if (km > 0) {
    const perKm = spec?.kcalPerKm;
    if (perKm) return Math.round(km * perKm);
  }
  const min = getWorkoutDurationMinutes(workout);
  const kcalPerMin = spec?.kcalPerMin ?? WORKOUT_TYPE_SPECS.ostatni.kcalPerMin;
  return Math.round(min * kcalPerMin);
}

/** Body zátěže pro týdenní graf — základ × násobek podle pocitu z tréninku. */
export function getWorkoutLoadPoints(workout) {
  const type = normalizeWorkoutTypeId(workout?.workout_type);
  const spec = getWorkoutTypeSpec(type);
  const km = getWorkoutDistanceKm(workout);
  const minutes = getWorkoutDurationMinutes(workout);
  const difficultyMul = WORKOUT_DIFFICULTY_MULTIPLIER[workout?.perceived_difficulty] || 1;

  const baseLoad = km > 0 && spec?.loadPerKm
    ? km * spec.loadPerKm
    : minutes * (spec?.loadPerMin ?? WORKOUT_TYPE_SPECS.ostatni.loadPerMin);

  return Math.round(baseLoad * difficultyMul * 10) / 10;
}
