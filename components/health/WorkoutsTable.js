import { useState } from 'react';
import { BM_ON_DESIGN } from '../../lib/designTokens';
import { formatDistanceKm, formatDurationMinutes } from '../../lib/health/formatters';

const INITIAL_VISIBLE = 3;

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatKcal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n)} kcal`;
}

export default function WorkoutsTable({ rows = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (!rows.length) {
    return (
      <div className="health-workouts health-workouts--empty">
        <h3 className="health-subsection-title">Tréninky z Apple Watch</h3>
        <p className="health-empty-text">Zatím žádné zaznamenané tréninky.</p>
      </div>
    );
  }

  const hiddenCount = Math.max(0, rows.length - INITIAL_VISIBLE);
  const visibleRows = expanded ? rows : rows.slice(0, INITIAL_VISIBLE);

  return (
    <div className="health-workouts">
      <h3 className="health-subsection-title">Tréninky z Apple Watch</h3>
      <div className="health-table-wrap">
        <table className="health-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Trénink</th>
              <th>Délka</th>
              <th>Vzdálenost</th>
              <th>Energie</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id || `${row.started_at}-${row.external_id}`}>
                <td>{formatDateTime(row.started_at)}</td>
                <td>{row.label_cs || row.workout_type || '—'}</td>
                <td>{formatDurationMinutes(row.duration_s)}</td>
                <td>{formatDistanceKm(row.distance_m)}</td>
                <td>{formatKcal(row.active_kcal ?? row.total_kcal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="health-workouts-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? 'Sbalit' : `Zobrazit dalších ${hiddenCount} tréninků`}
        </button>
      )}

      <style jsx>{`
        .health-workouts-toggle {
          margin-top: 12px;
          padding: 8px 14px;
          border-radius: 10px;
          border: 1px solid ${BM_ON_DESIGN.colors.border};
          background: rgba(0, 0, 0, 0.12);
          color: ${BM_ON_DESIGN.colors.textMuted};
          font-size: 0.85rem;
          cursor: pointer;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .health-workouts-toggle:hover {
          color: ${BM_ON_DESIGN.colors.text};
          border-color: rgba(14, 165, 233, 0.35);
        }
      `}</style>
    </div>
  );
}
