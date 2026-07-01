/**
 * Výběr „aktuálního“ a „příštího“ plánu ze seznamu z /api/profile — jedna logika pro UI i hook.
 * @param {Array<object>|null|undefined} plans
 * @returns {{ currentPlan: object|null, nextPlan: object|null }}
 */
export function getCurrentAndNextPlansFromList(plans) {
  if (!Array.isArray(plans) || plans.length === 0) {
    return { currentPlan: null, nextPlan: null };
  }
  const recencyScore = (plan) => {
    const published = Date.parse(plan?.published_at || '');
    if (Number.isFinite(published)) return published;
    const created = Date.parse(plan?.created_at || '');
    if (Number.isFinite(created)) return created;
    return 0;
  };
  const byNewest = (a, b) => recencyScore(b) - recencyScore(a);

  const today = new Date();
  const containingToday = plans.filter((p) => {
    const from = p.valid_from ? new Date(p.valid_from) : null;
    const until = p.valid_until ? new Date(p.valid_until) : null;
    if (!from || !until) return false;
    return from <= today && until >= today;
  });
  let currentPlan = null;
  if (containingToday.length > 0) {
    containingToday.sort((a, b) => {
      const byValidFrom = (b.valid_from || '').localeCompare(a.valid_from || '');
      if (byValidFrom !== 0) return byValidFrom;
      return byNewest(a, b);
    });
    currentPlan = containingToday[0];
  } else {
    const stillValid = plans
      .filter((p) => p.valid_until && new Date(p.valid_until) >= today)
      .sort(byNewest)[0];
    currentPlan = stillValid || plans[0];
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const future = plans.filter((p) => {
    const fromStr = (p.valid_from || '').split('T')[0];
    return fromStr && fromStr > todayStr;
  });
  let nextPlan = null;
  if (future.length > 0) {
    future.sort((a, b) => {
      const byValidFrom = (a.valid_from || '').localeCompare(b.valid_from || '');
      if (byValidFrom !== 0) return byValidFrom;
      return byNewest(a, b);
    });
    nextPlan = future[0];
  }

  return { currentPlan, nextPlan };
}
