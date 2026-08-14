/**
 * Client helpers for meal/workout daily activation (adherence loop).
 */

/**
 * KLÍČ MUSÍ ODLIŠIT KONKRÉTNÍ JÍDLO, NE JEN JEHO TYP.
 *
 * Do 15. 8. 2026 se `index` používal jen jako záloha, když typ chyběl — klíč
 * byl tedy holé `snack`. Den má ale svačiny dvě (změřeno na plánu
 * 76bdeee1: breakfast, lunch, snack, snack, dinner), takže obě sdílely týž
 * klíč: odškrtnutí jedné zaškrtlo obě a průběh dne se počítal dvakrát.
 *
 * Pozice v dni je součástí identity jídla, proto je `index` v klíči vždy.
 * `daily_activity_completions` byla v době opravy prázdná, takže se nic
 * nemigruje; kdyby se formát měnil znovu, starší řádky se přestanou párovat.
 *
 * @param {{type?: string, meal_type?: string}|null|undefined} meal
 * @param {number} index pořadí jídla v dni
 * @returns {string}
 */
export function mealActivityKey(meal, index) {
  const type = String(meal?.type || meal?.meal_type || 'meal').toLowerCase().trim() || 'meal';
  const poradi = Number.isFinite(Number(index)) ? Number(index) : 0;
  return `${type}#${poradi}`.slice(0, 80);
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
