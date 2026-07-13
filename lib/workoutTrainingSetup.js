/**
 * Místo tréninku a úroveň vybavení — oddělené od sebe (modal změny tréninku).
 */

export const TRAINING_LOCATIONS = Object.freeze(['home', 'gym', 'outdoor']);
export const EQUIPMENT_LEVELS = Object.freeze(['bodyweight', 'basic', 'full_gym']);

export const LOCATION_OPTIONS = Object.freeze([
  { id: 'home', label: 'Doma' },
  { id: 'gym', label: 'Fitness centrum' },
  { id: 'outdoor', label: 'Venku' },
]);

export const EQUIPMENT_OPTIONS = Object.freeze([
  { id: 'bodyweight', label: 'Bez vybavení' },
  { id: 'basic', label: 'Základní vybavení', hint: 'Například jednoručky, odporové gumy nebo podložka.' },
  { id: 'full_gym', label: 'Plně vybavené fitness' },
]);

export const DEFAULT_EQUIPMENT_BY_LOCATION = Object.freeze({
  home: 'basic',
  gym: 'full_gym',
  outdoor: 'bodyweight',
});

const LEGACY_LOCATION_MAP = Object.freeze({
  home: { training_location: 'home', equipment_level: 'basic' },
  gym: { training_location: 'gym', equipment_level: 'full_gym' },
  no_equipment: { training_location: 'home', equipment_level: 'bodyweight' },
});

/**
 * @param {object} body — request body
 * @returns {{ ok: boolean, training_location?: string, equipment_level?: string, error?: string }}
 */
export function normalizeTrainingSetupInput(body) {
  const hasNew = TRAINING_LOCATIONS.includes(body?.training_location)
    && EQUIPMENT_LEVELS.includes(body?.equipment_level);

  if (hasNew) {
    return {
      ok: true,
      training_location: body.training_location,
      equipment_level: body.equipment_level,
    };
  }

  const legacy = String(body?.location || '').trim();
  if (LEGACY_LOCATION_MAP[legacy]) {
    return { ok: true, ...LEGACY_LOCATION_MAP[legacy] };
  }

  if (body?.training_location && !TRAINING_LOCATIONS.includes(body.training_location)) {
    return { ok: false, error: 'Neplatné místo tréninku.' };
  }
  if (body?.equipment_level && !EQUIPMENT_LEVELS.includes(body.equipment_level)) {
    return { ok: false, error: 'Neplatná úroveň vybavení.' };
  }

  return {
    ok: true,
    training_location: 'gym',
    equipment_level: 'full_gym',
  };
}

/**
 * @param {{ training_location: string, equipment_level: string }} setup
 * @param {object} baseMetrics
 */
export function trainingSetupToBodyMetrics(setup, baseMetrics = {}) {
  const { training_location, equipment_level } = setup;
  const base = { ...baseMetrics };

  if (equipment_level === 'full_gym' || training_location === 'gym') {
    return { ...base, training_environment: 'gym', available_equipment: '' };
  }
  if (equipment_level === 'bodyweight') {
    return { ...base, training_environment: 'home_bodyweight', available_equipment: '' };
  }
  return {
    ...base,
    training_environment: 'home_equipment',
    available_equipment: 'dumbbells,bands,bench',
  };
}

export function equipmentLevelLabel(level) {
  const hit = EQUIPMENT_OPTIONS.find((o) => o.id === level);
  return hit?.label || level;
}

export function trainingLocationLabel(location) {
  const hit = LOCATION_OPTIONS.find((o) => o.id === location);
  return hit?.label || location;
}

/** Pro zpětnou kompatibilitu DB sloupce location. */
export function legacyLocationField(training_location) {
  if (training_location === 'gym') return 'gym';
  if (training_location === 'outdoor') return 'outdoor';
  return 'home';
}
