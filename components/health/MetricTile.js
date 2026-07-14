import { FiInfo } from 'react-icons/fi';
import { BM_ON_DESIGN } from '../../lib/designTokens';
import { formatMetricMeasuredAt, formatMetricUnitLabel, formatMetricValue } from '../../lib/health/formatters';

export default function MetricTile({
  label,
  value,
  unit = '',
  localDate = null,
  lastMeasuredAt = null,
  hint = null,
  caption = null,
  emphasized = false,
}) {
  const valueText = formatMetricValue(value, unit);
  const unitText = formatMetricUnitLabel(unit);
  const dateText = formatMetricMeasuredAt(localDate, lastMeasuredAt);

  return (
    <div className={`health-metric-tile${emphasized ? ' health-metric-tile--key' : ''}`}>
      <div className="health-metric-tile-row health-metric-tile-row--label">
        <span className="health-metric-tile-label">{label}</span>
        {hint ? (
          <span className="health-metric-tile-info" tabIndex={0} aria-label={hint}>
            <FiInfo aria-hidden className="health-metric-tile-info-icon" />
            <span className="health-metric-tile-tooltip" role="tooltip">
              {hint}
            </span>
          </span>
        ) : null}
      </div>

      <div className="health-metric-tile-row health-metric-tile-row--value">
        <span className="health-metric-tile-value">{valueText}</span>
        {unitText ? <span className="health-metric-tile-unit">{unitText}</span> : null}
      </div>

      {dateText ? (
        <div className="health-metric-tile-row health-metric-tile-row--date">
          <span className="health-metric-tile-date">{dateText}</span>
        </div>
      ) : null}

      {caption ? <p className="health-metric-tile-caption">{caption}</p> : null}

      <style jsx>{`
        .health-metric-tile {
          padding: 16px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.18);
          border: 1px solid ${BM_ON_DESIGN.colors.border};
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 104px;
          overflow: visible;
        }
        .health-metric-tile--key {
          border-color: rgba(14, 165, 233, 0.35);
          background: rgba(14, 165, 233, 0.08);
        }
        .health-metric-tile-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          width: 100%;
        }
        .health-metric-tile-row--label {
          align-items: flex-start;
          justify-content: space-between;
        }
        .health-metric-tile-row--value {
          align-items: baseline;
          flex-wrap: wrap;
        }
        .health-metric-tile-row--date {
          margin-top: 2px;
        }
        .health-metric-tile-label {
          display: block;
          font-size: 0.82rem;
          color: ${BM_ON_DESIGN.colors.textMuted};
          line-height: 1.35;
        }
        .health-metric-tile-info {
          position: relative;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          color: ${BM_ON_DESIGN.colors.textDim};
          cursor: help;
        }
        :global(.health-metric-tile-info-icon) {
          font-size: 0.85rem;
        }
        .health-metric-tile-tooltip {
          display: none;
          position: absolute;
          z-index: 10;
          top: calc(100% + 6px);
          right: 0;
          width: min(240px, 70vw);
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid ${BM_ON_DESIGN.colors.border};
          font-size: 0.75rem;
          line-height: 1.4;
          font-weight: 400;
          color: ${BM_ON_DESIGN.colors.textMuted};
          pointer-events: none;
        }
        .health-metric-tile-info:hover .health-metric-tile-tooltip,
        .health-metric-tile-info:focus .health-metric-tile-tooltip,
        .health-metric-tile-info:focus-within .health-metric-tile-tooltip {
          display: block;
        }
        .health-metric-tile-value {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
          color: ${BM_ON_DESIGN.colors.text};
          line-height: 1.15;
        }
        .health-metric-tile--key .health-metric-tile-value {
          font-size: 1.65rem;
        }
        .health-metric-tile-unit {
          display: block;
          font-size: 0.9rem;
          font-weight: 600;
          color: ${BM_ON_DESIGN.colors.textMuted};
          line-height: 1.2;
        }
        .health-metric-tile-date {
          display: block;
          font-size: 0.75rem;
          color: ${BM_ON_DESIGN.colors.textDim};
          line-height: 1.2;
        }
        .health-metric-tile-caption {
          margin: 4px 0 0;
          font-size: 0.76rem;
          line-height: 1.4;
          color: ${BM_ON_DESIGN.colors.textDim};
        }
      `}</style>
    </div>
  );
}
