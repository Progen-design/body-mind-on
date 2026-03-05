// components/HabitEntryWizard.js – Vstupní formulář s výběrem návyků (proklikávací průvodce)
import { useState } from 'react';
import { POSITIVE_HABITS, NEGATIVE_HABITS, getSuggestedHabits } from '../lib/habits';

const WIZARD_STORAGE_KEY = 'habitEntryWizardSeen';

export default function HabitEntryWizard({ program, session, bodyMetrics, userHabits, onClose, onHabitsSaved }) {
  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => {
    const existing = (userHabits || []).map((h) => h.habit_id);
    if (existing.length > 0) return existing;
    const regMetric = Array.isArray(bodyMetrics) && bodyMetrics.length > 0
      ? bodyMetrics[bodyMetrics.length - 1]
      : null;
    return getSuggestedHabits(regMetric);
  });
  const [saving, setSaving] = useState(false);

  const programTitle = program === 'ON_CLUB' ? 'ON Clubu' : program === 'VIP' ? 'VIP' : '';

  const steps = [
    {
      title: programTitle ? `Vítej v ${programTitle}! 🎯` : 'Denní návyky 🎯',
      content: 'Tady můžeš sledovat své návyky den po dni. Nejprve si vyber, které návyky chceš sledovat.',
      showSelection: false,
    },
    {
      title: 'Vyber si návyky',
      content: 'Zaškrtni návyky, které chceš sledovat. Některé jsou předvybrané podle tvého profilu.',
      showSelection: true,
    },
    {
      title: 'Přepínač data',
      content: 'Šipkami ◀ ▶ můžeš přepínat datum a doplnit návyky z jiných dní.',
      showSelection: false,
    },
    {
      title: 'Hotovo! 🎉',
      content: 'Začni sledovat své návyky každý den. Každý malý krok se počítá.',
      showSelection: false,
    },
  ];

  const currentStep = steps[step];
  const isLast = step === steps.length - 1;
  const isSelectionStep = currentStep.showSelection;

  const toggleHabit = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleNext = async () => {
    if (isSelectionStep && selectedIds.length > 0) {
      setSaving(true);
      try {
        const token = session?.access_token;
        if (!token) {
          handleClose();
          return;
        }
        const habits = selectedIds.map((habit_id) => ({ habit_id }));
        const res = await fetch('/api/user-habits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ habits }),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          onHabitsSaved?.();
        }
      } catch (err) {
        console.error('[HabitEntryWizard] save error:', err);
      } finally {
        setSaving(false);
      }
    }

    if (isLast) {
      handleClose();
    } else {
      setStep(step + 1);
    }
  };

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WIZARD_STORAGE_KEY, 'true');
    }
    onClose();
  };

  const canProceed = !isSelectionStep || selectedIds.length > 0;

  return (
    <>
      <div className="habit-wizard-overlay" onClick={handleClose} />
      <div className="habit-wizard-modal">
        <div className="habit-wizard-content">
          <button className="habit-wizard-close" onClick={handleClose} aria-label="Zavřít">
            ✕
          </button>
          <h3>{currentStep.title}</h3>
          <p className="habit-wizard-text">{currentStep.content}</p>

          {isSelectionStep && (
            <div className="habit-wizard-selection">
              <p className="habit-wizard-recommendation">Doporučujeme vybrat 3–7 návyků – méně je často lépe udržitelné.</p>
              <div className="habit-wizard-group">
                <h4 className="habit-wizard-group-title">Pozitivní návyky</h4>
                <div className="habit-wizard-checkboxes">
                  {POSITIVE_HABITS.map((h) => (
                    <label key={h.id} className="habit-wizard-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(h.id)}
                        onChange={() => toggleHabit(h.id)}
                      />
                      <span className="habit-wizard-checkbox-emoji">{h.emoji}</span>
                      <span className="habit-wizard-checkbox-label"><strong>{h.label}</strong>{h.description && <span className="habit-wizard-checkbox-hint"> ({h.description})</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="habit-wizard-group habit-wizard-group-negative">
                <h4 className="habit-wizard-group-title">Zlozvyky (vyhnul se = ✓)</h4>
                <div className="habit-wizard-checkboxes">
                  {NEGATIVE_HABITS.map((h) => (
                    <label key={h.id} className="habit-wizard-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(h.id)}
                        onChange={() => toggleHabit(h.id)}
                      />
                      <span className="habit-wizard-checkbox-emoji">{h.emoji}</span>
                      <span className="habit-wizard-checkbox-label"><strong>{h.label}</strong>{h.description && <span className="habit-wizard-checkbox-hint"> ({h.description})</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
              {selectedIds.length === 0 && (
                <p className="habit-wizard-hint">Vyber alespoň jeden návyk pro pokračování.</p>
              )}
            </div>
          )}

          <div className="habit-wizard-progress">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`habit-wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
              />
            ))}
          </div>
          <div className="habit-wizard-actions">
            <button
              className="habit-wizard-next"
              onClick={handleNext}
              disabled={!canProceed || saving}
            >
              {saving ? 'Ukládám…' : isLast ? 'Začít' : 'Další'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .habit-wizard-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          z-index: 9998;
          backdrop-filter: blur(4px);
        }

        .habit-wizard-modal {
          position: fixed;
          z-index: 9999;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          max-width: 480px;
          width: 92%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .habit-wizard-content {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 2px solid #9b5cff;
          border-radius: 24px;
          padding: 28px 24px 24px;
          box-shadow: 0 20px 60px rgba(155, 92, 255, 0.3);
          position: relative;
        }

        .habit-wizard-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 20px;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }

        .habit-wizard-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .habit-wizard-content h3 {
          margin: 0 0 12px;
          font-size: 22px;
          font-weight: 700;
          color: #fff;
        }

        .habit-wizard-text {
          margin: 0 0 20px;
          color: #cbd5e1;
          line-height: 1.6;
          font-size: 15px;
        }

        .habit-wizard-selection {
          margin-bottom: 24px;
          max-height: 320px;
          overflow-y: auto;
        }

        .habit-wizard-group {
          margin-bottom: 20px;
        }

        .habit-wizard-group-negative .habit-wizard-group-title {
          color: #f87171;
        }

        .habit-wizard-group-title {
          margin: 0 0 10px;
          font-size: 14px;
          font-weight: 600;
          color: #94a3b8;
        }

        .habit-wizard-checkboxes {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .habit-wizard-checkbox {
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

        .habit-wizard-checkbox:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .habit-wizard-checkbox input {
          accent-color: #9b5cff;
          width: 18px;
          height: 18px;
        }

        .habit-wizard-checkbox-emoji {
          font-size: 18px;
        }

        .habit-wizard-checkbox-hint {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 400;
        }

        .habit-wizard-group-negative .habit-wizard-checkbox {
          border-color: rgba(248, 113, 113, 0.25);
        }

        .habit-wizard-hint {
          margin: 12px 0 0;
          font-size: 13px;
          color: #f87171;
        }

        .habit-wizard-recommendation {
          margin: 0 0 16px;
          font-size: 13px;
          color: #94a3b8;
          font-style: italic;
        }

        .habit-wizard-progress {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-bottom: 20px;
        }

        .habit-wizard-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.3s;
        }

        .habit-wizard-dot.active {
          background: #9b5cff;
          width: 24px;
          border-radius: 4px;
        }

        .habit-wizard-dot.completed {
          background: #22c55e;
        }

        .habit-wizard-actions {
          display: flex;
          justify-content: flex-end;
        }

        .habit-wizard-next {
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }

        .habit-wizard-next {
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
        }

        .habit-wizard-next:hover:not(:disabled) {
          background: linear-gradient(135deg, #6d28d9, #8b5cf6);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(155, 92, 255, 0.4);
        }

        .habit-wizard-next:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
