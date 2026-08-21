/**
 * Tréninková logika výběru partií pro změnu dnešního tréninku.
 * Používá se na klientu i serveru — UI nesmí být jediná ochrana.
 */

import { MUSCLE_GROUP_IDS, MUSCLE_GROUP_LABELS_CS } from './muscleGroupLabels.js';

export const MUSCLE_GROUPS = Object.freeze([...MUSCLE_GROUP_IDS.filter((id) => id !== 'full_body')]);

export const MUSCLE_GROUP_CATEGORY = Object.freeze({
  chest: 'push',
  shoulders: 'push',
  triceps: 'push',
  back: 'pull',
  biceps: 'pull',
  glutes: 'legs',
  quads: 'legs',
  hamstrings: 'legs',
  calves: 'legs',
  core: 'core',
  full_body: 'full_body',
});

export const CATEGORY_MUSCLES = Object.freeze({
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'biceps'],
  legs: ['glutes', 'quads', 'hamstrings', 'calves'],
  core: ['core'],
  full_body: ['full_body'],
});

/** Všechny SVG oblasti zvýrazněné při full_body. */
export const FULL_BODY_HIGHLIGHT_PARTS = Object.freeze([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
]);

export const FRONT_VIEW_PARTS = Object.freeze(['chest', 'shoulders', 'biceps', 'core', 'quads', 'calves']);
export const BACK_VIEW_PARTS = Object.freeze(['back', 'shoulders', 'triceps', 'glutes', 'hamstrings', 'calves']);

/** Povolené podmnožiny v rámci kategorie (MVP). */
export const ALLOWED_COMBINATIONS = Object.freeze({
  push: [
    ['chest'],
    ['chest', 'triceps'],
    ['chest', 'shoulders'],
    ['chest', 'shoulders', 'triceps'],
    ['shoulders'],
    ['shoulders', 'triceps'],
    ['triceps'],
  ],
  pull: [
    ['back'],
    ['back', 'biceps'],
    ['biceps'],
  ],
  legs: [
    ['quads'],
    ['hamstrings'],
    ['glutes'],
    ['calves'],
    ['quads', 'glutes'],
    ['quads', 'hamstrings'],
    ['hamstrings', 'glutes'],
    ['quads', 'calves'],
    ['hamstrings', 'calves'],
    ['glutes', 'hamstrings', 'quads'],
    ['glutes', 'quads', 'hamstrings', 'calves'],
  ],
  core: [['core']],
  full_body: [['full_body']],
});

export const RECOMMENDED_PRESETS = Object.freeze([
  { id: 'full_body', label: 'Celé tělo', muscles: ['full_body'] },
  { id: 'chest_triceps', label: 'Prsa + triceps', muscles: ['chest', 'triceps'] },
  { id: 'back_biceps', label: 'Záda + biceps', muscles: ['back', 'biceps'] },
  { id: 'shoulders_triceps', label: 'Ramena + triceps', muscles: ['shoulders', 'triceps'] },
  { id: 'legs', label: 'Nohy', muscles: ['glutes', 'quads', 'hamstrings', 'calves'] },
  { id: 'glutes_hamstrings', label: 'Hýždě + zadní stehna', muscles: ['glutes', 'hamstrings'] },
  { id: 'core', label: 'Břicho', muscles: ['core'] },
]);

const UPPER_MUSCLES = new Set(['chest', 'back', 'shoulders', 'biceps', 'triceps']);
const LOWER_MUSCLES = new Set(['glutes', 'quads', 'hamstrings', 'calves']);
const PUSH_MUSCLES = new Set(CATEGORY_MUSCLES.push);
const PULL_MUSCLES = new Set(CATEGORY_MUSCLES.pull);
const LEG_MUSCLES = new Set(CATEGORY_MUSCLES.legs);

function normalizeList(groups) {
  const raw = Array.isArray(groups) ? groups.map((g) => String(g || '').trim()) : [];
  return [...new Set(raw)].filter(Boolean);
}

