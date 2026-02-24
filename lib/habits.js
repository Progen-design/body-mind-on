// lib/habits.js – definice návyků pro habit tracker

export const POSITIVE_HABITS = [
  { id: 'training', label: 'Trénink', emoji: '🏋️' },
  { id: 'daily_movement', label: 'Denní pohyb', emoji: '🚶' },
  { id: 'mobility_stretch', label: 'Mobilita / Strečink', emoji: '🧘' },
  { id: 'meditation', label: 'Meditace', emoji: '🧘‍♀️' },
  { id: 'breathing', label: 'Dechové cvičení', emoji: '🌬️' },
  { id: 'quality_sleep', label: 'Kvalitní spánek', emoji: '😴' },
  { id: 'digital_detox_evening', label: 'Digitální detox večer', emoji: '📵' },
  { id: 'healthy_diet', label: 'Zdravá strava', emoji: '🥗' },
  { id: 'hydration', label: 'Pitný režim', emoji: '💧' },
  { id: 'cold_shower', label: 'Studená sprcha', emoji: '🚿' },
  { id: 'reading', label: 'Čtení / osobní rozvoj', emoji: '📚' },
  { id: 'gratitude', label: 'Vděčnost', emoji: '🙏' },
];

export const NEGATIVE_HABITS = [
  { id: 'smoking', label: 'Kouření', emoji: '🚬' },
  { id: 'alcohol', label: 'Alkohol', emoji: '🍷' },
  { id: 'junk_food', label: 'Junk food / průmyslový cukr', emoji: '🍔' },
  { id: 'social_media_scroll', label: 'Nadměrné scrollování sociálních sítí', emoji: '📱' },
  { id: 'poor_sleep', label: 'Nedostatek spánku', emoji: '😫' },
];

export const ALL_HABIT_IDS = [
  ...POSITIVE_HABITS.map((h) => h.id),
  ...NEGATIVE_HABITS.map((h) => h.id),
];

export function getHabitById(id) {
  return (
    POSITIVE_HABITS.find((h) => h.id === id) ||
    NEGATIVE_HABITS.find((h) => h.id === id) ||
    null
  );
}

export function isValidHabitId(id) {
  return ALL_HABIT_IDS.includes(id);
}

/**
 * Předvybrání návyků na základě body_metrics z registrace.
 * @param {Object} metrics - první/registrační záznam z body_metrics
 * @returns {string[]} - pole habit_id k předvybrání
 */
export function getSuggestedHabits(metrics) {
  if (!metrics) return [];
  const suggested = new Set();
  const goal = (metrics.goal || '').toLowerCase();
  const stress = (metrics.stress_level || '').toLowerCase();
  const activity = (metrics.activity || '').toLowerCase();
  const restrictions = (metrics.dietary_restrictions || '').toLowerCase();
  const notes = (metrics.notes || '').toLowerCase();
  const combined = `${restrictions} ${notes}`;

  if (goal === 'redukce') {
    suggested.add('healthy_diet');
    suggested.add('junk_food');
    suggested.add('quality_sleep');
  }
  if (goal === 'nabirani_svaly') {
    suggested.add('training');
    suggested.add('healthy_diet');
    suggested.add('quality_sleep');
  }
  if (stress === 'high') {
    suggested.add('meditation');
    suggested.add('breathing');
    suggested.add('quality_sleep');
  }
  if (activity === 'sedavy' || activity === 'lehce') {
    suggested.add('daily_movement');
    suggested.add('training');
  }
  if (combined.includes('kouř') || combined.includes('cigaret') || combined.includes('smoking')) {
    suggested.add('smoking');
  }
  if (combined.includes('alkohol') || combined.includes('alcohol') || combined.includes('pivo') || combined.includes('víno')) {
    suggested.add('alcohol');
  }
  if (combined.includes('cukr') || combined.includes('sugar') || combined.includes('sladk')) {
    suggested.add('junk_food');
  }

  return [...suggested];
}
