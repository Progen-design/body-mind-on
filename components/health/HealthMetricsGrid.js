import {
  FiActivity,
  FiCloud,
  FiHeart,
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

function MetricTile({ metric, emphasized = false }) {
  const valueText = formatMetricValue(metric.value, metric.unit);
  const unitText = formatMetricUnitLabel(metric.unit);

  return (
    <div className={`health-metric-tile${emphasized ? ' health-metric-tile--key' : ''}`}>
      <span className="health-metric-tile-label">{metric.label_cs}</span>
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
        .health-metric-tile-label {
          font-size: 0.82rem;
          color: ${BM_ON_DESIGN.colors.textMuted};
          line-height: 1.3;
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
