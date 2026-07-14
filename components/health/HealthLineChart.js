import { BM_ON_DESIGN } from '../../lib/designTokens';

function formatShortDate(value) {
  if (!value) return '';
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${Number(d)}.${Number(m)}.`;
}

function buildScale(values, baselineValues = []) {
  const nums = [...values, ...baselineValues]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const rangeRaw = max - min || 1;
  const margin = Math.max(rangeRaw * 0.1, rangeRaw === 0 ? 1 : rangeRaw * 0.05);
  return { min: min - margin, max: max + margin, range: rangeRaw + 2 * margin };
}

export default function HealthLineChart({
  title,
  unit = '',
  points = [],
  baselinePoints = [],
  color = BM_ON_DESIGN.colors.purpleSoft,
  baselineColor = BM_ON_DESIGN.colors.textDim,
  height = 180,
}) {
  const validPoints = (points || []).filter((p) => Number.isFinite(Number(p.value)));
  const validBaseline = (baselinePoints || []).filter((p) => Number.isFinite(Number(p.value)));

  if (validPoints.length === 0) {
    return (
      <div className="health-chart health-chart--empty">
        <h4 className="health-chart-title">{title}</h4>
        <p className="health-chart-empty">Zatím nemáme dostatek dat.</p>
      </div>
    );
  }

  const scale = buildScale(
    validPoints.map((p) => p.value),
    validBaseline.map((p) => p.value),
  );

  const pad = { t: 20, r: 16, b: 32, l: 40 };
  const W = 560 - pad.l - pad.r;
  const H = height - pad.t - pad.b;

  const toXY = (list) =>
    list.map((p, i) => {
      const x = pad.l + (list.length > 1 ? (i / (list.length - 1)) * W : W / 2);
      const y = pad.t + H - ((Number(p.value) - scale.min) / scale.range) * H;
      return { x, y, ...p };
    });

  const primaryPts = toXY(validPoints);
  const baselinePts = validBaseline.length ? toXY(validBaseline) : [];
  const pathD = primaryPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const baselineD = baselinePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="health-chart">
      <h4 className="health-chart-title">{title}</h4>
      <div className="health-chart-svg-wrap">
        <svg className="health-chart-svg" viewBox={`0 0 560 ${height}`} preserveAspectRatio="none" role="img" aria-label={title}>
          <line x1={pad.l} y1={pad.t + H} x2={pad.l + W} y2={pad.t + H} stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
          {baselineD && (
            <path
              d={baselineD}
              fill="none"
              stroke={baselineColor}
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          )}
          <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {primaryPts.map((p) => (
            <circle key={p.date} cx={p.x} cy={p.y} r="3.5" fill={color}>
              <title>{`${formatShortDate(p.date)}: ${p.value}${unit ? ` ${unit}` : ''}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      {validBaseline.length > 0 && (
        <p className="health-chart-legend">
          <span className="health-chart-legend-line health-chart-legend-line--primary" style={{ background: color }} />
          aktuální
          <span className="health-chart-legend-line health-chart-legend-line--baseline" />
          baseline (7 dní)
        </p>
      )}
    </div>
  );
}

export function sortRowsByDateAsc(rows, dateKey = 'local_date') {
  return [...(rows || [])].sort((a, b) => String(a?.[dateKey] || '').localeCompare(String(b?.[dateKey] || '')));
}

export function toChartPoints(rows, valueKey, dateKey = 'local_date') {
  return sortRowsByDateAsc(rows, dateKey)
    .map((row) => ({
      date: row[dateKey],
      value: Number(row[valueKey]),
    }))
    .filter((p) => Number.isFinite(p.value));
}
