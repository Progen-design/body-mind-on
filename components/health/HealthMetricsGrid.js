import {
  FiActivity,
  FiCloud,
  FiHeart,
  FiInfo,
  FiSun,
  FiTrendingUp,
  FiUser,
} from 'react-icons/fi';
import { BM_ON_DESIGN } from '../../lib/designTokens';
import {
  formatMetricUnitLabel,
  formatMetricValue,
  groupLatestMetrics,
  METRIC_CATEGORY_LABELS,
  METRIC_CATEGORY_ORDER,
} from '../../lib/health/formatters';

const CATEGORY_ICONS = {
  aktivita: FiActivity,
  srdce: FiHeart,
  pohyb: FiTrendingUp,
  dychani: FiCloud,
  telo: FiUser,
  prostredi: FiSun,
};

const METRIC_HINTS = {
  heart_rate_variability:
    'Variabilita tepové frekvence — rozptyl mezi údery srdce. Vyšší bývá spojené s lepší regenerací. Sleduje se trend, ne jedno číslo.',
  resting_heart_rate:
    'Tep v klidu. Když vyskočí nad tvůj průměr, tělo často zvládá únavu, stres nebo nemoc.',
};

function MetricTile({ metric, emphasized = false }) {
  const valueText = formatMetricValue(metric.value, metric.unit);
  const unitText = formatMetricUnitLabel(metric.unit);
  const hint = METRIC_HINTS[metric.metric_name] || null;

  return (
    <div className={`health-metric-tile${emphasized ? ' health-metric-tile--key' : ''}`}>
      <span className="health-metric-tile-label-row">
        <span className="health-metric-tile-label">{metric.label_cs}</span>
        {hint ? (
          <span className="health-metric-tile-info" tabIndex={0} aria-label={hint}>
            <FiInfo aria-hidden className="health-metric-tile-info-icon" />
            <span className="health-metric-tile-tooltip" role="tooltip">
              {hint}
            </span>
          </span>
        ) : null}
      </span>
      <span className="health-metric-tile-value">
        {valueText}
        {unitText ? <span className="health-metric-tile-unit">{unitText}</span> : null}
      </span>
      <span className="health-metric-tile-date">
        {metric.local_date ? String(metric.local_date).slice(0, 10) : '—'}
      </span>
    </div>
  );
}

export default function HealthMetricsGrid({ metricRows = [] }) {
  const { keyMetrics, byCategory } = groupLatestMetrics(metricRows);
  const nonKeyCategories = METRIC_CATEGORY_ORDER.filter((cat) => {
    const items = (byCategory[cat] || []).filter((m) => !m.is_key);
    return items.length > 0;
  });

  if (!keyMetrics.length && !nonKeyCategories.length) {
    return (
      <div className="health-metrics-empty">
        <p className="health-empty-text">Zatím nemáme žádné metriky z Apple Health.</p>
      </div>
    );
  }

  return (
    <div className="health-metrics">
      {keyMetrics.length > 0 && (
        <div className="health-metrics-block">
          <h3 className="health-subsection-title">Klíčové metriky</h3>
          <div className="health-metrics-grid health-metrics-grid--key">
            {keyMetrics.map((metric) => (
              <MetricTile key={metric.metric_name} metric={metric} emphasized />
            ))}
          </div>
        </div>
      )}

      {nonKeyCategories.map((category) => {
        const Icon = CATEGORY_ICONS[category] || FiActivity;
        const items = (byCategory[category] || []).filter((m) => !m.is_key);
        return (
          <div key={category} className="health-metrics-block">
            <h3 className="health-metrics-category-title">
              <Icon aria-hidden className="health-metrics-category-icon" />
              {METRIC_CATEGORY_LABELS[category] || category}
            </h3>
            <div className="health-metrics-grid">
              {items.map((metric) => (
                <MetricTile key={metric.metric_name} metric={metric} />
              ))}
            </div>
          </div>
        );
      })}

      <style jsx>{`
        .health-metrics {
          margin-bottom: 20px;
        }
        .health-metrics-block + .health-metrics-block {
          margin-top: 18px;
        }
        .health-metrics-category-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 12px;
          font-size: 1rem;
          color: ${BM_ON_DESIGN.colors.text};
        }
        :global(.health-metrics-category-icon) {
          color: ${BM_ON_DESIGN.colors.sky};
          font-size: 1.05rem;
        }
        .health-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }
        .health-metrics-grid--key {
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        }
        .health-metric-tile {
          padding: 14px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.18);
          border: 1px solid ${BM_ON_DESIGN.colors.border};
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 96px;
        }
        .health-metric-tile--key {
          border-color: rgba(14, 165, 233, 0.35);
          background: rgba(14, 165, 233, 0.08);
        }
        .health-metric-tile-label-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 6px;
        }
        .health-metric-tile-label {
          font-size: 0.82rem;
          color: ${BM_ON_DESIGN.colors.textMuted};
          line-height: 1.3;
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
        .health-metric-tile-info:hover .health-metric-tile-tooltip,
        .health-metric-tile-info:focus .health-metric-tile-tooltip,
        .health-metric-tile-info:focus-within .health-metric-tile-tooltip {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        .health-metric-tile-tooltip {
          position: absolute;
          z-index: 5;
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
          opacity: 0;
          visibility: hidden;
          transform: translateY(-4px);
          transition: opacity 0.15s ease, transform 0.15s ease;
          pointer-events: none;
        }
        .health-metric-tile-value {
          font-size: 1.35rem;
          font-weight: 700;
          color: ${BM_ON_DESIGN.colors.text};
          line-height: 1.2;
        }
        .health-metric-tile--key .health-metric-tile-value {
          font-size: 1.5rem;
        }
        .health-metric-tile-unit {
          margin-left: 4px;
          font-size: 0.78rem;
          font-weight: 600;
          color: ${BM_ON_DESIGN.colors.textMuted};
        }
        .health-metric-tile-date {
          font-size: 0.75rem;
          color: ${BM_ON_DESIGN.colors.textDim};
        }
        .health-metrics-empty {
          margin-bottom: 20px;
        }
      `}</style>
    </div>
  );
}
