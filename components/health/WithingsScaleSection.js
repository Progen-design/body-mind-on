import { BM_ON_DESIGN } from '../../lib/designTokens';
import HealthLineChart, { toChartPoints } from './HealthLineChart';

function formatKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1).replace('.', ',')} kg`;
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1).replace('.', ',')} %`;
}

function formatShortDate(value) {
  if (!value) return '—';
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${Number(d)}.${Number(m)}.${y}`;
}

export default function WithingsScaleSection({ scaleRows = [] }) {
  const latest = scaleRows?.[0] || null;
  const weightPoints = toChartPoints(scaleRows, 'weight_kg');
  const fatPoints = toChartPoints(scaleRows, 'body_fat_pct');
  const musclePoints = toChartPoints(scaleRows, 'muscle_mass_kg');

  return (
    <section className="health-section health-section--withings" aria-labelledby="health-withings-heading">
      <header className="health-section-header">
        <span className="health-section-emoji health-section-emoji--withings" aria-hidden>🔵</span>
        <div>
          <h2 id="health-withings-heading" className="health-section-title">Váha Withings</h2>
          <p className="health-section-subtitle">Tělesné složení z chytré váhy — odděleně od Apple Watch</p>
        </div>
      </header>

      {latest ? (
        <div className="health-withings-latest">
          <div className="health-withings-stat">
            <span className="health-withings-stat-label">Poslední vážení</span>
            <span className="health-withings-stat-value">{formatKg(latest.weight_kg)}</span>
            <span className="health-withings-stat-meta">{formatShortDate(latest.local_date)}</span>
          </div>
          <div className="health-withings-stat">
            <span className="health-withings-stat-label">Tělesný tuk</span>
            <span className="health-withings-stat-value">{formatPct(latest.body_fat_pct)}</span>
          </div>
          <div className="health-withings-stat">
            <span className="health-withings-stat-label">Svalová hmota</span>
            <span className="health-withings-stat-value">{formatKg(latest.muscle_mass_kg)}</span>
          </div>
        </div>
      ) : (
        <p className="health-empty-text">Zatím nemáme data z Withings. Propoj váhu v profilu.</p>
      )}

      <div className="health-charts-grid health-charts-grid--withings">
        <HealthLineChart
          title="Váha (30 dní)"
          unit="kg"
          points={weightPoints}
          color={BM_ON_DESIGN.colors.sky}
        />
        <HealthLineChart
          title="Tělesný tuk (30 dní)"
          unit="%"
          points={fatPoints}
          color={BM_ON_DESIGN.colors.purpleSoft}
        />
        <HealthLineChart
          title="Svalová hmota (30 dní)"
          unit="kg"
          points={musclePoints}
          color={BM_ON_DESIGN.colors.green}
        />
      </div>
    </section>
  );
}
