import { useMemo, useState } from 'react';
import { FiArrowDown, FiArrowUp, FiMinus } from 'react-icons/fi';
import { BM_ON_DESIGN } from '../../lib/designTokens';
import { formatMetricUnitLabel, formatMetricValue } from '../../lib/health/formatters';

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

function pickXAxisLabels(points, maxLabels = 4) {
  if (!points.length) return [];
  if (points.length <= maxLabels) return points.map((p, i) => ({ ...p, index: i }));
  const indices = [];
  for (let i = 0; i < maxLabels; i += 1) {
    const idx = Math.round((i / (maxLabels - 1)) * (points.length - 1));
    if (!indices.includes(idx)) indices.push(idx);
  }
  return indices.map((index) => ({ ...points[index], index }));
}

function formatAxisValue(value, unitLabel) {
  const text = formatMetricValue(value, unitLabel === 'kroky' ? 'count' : unitLabel);
  return unitLabel && unitLabel !== 'kroky' ? `${text} ${unitLabel}` : text;
}

function formatDelta(latest, baseline, unitLabel) {
  if (!Number.isFinite(Number(latest)) || !Number.isFinite(Number(baseline))) return null;
  const diff = Number(latest) - Number(baseline);
  const sign = diff > 0 ? '+' : '';
  const unitForFormat = unitLabel === 'kroky' ? 'count' : unitLabel;
  return `${sign}${formatMetricValue(diff, unitForFormat)}`;
}

