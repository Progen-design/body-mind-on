// components/HabitEntryWizard.js – Vstupní formulář s bublinami návyků (proklikávací průvodce)
import { useState } from 'react';
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../lib/habits';

const WIZARD_STORAGE_KEY = 'habitEntryWizardSeen';

export default function HabitEntryWizard({ program, onClose }) {
  const [step, setStep] = useState(0);

  const programTitle = program === 'ON_CLUB' ? 'ON Clubu' : program === 'VIP' ? 'VIP' : '';

  const steps = [
    {
      title: programTitle ? `Vítej v ${programTitle}! 🎯` : 'Denní návyky 🎯',
      content: 'Tady můžeš sledovat své návyky den po dni. Proklikej si jednotlivé kroky.',
      showBubbles: null,
    },
    {
      title: 'Pozitivní návyky',
      content: 'Klikni na bublinu pro označení „splněno“ ✓. Každý den si odškrtávej, co jsi zvládl.',
      showBubbles: 'positive',
    },
    {
      title: 'Zlozvyky (vyhnul se = ✓)',
      content: 'U zlozvyků ✓ znamená „vyhnul jsem se“ – dobrý den!',
      showBubbles: 'negative',
    },
    {
      title: 'Přepínač data',
      content: 'Šipkami ◀ ▶ můžeš přepínat datum a doplnit návyky z jiných dní.',
      showBubbles: null,
    },
    {
      title: 'Hotovo! 🎉',
      content: 'Začni sledovat své návyky každý den. Každý malý krok se počítá.',
      showBubbles: null,
    },
  ];

  const currentStep = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = () => {
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

  const habitsToShow = currentStep.showBubbles === 'positive'
    ? POSITIVE_HABITS
    : currentStep.showBubbles === 'negative'
      ? NEGATIVE_HABITS
      : null;

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

          {habitsToShow && (
            <div className={`habit-wizard-bubbles habit-wizard-bubbles-${currentStep.showBubbles}`}>
              {habitsToShow.map((h) => (
                <div key={h.id} className="habit-wizard-bubble" title={h.label}>
                  <span className="habit-wizard-emoji">{h.emoji}</span>
                  <span className="habit-wizard-check">○</span>
                  <span className="habit-wizard-label">{h.label}</span>
                </div>
              ))}
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
            <button className="habit-wizard-skip" onClick={handleClose}>
              Přeskočit
            </button>
            <button className="habit-wizard-next" onClick={handleNext}>
              {isLast ? 'Začít' : 'Další'}
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
          color: #fff;
          font-weight: 700;
        }

        .habit-wizard-text {
          margin: 0 0 20px;
          color: #cbd5e1;
          line-height: 1.6;
          font-size: 15px;
        }

        .habit-wizard-bubbles {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: center;
          margin-bottom: 24px;
          padding: 16px 0;
        }

        .habit-wizard-bubble {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-width: 80px;
          padding: 14px 12px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          color: #94a3b8;
          font-size: 11px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .habit-wizard-bubbles-negative .habit-wizard-bubble {
          border-color: rgba(248, 113, 113, 0.25);
        }

        .habit-wizard-emoji {
          font-size: 24px;
        }

        .habit-wizard-check {
          font-size: 18px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.4);
        }

        .habit-wizard-label {
          text-align: center;
          line-height: 1.2;
          max-width: 75px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
          gap: 12px;
          justify-content: flex-end;
        }

        .habit-wizard-skip,
        .habit-wizard-next {
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }

        .habit-wizard-skip {
          background: transparent;
          color: #94a3b8;
          border: 1px solid #475569;
        }

        .habit-wizard-skip:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }

        .habit-wizard-next {
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
        }

        .habit-wizard-next:hover {
          background: linear-gradient(135deg, #6d28d9, #8b5cf6);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(155, 92, 255, 0.4);
        }
      `}</style>
    </>
  );
}
