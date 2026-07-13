/** Partie pro změnu dnešního tréninku — canonical IDs + české labely. */

export const MUSCLE_GROUP_IDS = Object.freeze([
  'full_body',
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

export const MUSCLE_GROUP_LABELS_CS = Object.freeze({
  full_body: 'Celé tělo',
  chest: 'Prsa',
  back: 'Záda',
  shoulders: 'Ramena',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Břicho',
  glutes: 'Hýždě',
  quads: 'Přední stehna',
  hamstrings: 'Zadní stehna',
  calves: 'Lýtka',
});

export const MAX_SPECIFIC_MUSCLE_GROUPS = 4;

/**
 * @param {string[]} groups
 * @returns {{ ok: boolean, error?: string, normalized: string[] }}
 */
export function normalizeMuscleGroupSelection(groups) {
  const raw = Array.isArray(groups) ? groups.map((g) => String(g || '').trim()) : [];
  if (!raw.length) return { ok: false, error: 'Vyber alespoň jednu partii.', normalized: [] };

  const unique = [...new Set(raw)];
  const invalid = unique.filter((g) => !MUSCLE_GROUP_IDS.includes(g));
  if (invalid.length) return { ok: false, error: 'Neplatná partie.', normalized: [] };

  if (unique.includes('full_body')) {
    return { ok: true, normalized: ['full_body'] };
  }

  if (unique.length > MAX_SPECIFIC_MUSCLE_GROUPS) {
    return { ok: false, error: `Maximálně ${MAX_SPECIFIC_MUSCLE_GROUPS} partie.`, normalized: [] };
  }

  return { ok: true, normalized: unique };
}

export function getMuscleGroupLabel(id) {
  return MUSCLE_GROUP_LABELS_CS[id] || id;
}
