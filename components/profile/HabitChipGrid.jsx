import { NEGATIVE_HABITS, POSITIVE_HABITS } from '../../lib/habits';

function HabitGroup({ title, description, items, selectedIds, onToggle, negative = false }) {
  return (
    <section className="habit-group">
      <div className="habit-group-header">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>

      <div className="habit-grid">
        {items.map((habit) => {
          const selected = selectedIds.includes(habit.id);
          return (
            <button
              key={habit.id}
              type="button"
              className={`habit-card ${selected ? 'habit-card--selected' : ''} ${negative ? 'habit-card--negative' : ''}`}
              onClick={() => onToggle(habit.id)}
              aria-pressed={selected}
            >
              <span className="habit-card-emoji" aria-hidden>
                {habit.emoji}
              </span>
              <span className="habit-card-copy">
                <span className="habit-card-title">{habit.label}</span>
                {habit.description ? <span className="habit-card-description">{habit.description}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <style jsx>{`
        .habit-group {
          display: grid;
          gap: 16px;
        }
        .habit-group-header h4 {
          margin: 0;
          font-size: 1rem;
          color: #f8fafc;
        }
        .habit-group-header p {
          margin: 6px 0 0;
          color: #94a3b8;
          line-height: 1.5;
        }
        .habit-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .habit-card {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          min-height: 92px;
          padding: 16px;
          text-align: left;
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.68);
          color: #cbd5e1;
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }
        .habit-card:hover {
          transform: translateY(-1px);
          border-color: rgba(167, 139, 250, 0.34);
          background: rgba(15, 23, 42, 0.84);
        }
        .habit-card--selected {
          border-color: rgba(96, 165, 250, 0.44);
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(14, 165, 233, 0.12));
          color: #f8fafc;
          box-shadow: 0 18px 34px rgba(15, 23, 42, 0.26);
        }
        .habit-card--negative.habit-card--selected {
          border-color: rgba(248, 113, 113, 0.4);
          background: linear-gradient(135deg, rgba(127, 29, 29, 0.32), rgba(127, 29, 29, 0.12));
        }
        .habit-card-emoji {
          font-size: 1.6rem;
          line-height: 1;
        }
        .habit-card-copy {
          display: grid;
          gap: 6px;
        }
        .habit-card-title {
          font-size: 0.98rem;
          font-weight: 700;
        }
        .habit-card-description {
          font-size: 0.9rem;
          line-height: 1.45;
          color: inherit;
          opacity: 0.82;
        }

        @media (max-width: 767px) {
          .habit-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

export default function HabitChipGrid({ selectedIds = [], onChange }) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];

  const toggle = (habitId) => {
    const next = ids.includes(habitId)
      ? ids.filter((id) => id !== habitId)
      : [...ids, habitId];
    onChange(next);
  };

  return (
    <div className="habit-chip-grid">
      <div className="habit-summary">
        <span className="habit-summary-badge">{ids.length} vybraných</span>
        <p>
          Vyber si návyky, které chceš reálně sledovat. Z těchto vstupů pak AI vyhodnocuje progres a další doporučení.
        </p>
      </div>

      <HabitGroup
        title="Pozitivní návyky"
        description="Tohle chceš držet konzistentně a ideálně postupně zesilovat."
        items={POSITIVE_HABITS}
        selectedIds={ids}
        onToggle={toggle}
      />

      <HabitGroup
        title="Zlozvyky a brzdy"
        description="Vyber i to, co chceš omezovat. Systém to pak může zohlednit v dalších doporučeních."
        items={NEGATIVE_HABITS}
        selectedIds={ids}
        onToggle={toggle}
        negative
      />

      <style jsx>{`
        .habit-chip-grid {
          display: grid;
          gap: 26px;
        }
        .habit-summary {
          display: grid;
          gap: 10px;
          padding: 18px 20px;
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.48);
        }
        .habit-summary-badge {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.16);
          color: #bfdbfe;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .habit-summary p {
          margin: 0;
          color: #94a3b8;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
