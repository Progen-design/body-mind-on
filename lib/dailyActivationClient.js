/**
 * Client helpers for meal/workout daily activation (adherence loop).
 */

export function mealActivityKey(meal, index) {
  const type = String(meal?.type || meal?.meal_type || `meal_${index}`).toLowerCase().trim();
  return (type || `meal_${index}`).slice(0, 80);
}

/**
 * @param {{ activity_type?: string, activity_key?: string }[]} completions
 * @returns {Set<string>}
 */
export function completionsToSet(completions) {
  const s = new Set();
  for (const c of completions || []) {
    if (!c?.activity_type || !c?.activity_key) continue;
    s.add(`${c.activity_type}:${c.activity_key}`);
  }
  return s;
}

/**
 * Optimistic toggle of one completion row.
 * @param {Array} base
 * @param {string} activityType
 * @param {string} activityKey
 * @param {boolean} wasCompleted
 */
export function applyOptimisticToggle(base, activityType, activityKey, wasCompleted) {
  const list = Array.isArray(base) ? base : [];
  const key = `${activityType}:${activityKey}`;
  if (wasCompleted) {
    return list.filter((c) => `${c.activity_type}:${c.activity_key}` !== key);
  }
  return [
    ...list,
    {
      activity_type: activityType,
      activity_key: activityKey,
      completed_at: new Date().toISOString(),
    },
  ];
}
