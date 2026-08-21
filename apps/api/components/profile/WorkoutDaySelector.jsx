export default function WorkoutDaySelector({ value = [], onChange, labels = [], maxSelections = 7, disabled = false }) {
  const selectedDays = Array.isArray(value) ? value : [];
  const reachedMax = selectedDays.length >= maxSelections;

  const toggleDay = (day) => {
    if (disabled) return;
    if (!selectedDays.includes(day) && reachedMax) return;
    const next = selectedDays.includes(day)
      ? selectedDays.filter((item) => item !== day)
      : [...selectedDays, day].sort((a, b) => a - b);
    onChange(next);
  };

  return (
    <div className="workout-day-selector" role="group" aria-label="Vyber dny tréninku">
      {labels.map(({ v, label }) => {
        const active = selectedDays.includes(v);
        const isDisabled = disabled || (!active && reachedMax);
        return (
          <button
            key={v}
            type="button"
            className={`day-chip ${active ? 'day-chip--active' : ''} ${isDisabled ? 'day-chip--disabled' : ''}`}
            onClick={() => toggleDay(v)}
            aria-pressed={active}
            disabled={isDisabled}
          >
            <span className="day-chip-label">{label}</span>
          </button>
        );
      })}

      <style jsx>{`
        .workout-day-selector {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 10px;
        }
        .day-chip {
          min-height: 54px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.72);
          color: #cbd5e1;
          font-size: 0.98rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
        }
        .day-chip:hover {
          transform: translateY(-1px);
          border-color: rgba(167, 139, 250, 0.35);
          color: #f8fafc;
        }
        .day-chip--active {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.28), rgba(59, 130, 246, 0.22));
          border-color: rgba(167, 139, 250, 0.58);
          box-shadow: inset 0 0 0 1px rgba(196, 181, 253, 0.18), 0 14px 28px rgba(15, 23, 42, 0.26);
          color: #ffffff;
        }
        .day-chip--disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .day-chip-label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 767px) {
          .workout-day-selector {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
