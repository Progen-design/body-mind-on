import { formatDistanceKm, formatDurationMinutes } from '../../lib/health/formatters';

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
  if (!rows.length) {
    return (
      <div className="health-workouts health-workouts--empty">
        <h3 className="health-subsection-title">Tréninky z Apple Watch</h3>
        <p className="health-empty-text">Zatím žádné zaznamenané tréninky.</p>
      </div>
    );
  }

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
            {rows.map((row) => (
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
    </div>
  );
}
