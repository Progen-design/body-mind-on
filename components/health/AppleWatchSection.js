import { BM_ON_DESIGN } from '../../lib/designTokens';
import {
  getActiveEnergyChartStatus,
  getHrvChartStatus,
  getRhrChartStatus,
  getStepsChartStatus,
} from '../../lib/health/formatters';
import HealthConnectionBanner from './HealthConnectionBanner';
import HealthLineChart, { toChartPoints } from './HealthLineChart';
import HealthMetricsGrid from './HealthMetricsGrid';
import RecoveryCard from './RecoveryCard';
import RecoveryVitalsTiles from './RecoveryVitalsTiles';
import WorkoutsTable from './WorkoutsTable';

function latestValue(points) {
  if (!points?.length) return null;
  const last = points[points.length - 1];
  return Number.isFinite(Number(last?.value)) ? Number(last.value) : null;
}

export default function AppleWatchSection({
  connection,
  watchRows = [],
  recoveryRows = [],
  workoutRows = [],
  metricRows = [],
}) {
  const latestRecovery = recoveryRows?.[0] || null;

  const hrvPoints = toChartPoints(recoveryRows, 'hrv_ms');
  const hrvBaseline = toChartPoints(recoveryRows, 'hrv_baseline7');
  const rhrPoints = toChartPoints(recoveryRows, 'resting_hr');
  const rhrBaseline = toChartPoints(recoveryRows, 'rhr_baseline7');
  const stepsPoints = toChartPoints(watchRows, 'steps');
  const energyPoints = toChartPoints(watchRows, 'active_kcal');

  const hrvStatus = getHrvChartStatus(latestValue(hrvPoints), latestValue(hrvBaseline));
  const rhrStatus = getRhrChartStatus(latestValue(rhrPoints), latestValue(rhrBaseline));
  const stepsStatus = getStepsChartStatus(latestValue(stepsPoints));
  const energyStatus = getActiveEnergyChartStatus(latestValue(energyPoints));

  return (
    <section className="health-section health-section--watch" aria-labelledby="health-watch-heading">
      <header className="health-section-header">
        <span className="health-section-emoji" aria-hidden>⌚</span>
        <div>
          <h2 id="health-watch-heading" className="health-section-title">Apple Watch</h2>
          <p className="health-section-subtitle">Aktivita, srdce, spánek a tréninky ze zápěstí</p>
        </div>
      </header>

      <HealthConnectionBanner
        banner={connection?.banner}
        active={connection?.active}
        meta={connection?.meta}
      />

      <RecoveryCard latest={latestRecovery} />

      <RecoveryVitalsTiles latestRecovery={latestRecovery} metricRows={metricRows} />

      <div className="health-charts-grid">
        <HealthLineChart
          title="HRV — vývoj (30 dní)"
          statusLine={hrvStatus}
          unit="ms"
          points={hrvPoints}
          baselinePoints={hrvBaseline}
          color={BM_ON_DESIGN.colors.cyan}
        />
        <HealthLineChart
          title="Klidový tep — vývoj (30 dní)"
          statusLine={rhrStatus}
          unit="count/min"
          points={rhrPoints}
          baselinePoints={rhrBaseline}
          color={BM_ON_DESIGN.colors.red}
        />
        <HealthLineChart
          title="Kroky (30 dní)"
          statusLine={stepsStatus}
          unit=""
          points={stepsPoints}
          color={BM_ON_DESIGN.colors.green}
        />
        <HealthLineChart
          title="Aktivní energie (30 dní)"
          statusLine={energyStatus}
          unit="kcal"
          points={energyPoints}
          color={BM_ON_DESIGN.colors.yellow}
        />
      </div>

      <HealthMetricsGrid metricRows={metricRows} />

      <WorkoutsTable rows={workoutRows} />

      <style jsx>{`
        :global(.health-charts-grid) {
          margin-bottom: 24px;
        }
      `}</style>
    </section>
  );
}