function sortKey(arr) {
  return [...arr].sort().join(',');
}

function comboAllowed(category, mainMuscles) {
  const allowed = ALLOWED_COMBINATIONS[category] || [];
  const key = sortKey(mainMuscles);
  return allowed.some((combo) => sortKey(combo) === key);
}

/**
 * @param {string[]} selectedMuscleGroups
 * @returns {string[]}
 */
export function getHighlightedBodyParts(selectedMuscleGroups) {
  const selected = normalizeList(selectedMuscleGroups);
  if (selected.includes('full_body')) return [...FULL_BODY_HIGHLIGHT_PARTS];
  return selected.filter((id) => MUSCLE_GROUPS.includes(id));
}

/**
 * @param {string} muscleId
 * @param {string[]} selectedMuscleGroups
 */
export function isMuscleHighlighted(muscleId, selectedMuscleGroups) {
  return getHighlightedBodyParts(selectedMuscleGroups).includes(muscleId);
}

/**
 * @param {number} durationMinutes
 * @returns {number}
 */
export function getMaxMuscleGroupsForDuration(durationMinutes) {
  const d = Number(durationMinutes) || 30;
  if (d <= 15) return 1;
  if (d <= 30) return 2;
  if (d <= 45) return 3;
  return 4;
}

/**
 * Hlavní partie = bez core.
 * @param {string[]} selected
 */
function getMainMuscles(selected) {
  return selected.filter((id) => id !== 'core' && id !== 'full_body');
}

function countTowardDurationLimit(main, category) {
  if (category === 'legs') {
    const legCount = main.filter((m) => LEG_MUSCLES.has(m)).length;
    if (legCount === CATEGORY_MUSCLES.legs.length) return 1;
    return legCount;
  }
  return main.length;
}

/**
 * @param {string[]} selectedMuscleGroups
 * @returns {'push'|'pull'|'legs'|'core'|'full_body'|null}
 */
export function getSelectionCategory(selectedMuscleGroups) {
  const selected = normalizeList(selectedMuscleGroups);
  if (!selected.length) return null;
  if (selected.includes('full_body')) return 'full_body';
  if (selected.length === 1 && selected[0] === 'core') return 'core';

  const main = getMainMuscles(selected);
  if (!main.length) return 'core';

  const hasPush = main.some((m) => PUSH_MUSCLES.has(m));
  const hasPull = main.some((m) => PULL_MUSCLES.has(m));
  const hasLegs = main.some((m) => LEG_MUSCLES.has(m));

  if (hasPush && hasPull) return null;
  if ((hasPush || hasPull) && hasLegs) return null;
  if (hasLegs) return 'legs';
  if (hasPush) return 'push';
  if (hasPull) return 'pull';
  return null;
}

function getActiveCategoryForSelection(selected) {
  if (selected.includes('full_body')) return 'full_body';
  const main = getMainMuscles(selected);
  if (!main.length) return null;
  return getSelectionCategory(selected);
}

/**
 * @param {string[]} selectedMuscleGroups
 * @param {number} durationMinutes
 */
export function getAllowedNextMuscles(selectedMuscleGroups, durationMinutes = 30) {
  const selected = normalizeList(selectedMuscleGroups);
  if (!selected.length) return [...MUSCLE_GROUPS, 'full_body'];

  if (selected.includes('full_body')) return ['full_body'];

  const category = getActiveCategoryForSelection(selected);
  if (!category || category === 'core') {
    return [...MUSCLE_GROUPS, 'full_body'];
  }

  const main = getMainMuscles(selected);
  const maxMain = getMaxMuscleGroupsForDuration(durationMinutes);
  const allowed = new Set();

  if (category === 'push') {
    CATEGORY_MUSCLES.push.forEach((m) => allowed.add(m));
  } else if (category === 'pull') {
    CATEGORY_MUSCLES.pull.forEach((m) => allowed.add(m));
  } else if (category === 'legs') {
    CATEGORY_MUSCLES.legs.forEach((m) => allowed.add(m));
  }

  allowed.add('core');

  const durationCount = countTowardDurationLimit(main, category);
  if (durationCount >= maxMain) {
    main.forEach((m) => allowed.add(m));
    if (selected.includes('core')) allowed.add('core');
    return [...allowed];
  }

  return [...allowed];
}

