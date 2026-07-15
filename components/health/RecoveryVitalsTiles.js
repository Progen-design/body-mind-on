import { BM_ON_DESIGN } from '../../lib/designTokens';
import { groupLatestMetrics } from '../../lib/health/formatters';
import {
  getPersonalHrvCaption,
  getPersonalRhrCaption,
} from '../../lib/health/insights';
import MetricTile from './MetricTile';

const HRV_HINT =
  'Variabilita tepové frekvence — rozptyl mezi údery srdce. Sleduje se trend oproti tvému průměru.';

const RHR_HINT =
  'Tep v klidu — když vyskočí nad průměr, tělo často zvládá únavu, stres nebo nemoc.';

export default function RecoveryVitalsTiles({ latestRecovery = null, metricRows = [] }) {
  const { byCategory } = groupLatestMetrics(metricRows);
  const allMetrics = Object.values(byCategory).flat();
  const hrvMetric = allMetrics.find((m) => m.metric_name === 'heart_rate_variability');
  const rhrMetric = allMetrics.find((m) => m.metric_name === 'resting_heart_rate');

  const hrvValue = hrvMetric?.value ?? latestRecovery?.hrv_ms ?? null;
  const rhrValue = rhrMetric?.value ?? latestRecovery?.resting_hr ?? null;
  const hrvDate = hrvMetric?.local_date ?? latestRecovery?.local_date ?? null;
  const rhrDate = rhrMetric?.local_date ?? latestRecovery?.local_date ?? null;
  const hrvMeasuredAt = hrvMetric?.last_measured_at ?? null;
  const rhrMeasuredAt = rhrMetric?.last_measured_at ?? null;

  const hrvCaption = getPersonalHrvCaption(latestRecovery) || HRV_HINT;
  const rhrCaption = getPersonalRhrCaption(latestRecovery) || RHR_HINT;

  if (hrvValue == null && rhrValue == null) return null;

  return (
    <div className="health-recovery-vitals">
      {hrvValue != null && (
        <MetricTile
          label="HRV"
          value={hrvValue}
          unit="ms"
          localDate={hrvDate}
          lastMeasuredAt={hrvMeasuredAt}
          hint={HRV_HINT}
          caption={hrvCaption}
          emphasized
        />
      )}
      {rhrValue != null && (
        <MetricTile
          label="Klidový tep"
          value={rhrValue}
          unit="count/min"
          localDate={rhrDate}
          lastMeasuredAt={rhrMeasuredAt}
          hint={RHR_HINT}
          caption={rhrCaption}
          emphasized
        />
      )}

      <style jsx>{`
        .health-recovery-vitals {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
          margin: 0 0 24px;
        }
      `}</style>
    </div>
  );
}
