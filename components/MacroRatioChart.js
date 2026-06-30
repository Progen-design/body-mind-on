import { computeMacroRatio } from '../lib/macroRatioDisplay.js';
import { getMacroCalorieDelta } from '../lib/macroKcalConsistency.js';

/**
 * Kompaktní stacked bar — poměr B/S/T z kalorií (4/4/9).
 */
export default function MacroRatioChart({
  protein_g,
  carbs_g,
  fat_g,
  calories,
  compact = false,
  className = '',
}) {
  const ratio = computeMacroRatio({ protein_g, carbs_g, fat_g, calories });
  if (!ratio) return null;

  const { proteinPct, carbsPct, fatPct, computedKcal, statedKcal } = ratio;
  const delta = getMacroCalorieDelta(statedKcal ?? computedKcal, protein_g, carbs_g, fat_g);
  const kcalNote = statedKcal != null && Math.abs(statedKcal - computedKcal) > 15
    ? ` (${computedKcal} kcal z maker)`
    : '';
  const statusClass = delta.status === 'OK' ? 'macro-ratio-status--ok'
    : delta.status === 'WARNING' ? 'macro-ratio-status--warn'
      : delta.status === 'ERROR' ? 'macro-ratio-status--error' : '';

  return (
    <div
      className={`macro-ratio-chart ${compact ? 'macro-ratio-chart--compact' : ''} ${className}`.trim()}
      aria-label={`Poměr maker: bílkoviny ${proteinPct} procent, sacharidy ${carbsPct} procent, tuky ${fatPct} procent`}
    >
      <div className="macro-ratio-bar" role="img" aria-hidden>
        {proteinPct > 0 ? (
          <span className="macro-ratio-seg macro-ratio-seg--protein" style={{ width: `${proteinPct}%` }} />
        ) : null}
        {carbsPct > 0 ? (
          <span className="macro-ratio-seg macro-ratio-seg--carbs" style={{ width: `${carbsPct}%` }} />
        ) : null}
        {fatPct > 0 ? (
          <span className="macro-ratio-seg macro-ratio-seg--fat" style={{ width: `${fatPct}%` }} />
        ) : null}
      </div>
      <p className="macro-ratio-legend">
        <span className="macro-ratio-legend-item macro-ratio-legend-item--protein">B {proteinPct}%</span>
        <span className="macro-ratio-legend-item macro-ratio-legend-item--carbs">S {carbsPct}%</span>
        <span className="macro-ratio-legend-item macro-ratio-legend-item--fat">T {fatPct}%</span>
        {!compact && statedKcal != null ? (
          <span className="macro-ratio-kcal-note">· cca {statedKcal} kcal{kcalNote}</span>
        ) : null}
        {delta.status !== 'UNKNOWN' ? (
          <span className={`macro-ratio-status ${statusClass}`}>
            · makra {delta.status === 'OK' ? 'sedí' : delta.status === 'WARNING' ? 'cca sedí' : 'nesedí'}
          </span>
        ) : null}
      </p>
      <style jsx>{`
        .macro-ratio-chart {
          margin-top: 8px;
        }
        .macro-ratio-bar {
          display: flex;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
        }
        .macro-ratio-chart--compact .macro-ratio-bar {
          height: 6px;
        }
        .macro-ratio-seg {
          display: block;
          height: 100%;
          min-width: 2px;
        }
        .macro-ratio-seg--protein { background: #f472b6; }
        .macro-ratio-seg--carbs { background: #60a5fa; }
        .macro-ratio-seg--fat { background: #fbbf24; }
        .macro-ratio-legend {
          margin: 6px 0 0;
          font-size: 12px;
          color: #94a3b8;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .macro-ratio-chart--compact .macro-ratio-legend {
          font-size: 11px;
          margin-top: 4px;
          gap: 6px;
        }
        .macro-ratio-legend-item--protein { color: #f9a8d4; }
        .macro-ratio-legend-item--carbs { color: #93c5fd; }
        .macro-ratio-legend-item--fat { color: #fcd34d; }
        .macro-ratio-kcal-note {
          color: #64748b;
        }
        .macro-ratio-status--ok { color: #86efac; }
        .macro-ratio-status--warn { color: #fcd34d; }
        .macro-ratio-status--error { color: #fca5a5; }
      `}</style>
    </div>
  );
}