function disabledReason(muscleId, selected, durationMinutes) {
  const selectedNorm = normalizeList(selected);
  if (!selectedNorm.length) return null;

  if (muscleId === 'full_body') return null;

  if (selectedNorm.includes('full_body')) {
    return 'Pro výběr konkrétní partie klikni na partii — celé tělo se zruší.';
  }

  const allowed = new Set(getAllowedNextMuscles(selectedNorm, durationMinutes));
  if (allowed.has(muscleId)) return null;

  const main = getMainMuscles(selectedNorm);
  const category = getActiveCategoryForSelection(selectedNorm);

  if (LOWER_MUSCLES.has(muscleId) && main.some((m) => UPPER_MUSCLES.has(m))) {
    return 'Pro trénink horní části těla nelze současně přidat nohy. Vyber buď nohy, nebo horní část těla.';
  }
  if (UPPER_MUSCLES.has(muscleId) && main.some((m) => LOWER_MUSCLES.has(m))) {
    return 'Pro trénink nohou nelze současně přidat horní partie. Vyber buď nohy, nebo horní část těla.';
  }
  if (PUSH_MUSCLES.has(muscleId) && main.some((m) => PULL_MUSCLES.has(m))) {
    return 'Prsa a záda nelze kombinovat do jednoho tréninku. Vyber push (prsa/ramena/triceps) nebo pull (záda/biceps).';
  }
  if (PULL_MUSCLES.has(muscleId) && main.some((m) => PUSH_MUSCLES.has(m))) {
    return 'Prsa a záda nelze kombinovat do jednoho tréninku. Vyber push (prsa/ramena/triceps) nebo pull (záda/biceps).';
  }
  if (category && !comboAllowed(category, [...main, muscleId].filter((m) => m !== 'core' && CATEGORY_MUSCLES[category]?.includes(m)))) {
    return 'Tato partie se nehodí k aktuálně vybranému zaměření. Nejdřív zruš současný výběr.';
  }

  return 'Tato partie se nehodí k aktuálně vybranému zaměření. Nejdřív zruš současný výběr.';
}

/**
 * @param {string[]} selectedMuscleGroups
 * @param {number} durationMinutes
 */
export function getDisabledMuscles(selectedMuscleGroups, durationMinutes = 30) {
  const selected = normalizeList(selectedMuscleGroups);
  const disabled = [];
  const all = [...MUSCLE_GROUPS, 'full_body'];

  for (const id of all) {
    if (id === 'full_body') continue;
    if (selected.includes('full_body')) continue;
    const allowed = getAllowedNextMuscles(selected, durationMinutes);
    const main = getMainMuscles(selected);
    const maxMain = getMaxMuscleGroupsForDuration(durationMinutes);
    const category = getActiveCategoryForSelection(selected);
    const durationCount = countTowardDurationLimit(main, category);
    const isSelected = selected.includes(id);

    if (isSelected) continue;

    if (!allowed.includes(id)) {
      disabled.push(id);
      continue;
    }

    if (!isSelected && durationCount >= maxMain && id !== 'core') {
      disabled.push(id);
    }
  }

  return disabled;
}

/**
 * @param {object} params
 * @param {string[]} params.selectedMuscleGroups
 * @param {number} params.durationMinutes
 */
