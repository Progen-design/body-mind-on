// components/HabitSelection.js – výběr návyků (checkboxy) pro registraci
import { POSITIVE_HABITS, NEGATIVE_HABITS, getSuggestedHabits } from '../lib/habits';

export default function HabitSelection({ selectedIds = [], onChange }) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
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
            <label key={h.id} className="habit-selection-item">
              <input
                type="checkbox"
                checked={ids.includes(h.id)}
                onChange={() => toggle(h.id)}
              />
              <span className="habit-selection-emoji">{h.emoji}</span>
              <span><strong>{h.label}</strong>{h.description && <span className="habit-selection-hint"> ({h.description})</span>}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="habit-selection-group habit-selection-group-negative">
        <h4 className="habit-selection-title">Zlozvyky (vyhnul se = ✓)</h4>
        <div className="habit-selection-list">
          {NEGATIVE_HABITS.map((h) => (
            <label key={h.id} className="habit-selection-item">
              <input
                type="checkbox"
                checked={ids.includes(h.id)}
                onChange={() => toggle(h.id)}
              />
              <span className="habit-selection-emoji">{h.emoji}</span>
              <span><strong>{h.label}</strong>{h.description && <span className="habit-selection-hint"> ({h.description})</span>}</span>
            </label>
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
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .habit-selection-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .habit-selection-item:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .habit-selection-item input {
          accent-color: #0ea5e9;
          width: 18px;
          height: 18px;
        }
        .habit-selection-emoji {
          font-size: 18px;
        }

        .habit-selection-hint {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 400;
        }
      `}</style>
    </div>
  );
}
