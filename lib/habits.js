// lib/habits.js – definice návyků pro habit tracker

export const POSITIVE_HABITS = [
  { id: 'training', label: 'Trénink', emoji: '🏋️', description: 'Cvičení, posilování, sport' },
  { id: 'daily_movement', label: 'Denní pohyb', emoji: '🚶', description: 'Procházka, chůze, aktivní pohyb' },
  { id: 'mobility_stretch', label: 'Mobilita / Strečink', emoji: '🧘', description: 'Protahování, mobilizační cvičení' },
  { id: 'meditation', label: 'Meditace', emoji: '🧘‍♀️', description: 'Meditace, mindfulness' },
  { id: 'breathing', label: 'Dechové cvičení', emoji: '🌬️', description: 'Vědomé dýchání, dechová cvičení' },
  { id: 'quality_sleep', label: 'Kvalitní spánek', emoji: '😴', description: '7+ hodin kvalitního spánku' },
  { id: 'digital_detox_evening', label: 'Digitální detox večer', emoji: '📵', description: 'Bez telefonu/tabletu před spaním' },
  { id: 'healthy_diet', label: 'Zdravá strava', emoji: '🥗', description: 'Kvalitní jídlo, vyvážená strava' },
  { id: 'hydration', label: 'Pitný režim', emoji: '💧', description: 'Dostatek vody' },
  { id: 'cold_shower', label: 'Studená sprcha', emoji: '🚿', description: 'Studená sprcha nebo ledová voda' },
  { id: 'reading', label: 'Čtení / osobní rozvoj', emoji: '📚', description: 'Čtení knih, učení se' },
  { id: 'gratitude', label: 'Vděčnost', emoji: '🙏', description: 'Zápis vděčnosti, reflexe' },
];

export const NEGATIVE_HABITS = [
  { id: 'smoking', label: 'Kouření', emoji: '🚬', description: 'Cigarety, e-cigarety' },
  { id: 'alcohol', label: 'Alkohol', emoji: '🍷', description: 'Alkoholické nápoje' },
  { id: 'junk_food', label: 'Junk food / průmyslový cukr', emoji: '🍔', description: 'Fast food, sladkosti, průmyslově zpracované potraviny' },
  { id: 'social_media_scroll', label: 'Nadměrné scrollování sociálních sítí', emoji: '📱', description: 'Bezúčelné scrollování v sociálních sítích' },
  { id: 'poor_sleep', label: 'Nedostatek spánku', emoji: '😫', description: 'Méně než 7 hodin nebo špatná kvalita spánku' },
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