export function validateMuscleSelection({ selectedMuscleGroups, durationMinutes = 30 }) {
  const selected = normalizeList(selectedMuscleGroups);
  const duration = [15, 30, 45, 60].includes(Number(durationMinutes)) ? Number(durationMinutes) : 30;
  const allowedNext = getAllowedNextMuscles(selected, duration);
  const disabledMuscles = getDisabledMuscles(selected, duration);

  const invalidIds = selected.filter((id) => !MUSCLE_GROUP_IDS.includes(id));
  if (invalidIds.length) {
    return {
      valid: false,
      category: null,
      errorCode: 'invalid_group_combination',
      message: 'Neplatná partie.',
      allowedNextMuscles: [],
      disabledMuscles: [...MUSCLE_GROUPS],
    };
  }

  if (!selected.length) {
    return {
      valid: false,
      category: null,
      errorCode: 'no_muscle_selected',
      message: 'Vyber alespoň jednu partii.',
      allowedNextMuscles: [...MUSCLE_GROUPS, 'full_body'],
      disabledMuscles: [],
    };
  }

  if (selected.includes('full_body')) {
    if (selected.length > 1) {
      return {
        valid: false,
        category: 'full_body',
        errorCode: 'full_body_must_be_single',
        message: 'Celé tělo nelze kombinovat s dalšími partiemi.',
        allowedNextMuscles: ['full_body'],
        disabledMuscles: MUSCLE_GROUPS,
      };
    }
    return {
      valid: true,
      category: 'full_body',
      errorCode: null,
      message: null,
      allowedNextMuscles: ['full_body'],
      disabledMuscles: MUSCLE_GROUPS,
    };
  }

  const category = getSelectionCategory(selected);
  if (!category) {
    return {
      valid: false,
      category: null,
      errorCode: 'incompatible_muscle_groups',
      message: 'Vybrané partie nelze spojit do jednoho smysluplného tréninku.',
      allowedNextMuscles: allowedNext,
      disabledMuscles,
    };
  }

  const main = getMainMuscles(selected);
  const hasCore = selected.includes('core');

  if (category === 'core' && selected.length === 1) {
    return {
      valid: true,
      category: 'core',
      errorCode: null,
      message: null,
      allowedNextMuscles: allowedNext,
      disabledMuscles,
    };
  }

  if (!main.length && hasCore) {
    return {
      valid: true,
      category: 'core',
      errorCode: null,
      message: null,
      allowedNextMuscles: allowedNext,
      disabledMuscles,
    };
  }

  if (!comboAllowed(category, main)) {
    return {
      valid: false,
      category,
      errorCode: 'invalid_group_combination',
      message: 'Tato kombinace partií není pro jeden trénink vhodná.',
      allowedNextMuscles: allowedNext,
      disabledMuscles,
    };
  }

  const maxMain = getMaxMuscleGroupsForDuration(duration);
  const durationCount = countTowardDurationLimit(main, category);
  if (durationCount > maxMain) {
    const msg = duration <= 15
      ? 'Pro 15 minut je vybráno příliš mnoho partií. Zvol jednu hlavní partii nebo celé tělo.'
      : `Pro ${duration} minut je vybráno příliš mnoho partií. Zvol méně partií nebo celé tělo.`;
    return {
      valid: false,
      category,
      errorCode: 'too_many_groups_for_duration',
      message: msg,
      allowedNextMuscles: allowedNext,
      disabledMuscles,
    };
  }

  if (hasCore && main.length > 0) {
    const withCore = [...main, 'core'];
    const cat = getSelectionCategory(withCore);
    if (!cat || !comboAllowed(cat === 'core' ? category : cat, main)) {
      return {
        valid: false,
        category,
        errorCode: 'invalid_group_combination',
        message: 'Břicho lze přidat jen k jedné hlavní skupině.',
        allowedNextMuscles: allowedNext,
        disabledMuscles,
      };
    }
  }

  return {
    valid: true,
    category,
    errorCode: null,
    message: null,
    allowedNextMuscles: allowedNext,
    disabledMuscles,
  };
}

/**
 * @param {string} muscleId
 * @param {string[]} selectedMuscleGroups
 * @param {number} durationMinutes
 */
export function getMuscleDisabledReason(muscleId, selectedMuscleGroups, durationMinutes = 30) {
  const selected = normalizeList(selectedMuscleGroups);
  if (!selected.length) return null;
  if (selected.includes(muscleId)) return null;
  if (muscleId === 'full_body') return null;

  const disabled = getDisabledMuscles(selected, durationMinutes);
  if (!disabled.includes(muscleId)) return null;
  return disabledReason(muscleId, selected, durationMinutes);
}

