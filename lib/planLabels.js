// Mapování plan_type (uložené hodnoty) na české popisky s diakritikou pro zobrazení v UI
export const PLAN_TYPE_LABELS = {
  redukce: 'Redukce',
  nabirani: 'Nabírání',
  udrzovani: 'Udržování',
  START: 'START',
};

export function getPlanTypeLabel(planType) {
  if (!planType) return 'START';
  const key = String(planType).toLowerCase().trim();
  return PLAN_TYPE_LABELS[key] ?? planType;
}
