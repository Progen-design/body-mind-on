import { useState } from 'react';
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
  groupLatestMetrics,
  METRIC_CATEGORY_LABELS,
  METRIC_CATEGORY_ORDER,
} from '../../lib/health/formatters';
import { getMetricInsight } from '../../lib/health/insights';
import MetricTile from './MetricTile';

const CATEGORY_ICONS = {
  aktivita: FiActivity,
  srdce: FiHeart,
  pohyb: FiTrendingUp,
  dychani: FiCloud,
  telo: FiUser,
  prostredi: FiSun,
};

export const PRIMARY_METRIC_NAMES = [
  'step_count',
  'active_energy',
  'apple_exercise_time',
  'walking_running_distance',
  'vo2_max',
  'blood_oxygen_saturation',
];

const EXPAND_CATEGORIES = ['aktivita', 'srdce', 'pohyb', 'dychani', 'telo', 'prostredi'];

function MetricTileFromSummary({ metric, emphasized = false }) {
  const caption = getMetricInsight(metric.metric_name, metric.value);
  return (
    <MetricTile
      label={metric.label_cs}
      value={metric.value}
      unit={metric.unit}
      localDate={metric.local_date}
      lastMeasuredAt={metric.last_measured_at}
      caption={caption}
      emphasized={emphasized}
    />
  );
}

export default function HealthMetricsGrid({ metricRows = [] }) {
  const [expanded, setExpanded] = useState(false);
  const { byCategory } = groupLatestMetrics(metricRows);
  const allMetrics = Object.values(byCategory).flat();
  const byName = new Map(allMetrics.map((m) => [m.metric_name, m]));

  const primaryMetrics = PRIMARY_METRIC_NAMES.map((name) => byName.get(name)).filter(Boolean);
  const primarySet = new Set(PRIMARY_METRIC_NAMES);
  const recoveryVitalNames = new Set(['heart_rate_variability', 'resting_heart_rate']);

  const otherByCategory = {};
  for (const cat of EXPAND_CATEGORIES) {
    const items = (byCategory[cat] || []).filter(
      (m) => !primarySet.has(m.metric_name) && !recoveryVitalNames.has(m.metric_name),
    );
    if (items.length > 0) otherByCategory[cat] = items;
  }

  const otherCount = Object.values(otherByCategory).reduce((sum, items) => sum + items.length, 0);
  const hasAnything = primaryMetrics.length > 0 || otherCount > 0;

  if (!hasAnything) {
    return (
      <div className="health-metrics-empty">
        <p className="health-empty-text">Zatím nemáme žádné metriky z Apple Health.</p>
      </div>
    );
  }

  return (
    <div className="health-metrics">
      {primaryMetrics.length > 0 && (
        <div className="health-metrics-block">
          <h3 className="health-subsection-title">Dnešní přehled</h3>
          <div className="health-metrics-grid">
            {primaryMetrics.map((metric) => (
              <MetricTileFromSummary key={metric.metric_name} metric={metric} emphasized />
            ))}
          </div>
        </div>
      )}

      {otherCount > 0 && (
        <div className="health-metrics-expand">
          <button
            type="button"
            className="health-metrics-expand-btn"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
          >
            {expanded ? 'Skrýt všechny metriky' : 'Zobrazit všechny metriky'}
          </button>

          {expanded && (
            <div className="health-metrics-all">
              {EXPAND_CATEGORIES.filter((cat) => otherByCategory[cat]?.length).map((category) => {
                const Icon = CATEGORY_ICONS[category] || FiActivity;
                const items = otherByCategory[category];
                return (
                  <div key={category} className="health-metrics-block">
                    <h3 className="health-metrics-category-title">
                      <Icon aria-hidden className="health-metrics-category-icon" />
                      {METRIC_CATEGORY_LABELS[category] || category}
                    </h3>
                    <div className="health-metrics-grid">
                      {items.map((metric) => (
                        <MetricTileFromSummary key={metric.metric_name} metric={metric} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .health-metrics {
          margin-bottom: 24px;
        }
        .health-metrics-block + .health-metrics-block {
          margin-top: 20px;
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
          grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
          gap: 14px;
        }
        .health-metrics-expand {
          margin-top: 18px;
        }
        .health-metrics-expand-btn {
          padding: 8px 14px;
          border-radius: 10px;
          border: 1px solid ${BM_ON_DESIGN.colors.border};
          background: rgba(0, 0, 0, 0.12);
          color: ${BM_ON_DESIGN.colors.textMuted};
          font-size: 0.85rem;
          cursor: pointer;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .health-metrics-expand-btn:hover {
          color: ${BM_ON_DESIGN.colors.text};
          border-color: rgba(14, 165, 233, 0.35);
        }
        .health-metrics-all {
          margin-top: 18px;
        }
        .health-metrics-empty {
          margin-bottom: 20px;
        }
      `}</style>
    </div>
  );
}
