import { BM_ON_DESIGN } from '../../lib/designTokens';
import HealthConnectionBanner from './HealthConnectionBanner';
import HealthLineChart, { toChartPoints } from './HealthLineChart';
import RecoveryCard from './RecoveryCard';
import WorkoutsTable from './WorkoutsTable';

export default function AppleWatchSection({ connection, watchRows = [], recoveryRows = [], workoutRows = [] }) {
  const latestRecovery = recoveryRows?.[0] || null;

  const hrvPoints = toChartPoints(recoveryRows, 'hrv_ms');
  const hrvBaseline = toChartPoints(recoveryRows, 'hrv_baseline7');
  const rhrPoints = toChartPoints(recoveryRows, 'resting_hr');
  const rhrBaseline = toChartPoints(recoveryRows, 'rhr_baseline7');
  const stepsPoints = toChartPoints(watchRows, 'steps');
  const energyPoints = toChartPoints(watchRows, 'active_kcal');

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

      <div className="health-charts-grid">
        <HealthLineChart
          title="HRV vs. baseline (30 dní)"
          unit="ms"
          points={hrvPoints}
          baselinePoints={hrvBaseline}
          color={BM_ON_DESIGN.colors.cyan}
        />
        <HealthLineChart
          title="Klidový tep vs. baseline (30 dní)"
          unit="bpm"
          points={rhrPoints}
          baselinePoints={rhrBaseline}
          color={BM_ON_DESIGN.colors.red}
        />
        <HealthLineChart
          title="Kroky (30 dní)"
          unit=""
          points={stepsPoints}
          color={BM_ON_DESIGN.colors.green}
        />
        <HealthLineChart
          title="Aktivní energie (30 dní)"
          unit="kcal"
          points={energyPoints}
          color={BM_ON_DESIGN.colors.yellow}
        />
      </div>

      <WorkoutsTable rows={workoutRows} />
    </section>
  );
}