export default function HealthLineChart({
  title,
  statusLine = '',
  subtitle = '',
  unit = '',
  points = [],
  baselinePoints = [],
  color = BM_ON_DESIGN.colors.purpleSoft,
  baselineColor = BM_ON_DESIGN.colors.textDim,
  height = 200,
}) {
  const [hovered, setHovered] = useState(null);
  const unitLabel = unit === '' ? 'kroky' : formatMetricUnitLabel(unit) || unit;

  const validPoints = (points || []).filter((p) => Number.isFinite(Number(p.value)));
  const validBaseline = (baselinePoints || []).filter((p) => Number.isFinite(Number(p.value)));

  const latestPoint = validPoints.length ? validPoints[validPoints.length - 1] : null;
  const latestBaseline = validBaseline.length ? validBaseline[validBaseline.length - 1] : null;
  const deltaText = latestPoint && latestBaseline
    ? formatDelta(latestPoint.value, latestBaseline.value, unitLabel)
    : null;
  const deltaPositive = deltaText && !deltaText.startsWith('-') && deltaText !== '+0' && deltaText !== '0';
  const deltaNegative = deltaText && deltaText.startsWith('-');

  const chartData = useMemo(() => {
    if (!validPoints.length) return null;
    const scale = buildScale(
      validPoints.map((p) => p.value),
      validBaseline.map((p) => p.value),
    );
    const pad = { t: 28, r: 16, b: 36, l: 52 };
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
    const xLabels = pickXAxisLabels(primaryPts, 4);
    const yMinY = pad.t + H;
    const yMaxY = pad.t;

    return {
      scale,
      pad,
      W,
      H,
      primaryPts,
      baselinePts,
      xLabels,
      yMinY,
      yMaxY,
      pathD: primaryPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
      baselineD: baselinePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
    };
  }, [validPoints, validBaseline, height]);

  const headline = statusLine || subtitle;

  if (!validPoints.length || !chartData) {
    return (
      <div className="health-chart health-chart--empty">
        <h4 className="health-chart-title">{title}</h4>
        {headline ? <p className="health-chart-status">{headline}</p> : null}
        <p className="health-chart-empty">Zatím nemáme dostatek dat.</p>
      </div>
    );
  }

  const activePoint = hovered || latestPoint;
  const activeValueText = formatMetricValue(activePoint?.value, unit === '' ? 'count' : unit);
  const displayUnit = unitLabel === 'kroky' ? '' : unitLabel;

  return (
    <div className="health-chart">
      <div className="health-chart-head">
        <div className="health-chart-title-block">
          <h4 className="health-chart-title">{title}</h4>
          {headline ? <p className="health-chart-status">{headline}</p> : null}
        </div>
        <div className="health-chart-latest">
          <span className="health-chart-latest-value">
            {activeValueText}
            {displayUnit ? <span className="health-chart-latest-unit">{displayUnit}</span> : null}
          </span>
          {deltaText && latestBaseline ? (
            <span
              className={`health-chart-delta${
                deltaPositive ? ' health-chart-delta--up' : deltaNegative ? ' health-chart-delta--down' : ' health-chart-delta--flat'
              }`}
            >
              {deltaPositive ? <FiArrowUp aria-hidden /> : null}
              {deltaNegative ? <FiArrowDown aria-hidden /> : null}
              {!deltaPositive && !deltaNegative ? <FiMinus aria-hidden /> : null}
              {deltaText} vs tvůj průměr
            </span>
          ) : null}
        </div>
      </div>

      <div className="health-chart-svg-wrap">
        <svg
          className="health-chart-svg"
          viewBox={`0 0 560 ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={title}
          onMouseLeave={() => setHovered(null)}
        >
          <line
            x1={chartData.pad.l}
            y1={chartData.yMinY}
            x2={chartData.pad.l + chartData.W}
            y2={chartData.yMinY}
            stroke="rgba(148,163,184,0.35)"
            strokeWidth="1"
          />
          <line
            x1={chartData.pad.l}
            y1={chartData.pad.t}
            x2={chartData.pad.l}
            y2={chartData.yMinY}
            stroke="rgba(148,163,184,0.2)"
            strokeWidth="1"
          />

          <text
            x={chartData.pad.l - 6}
            y={chartData.yMaxY + 4}
            textAnchor="end"
            className="health-chart-axis-label"
          >
            {formatAxisValue(chartData.scale.max, unitLabel)}
          </text>
          <text
            x={chartData.pad.l - 6}
            y={chartData.yMinY}
            textAnchor="end"
            dominantBaseline="ideographic"
            className="health-chart-axis-label"
          >
            {formatAxisValue(chartData.scale.min, unitLabel)}
          </text>

          {chartData.baselineD && (
            <path
              d={chartData.baselineD}
              fill="none"
              stroke={baselineColor}
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          )}
          <path
            d={chartData.pathD}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {chartData.primaryPts.map((p) => (
            <circle
              key={p.date}
              cx={p.x}
              cy={p.y}
              r={hovered?.date === p.date ? 5 : 3.5}
              fill={color}
              onMouseEnter={() => setHovered(p)}
              style={{ cursor: 'pointer' }}
            >
              <title>{`${formatShortDate(p.date)}: ${formatMetricValue(p.value, unit === '' ? 'count' : unit)}${displayUnit ? ` ${displayUnit}` : ''}`}</title>
            </circle>
          ))}

          {chartData.xLabels.map((p) => (
            <text
              key={`x-${p.date}`}
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              className="health-chart-axis-label health-chart-axis-label--x"
            >
              {formatShortDate(p.date)}
            </text>
          ))}
        </svg>

        {hovered ? (
          <div className="health-chart-tooltip" role="status">
            <strong>{formatShortDate(hovered.date)}</strong>
            <span>
              {formatMetricValue(hovered.value, unit === '' ? 'count' : unit)}
              {displayUnit ? ` ${displayUnit}` : ''}
            </span>
          </div>
        ) : null}
      </div>

      {validBaseline.length > 0 && (
        <p className="health-chart-legend">
          <span className="health-chart-legend-line health-chart-legend-line--primary" style={{ background: color }} />
          dnes: {formatMetricValue(latestPoint?.value, unit === '' ? 'count' : unit)}{displayUnit ? ` ${displayUnit}` : ''}
          <span className="health-chart-legend-line health-chart-legend-line--baseline" />
          7denní průměr: {formatMetricValue(latestBaseline?.value, unit === '' ? 'count' : unit)}{displayUnit ? ` ${displayUnit}` : ''}
        </p>
      )}

      <style jsx>{`
        .health-chart-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px 12px;
          margin-bottom: 8px;
        }
        .health-chart-title-block {
          flex: 1 1 180px;
          min-width: 0;
        }
        .health-chart-subtitle,
        .health-chart-status {
          margin: 4px 0 0;
          font-size: 0.82rem;
          line-height: 1.45;
          color: ${BM_ON_DESIGN.colors.textMuted};
          font-weight: 400;
        }
        .health-chart-latest {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }
        .health-chart-latest-value {
          font-size: 1.45rem;
          font-weight: 700;
          line-height: 1.1;
          color: ${BM_ON_DESIGN.colors.text};
        }
        .health-chart-latest-unit {
          margin-left: 4px;
          font-size: 0.82rem;
          font-weight: 600;
          color: ${BM_ON_DESIGN.colors.textMuted};
        }
        .health-chart-delta {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.78rem;
          color: ${BM_ON_DESIGN.colors.textMuted};
        }
        .health-chart-delta--up { color: ${BM_ON_DESIGN.colors.green}; }
        .health-chart-delta--down { color: ${BM_ON_DESIGN.colors.red}; }
        .health-chart-svg-wrap {
          position: relative;
        }
        :global(.health-chart-axis-label) {
          fill: ${BM_ON_DESIGN.colors.textDim};
          font-size: 10px;
        }
        :global(.health-chart-axis-label--x) {
          font-size: 9px;
        }
        .health-chart-tooltip {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.92);
          border: 1px solid ${BM_ON_DESIGN.colors.border};
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 0.82rem;
          pointer-events: none;
        }
        .health-chart-tooltip strong {
          color: ${BM_ON_DESIGN.colors.textMuted};
          font-weight: 600;
        }
        .health-chart-tooltip span {
          color: ${BM_ON_DESIGN.colors.text};
          font-weight: 700;
        }
      `}</style>
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