/**
 * @param {string[]} prev
 * @param {string} muscleId
 * @param {number} durationMinutes
 * @returns {{ next: string[], blocked: boolean, reason: string|null }}
 */
export function toggleMuscleInSelection(prev, muscleId, durationMinutes = 30) {
  const selected = normalizeList(prev);

  if (muscleId === 'full_body') {
    if (selected.includes('full_body')) return { next: ['full_body'], blocked: false, reason: null };
    return { next: ['full_body'], blocked: false, reason: null };
  }

  if (selected.includes('full_body')) {
    return { next: [muscleId], blocked: false, reason: null };
  }

  if (selected.includes(muscleId)) {
    const next = selected.filter((id) => id !== muscleId);
    return { next, blocked: false, reason: null };
  }

  const reason = getMuscleDisabledReason(muscleId, selected, durationMinutes);
  if (reason) {
    return { next: selected, blocked: true, reason };
  }

  const next = [...selected, muscleId];
  const validation = validateMuscleSelection({ selectedMuscleGroups: next, durationMinutes });
  if (!validation.valid) {
    return { next: selected, blocked: true, reason: validation.message };
  }

  return { next, blocked: false, reason: null };
}

/**
 * @param {string[]} selectedMuscleGroups
 * @param {number} durationMinutes
 */
export function getSelectionSuggestion(selectedMuscleGroups, durationMinutes = 30) {
  const validation = validateMuscleSelection({ selectedMuscleGroups, durationMinutes });
  if (validation.valid) return null;
  return validation.message;
}

export function getMuscleGroupLabel(id) {
  return MUSCLE_GROUP_LABELS_CS[id] || id;
}

/** SVG zóny viditelné zepředu / zezadu. */
export const FRONT_SVG_ZONES = Object.freeze([
  'chest',
  'shoulders_left', 'shoulders_right',
  'biceps_left', 'biceps_right',
  'core',
  'quads_left', 'quads_right',
  'calves_left', 'calves_right',
]);

export const BACK_SVG_ZONES = Object.freeze([
  'back',
  'shoulders_left', 'shoulders_right',
  'triceps_left', 'triceps_right',
  'glutes',
  'hamstrings_left', 'hamstrings_right',
  'calves_left', 'calves_right',
]);

const MUSCLE_TO_SVG_ZONES = Object.freeze({
  chest: ['chest'],
  shoulders: ['shoulders_left', 'shoulders_right'],
  biceps: ['biceps_left', 'biceps_right'],
  triceps: ['triceps_left', 'triceps_right'],
  core: ['core'],
  back: ['back'],
  glutes: ['glutes'],
  quads: ['quads_left', 'quads_right'],
  hamstrings: ['hamstrings_left', 'hamstrings_right'],
  calves: ['calves_left', 'calves_right'],
});

const MUSCLE_BEST_VIEW = Object.freeze({
  chest: 'front',
  core: 'front',
  quads: 'front',
  biceps: 'front',
  back: 'back',
  glutes: 'back',
  hamstrings: 'back',
  triceps: 'back',
  shoulders: 'both',
  calves: 'both',
});

const VISIBILITY_MESSAGES = Object.freeze({
  chest: { message: 'Prsa jsou lépe vidět zepředu.', suggestedView: 'front', buttonLabel: 'Zobrazit zepředu' },
  core: { message: 'Břicho je lépe vidět zepředu.', suggestedView: 'front', buttonLabel: 'Zobrazit zepředu' },
  quads: { message: 'Přední stehna jsou lépe vidět zepředu.', suggestedView: 'front', buttonLabel: 'Zobrazit zepředu' },
  biceps: { message: 'Biceps je lépe vidět zepředu.', suggestedView: 'front', buttonLabel: 'Zobrazit zepředu' },
  back: { message: 'Záda jsou lépe vidět zezadu.', suggestedView: 'back', buttonLabel: 'Zobrazit zezadu' },
  glutes: { message: 'Hýždě jsou lépe vidět zezadu.', suggestedView: 'back', buttonLabel: 'Zobrazit zezadu' },
  hamstrings: { message: 'Zadní stehna jsou lépe vidět zezadu.', suggestedView: 'back', buttonLabel: 'Zobrazit zezadu' },
  triceps: { message: 'Triceps je lépe vidět zezadu.', suggestedView: 'back', buttonLabel: 'Zobrazit zezadu' },
});

