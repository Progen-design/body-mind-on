import { useState } from 'react';
import {
  formatWatchWorkoutMetaLine,
  watchWorkoutEmoji,
} from '../../lib/health/formatters';

export default function WorkoutHistoryList({
  rows = [],
  initialVisible = 3,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);

  if (!rows.length) return null;

  const hiddenCount = Math.max(0, rows.length - initialVisible);
  const visibleRows = expanded ? rows : rows.slice(0, initialVisible);

  return (
    <div className={className}>
      <ul className="workout-list">
        {visibleRows.map((row, idx) => {
          const key = row.id || `${row.started_at}-${row.external_id}-${idx}`;
          const label = row.label_cs || row.workout_type || 'Trénink';
          const emoji = watchWorkoutEmoji(row.category, row.canonical_type);
          const meta = formatWatchWorkoutMetaLine(row);

          return (
            <li key={key} className="workout-item workout-item--watch">
              <span className="workout-icon" aria-hidden>{emoji}</span>
              <div className="workout-info">
                <strong>{label}</strong>
                <span className="workout-meta">{meta}</span>
              </div>
              <span className="workout-source-badge" title="Synchronizováno z Apple Watch">⌚</span>
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="workout-expand-btn"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? 'Skrýt starší tréninky' : `Zobrazit starší tréninky (${hiddenCount})`}
        </button>
      )}

      <style jsx>{`
        :global(.workout-item--watch) {
          padding-right: 8px;
        }
        :global(.workout-source-badge) {
          flex-shrink: 0;
          font-size: 0.9rem;
          opacity: 0.55;
          margin-left: 8px;
        }
      `}</style>
    </div>
  );
}
