/** Centrální české labely návyků pro UI (DB klíče beze změny). */

const HABIT_LABELS = {
  training: 'Pohyb nebo trénink',
  healthy_diet: 'Vyvážené stravování',
  quality_sleep: 'Kvalitní spánek',
  daily_movement: 'Denní pohyb',
  mobility_stretch: 'Mobilita / strečink',
  meditation: 'Meditace',
  breathing: 'Dechové cvičení',
  digital_detox_evening: 'Digitální detox',
  hydration: 'Pitný režim',
  cold_shower: 'Studená sprcha',
  smoking: 'Kouření',
  alcohol: 'Alkohol',
  junk_food: 'Junk food / průmyslový cukr',
  social_media_scroll: 'Nadměrné scrollování sítí',
  poor_sleep: 'Nedostatek spánku',
};

function snakeToReadable(id) {
  return String(id || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * @param {string} habitId
 * @returns {string}
 */
export function getHabitDisplayLabel(habitId) {
  const id = String(habitId || '').trim();
  if (!id) return '';
  if (HABIT_LABELS[id]) return HABIT_LABELS[id];
  return snakeToReadable(id);
}

export { HABIT_LABELS };