/**
 * @param {string} muscleId — canonical skupina
 * @returns {string[]}
 */
export function getSvgZonesForMuscle(muscleId) {
  if (muscleId === 'full_body') return [];
  return [...(MUSCLE_TO_SVG_ZONES[muscleId] || [])];
}

/**
 * @param {string[]} selectedMuscleGroups
 * @returns {'front'|'back'}
 */
export function getRecommendedBodyView(selectedMuscleGroups) {
  const selected = normalizeList(selectedMuscleGroups);
  if (!selected.length) return 'front';
  if (selected.includes('full_body')) return 'front';

  const main = selected.filter((id) => id !== 'core');
  const key = sortKey(main);

  if (key === 'back,biceps' || key === 'glutes,hamstrings') return 'back';

  if (selected.length === 1) {
    const id = selected[0];
    if (['back', 'glutes', 'hamstrings', 'triceps'].includes(id)) return 'back';
    return 'front';
  }

  if (key === 'calves,glutes,hamstrings,quads') return 'front';

  const frontMuscles = new Set(['chest', 'core', 'quads', 'biceps']);
  const backMuscles = new Set(['back', 'glutes', 'hamstrings', 'triceps']);
  const hasFront = selected.some((m) => frontMuscles.has(m));
  const hasBack = selected.some((m) => backMuscles.has(m));

  if (hasBack && !hasFront) return 'back';

  if (key === 'chest,triceps' || key === 'chest,shoulders' || key === 'shoulders,triceps') return 'front';

  return 'front';
}

/**
 * @param {string} zone — SVG zone id
 * @param {string[]} selectedMuscleGroups
 * @param {'front'|'back'} view
 */
export function isBodyZoneHighlighted(zone, selectedMuscleGroups, view = 'front') {
  const selected = normalizeList(selectedMuscleGroups);
  if (!selected.length) return false;

  const viewZones = view === 'back' ? BACK_SVG_ZONES : FRONT_SVG_ZONES;
  if (!viewZones.includes(zone)) return false;

  if (selected.includes('full_body')) return true;

  for (const muscleId of selected) {
    let zones = getSvgZonesForMuscle(muscleId);
    if (view === 'front' && muscleId === 'triceps') {
      zones = [...zones, 'biceps_left', 'biceps_right'];
    }
    if (view === 'back' && muscleId === 'biceps') {
      zones = [...zones, 'triceps_left', 'triceps_right'];
    }
    if (zones.includes(zone)) return true;
  }
  return false;
}

/**
 * @param {string[]} selectedMuscleGroups
 * @param {'front'|'back'} currentView
 * @returns {{ message: string, suggestedView: 'front'|'back', buttonLabel: string }|null}
 */
export function getMuscleVisibilityGuidance(selectedMuscleGroups, currentView) {
  const selected = normalizeList(selectedMuscleGroups);
  if (!selected.length || selected.includes('full_body')) return null;

  for (const muscleId of selected) {
    const best = MUSCLE_BEST_VIEW[muscleId];
    if (best === 'both' || best === currentView) continue;
    const guidance = VISIBILITY_MESSAGES[muscleId];
    if (guidance && guidance.suggestedView !== currentView) return guidance;
  }
  return null;
}

/** Všechny zóny zvýrazněné pro full_body v daném pohledu. */
export function getFullBodyZonesForView(view = 'front') {
  return view === 'back' ? [...BACK_SVG_ZONES] : [...FRONT_SVG_ZONES];
}
