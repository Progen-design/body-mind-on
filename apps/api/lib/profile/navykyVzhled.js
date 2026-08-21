/**
 * Barvy buněk v mřížce návyků.
 *
 * Vlastní modul, protože `HabitUiPrimitives.jsx` je JSX a `node --test` ho bez
 * transpilace nenačte. Tahle funkce je přitom čistá a je v ní to podstatné:
 * co která barva znamená.
 *
 * Zelená = splněno, červená = splněný ZLOZVYK (špatná zpráva, ne úspěch),
 * azurová = dnešek. Významy se při přebarvení do návrhu v2 nesměly prohodit.
 */

export function getHabitGridCellStyle({
  completed,
  isToday,
  isFuture,
  isPast,
  busy,
  isNegative,
  cellWidth = 56,
}) {
  const readOnly = isFuture || isPast;
  const base = {
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    width: `${cellWidth}px`,
    height: '56px',
    padding: 0,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '11px',
    cursor: readOnly ? 'default' : 'pointer',
    border: 'none',
    outline: 'none',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s, opacity 0.18s',
    touchAction: 'manipulation',
    opacity: isFuture ? 0.18 : busy ? 0.55 : isPast ? 0.88 : 1,
    pointerEvents: readOnly ? 'none' : 'auto',
  };
  if (completed) {
    if (isNegative) {
      return {
        ...base,
        background: 'linear-gradient(145deg, #dc2626 0%, #b91c1c 100%)',
        boxShadow: '0 4px 18px rgba(239, 68, 68, 0.5), 0 0 0 1px rgba(248, 113, 113, 0.3) inset',
        color: '#fff',
      };
    }
    // Splněný den v mřížce zpětných dnů — táž zelená se září jako všude
    // jinde v profilu. Zlozvyk zůstává červený, tam je splnění špatná zpráva.
    return {
      ...base,
      background: '#1b3d26',
      boxShadow: '0 0 12px rgba(57, 255, 20, 0.35), 0 0 0 1px rgba(57, 255, 20, 0.55) inset',
      color: '#39ff14',
    };
  }
  if (isToday) {
    return {
      ...base,
      background: 'rgba(0, 242, 254, 0.12)',
      boxShadow: '0 0 0 1.5px rgba(0, 242, 254, 0.45) inset',
      color: '#a78bfa',
    };
  }
  return {
    ...base,
    background: 'rgba(255, 255, 255, 0.055)',
    boxShadow: '0 0 0 1.5px rgba(255, 255, 255, 0.09) inset',
    color: '#475569',
  };
}
