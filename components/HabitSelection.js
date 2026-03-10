// components/HabitSelection.js – modern card výběr návyků pro registraci
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../lib/habits';

export default function HabitSelection({ selectedIds = [], suggestedIds = [], onChange }) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  const suggested = Array.isArray(suggestedIds) ? suggestedIds : [];
  const toggle = (id) => {
    const next = ids.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  return (
    <div className="habit-selection">
      <p className="habit-selection-intro">
        Vyber si návyky, které chceš sledovat v profilu. Některé jsou předvybrané podle tvých odpovědí.
      </p>
      <div className="habit-selection-group">
        <h4 className="habit-selection-title">Pozitivní návyky</h4>
        <div className="habit-selection-list">
          {POSITIVE_HABITS.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`habit-selection-item ${ids.includes(h.id) ? 'habit-selection-item--active' : ''}`}
              onClick={() => toggle(h.id)}
              aria-pressed={ids.includes(h.id)}
            >
              <span className="habit-selection-check" aria-hidden>{ids.includes(h.id) ? '✓' : ''}</span>
              <span className="habit-selection-emoji">{h.emoji}</span>
              <span className="habit-selection-text">
                <strong>{h.label}</strong>
                {h.description && <span className="habit-selection-hint">{h.description}</span>}
                {suggested.includes(h.id) && !ids.includes(h.id) ? (
                  <span className="habit-selection-badge">doporučeno</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="habit-selection-group habit-selection-group-negative">
        <h4 className="habit-selection-title">Zlozvyky (vyhnul se = ✓)</h4>
        <div className="habit-selection-list">
          {NEGATIVE_HABITS.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`habit-selection-item ${ids.includes(h.id) ? 'habit-selection-item--active' : ''}`}
              onClick={() => toggle(h.id)}
              aria-pressed={ids.includes(h.id)}
            >
              <span className="habit-selection-check" aria-hidden>{ids.includes(h.id) ? '✓' : ''}</span>
              <span className="habit-selection-emoji">{h.emoji}</span>
              <span className="habit-selection-text">
                <strong>{h.label}</strong>
                {h.description && <span className="habit-selection-hint">{h.description}</span>}
                {suggested.includes(h.id) && !ids.includes(h.id) ? (
                  <span className="habit-selection-badge">doporučeno</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
      <style jsx>{`
        .habit-selection {
          margin: 0;
        }
        .habit-selection-intro {
          margin: 0 0 16px;
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.5;
        }
        .habit-selection-group {
          margin-bottom: 20px;
        }
        .habit-selection-group-negative .habit-selection-title {
          color: #f87171;
        }
        .habit-selection-title {
          margin: 0 0 10px;
          font-size: 14px;
          font-weight: 600;
          color: #94a3b8;
        }
        .habit-selection-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .habit-selection-item {
          width: 100%;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          text-align: left;
          padding: 12px 14px;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.7));
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 14px;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }
        .habit-selection-item:hover {
          transform: translateY(-1px);
          border-color: rgba(125, 211, 252, 0.5);
          box-shadow: 0 12px 26px rgba(2, 6, 23, 0.32);
        }
        .habit-selection-item--active {
          border-color: rgba(14, 165, 233, 0.6);
          background: linear-gradient(135deg, rgba(14, 116, 144, 0.22), rgba(37, 99, 235, 0.22));
          box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.25), 0 12px 26px rgba(2, 6, 23, 0.32);
          color: #e2e8f0;
        }
        .habit-selection-check {
          margin-top: 1px;
          width: 18px;
          height: 18px;
          border-radius: 6px;
          border: 1px solid rgba(148, 163, 184, 0.38);
          background: rgba(15, 23, 42, 0.55);
          color: #38bdf8;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .habit-selection-emoji {
          font-size: 17px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .habit-selection-text {
          display: grid;
          gap: 3px;
        }
        .habit-selection-text strong {
          color: #f1f5f9;
          font-size: 13px;
          line-height: 1.3;
        }

        .habit-selection-hint {
          display: block;
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 400;
        }
        .habit-selection-badge {
          display: inline-flex;
          margin-top: 4px;
          width: fit-content;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(56, 189, 248, 0.3);
          background: rgba(14, 165, 233, 0.16);
          color: #7dd3fc;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        @media (max-width: 860px) {
          .habit-selection-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
