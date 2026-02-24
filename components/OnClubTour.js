// components/OnClubTour.js – Průvodce pro uživatele ON Club (habit tracker)
import { useState } from 'react';

export default function OnClubTour({ onClose }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Vítej v ON Clubu! 🎯',
      content: 'Jako člen ON Clubu máš přístup k dennímu sledování návyků. Sleduj, co děláš dobře, a co bys chtěl zlepšit.',
      position: 'center',
    },
    {
      title: 'Pozitivní návyky',
      content: 'Trénink, denní pohyb, mobilita, meditace, dechové cvičení, kvalitní spánek, digitální detox, zdravá strava, pitný režim, studená sprcha, čtení, vděčnost. Klikni na návyk pro označení „splněno“ ✓.',
      position: 'center',
    },
    {
      title: 'Zlozvyky',
      content: 'Kouření, alkohol, junk food, scrollování sociálních sítí, nedostatek spánku. U zlozvyků ✓ znamená „vyhnul jsem se“ – dobrý den!',
      position: 'center',
    },
    {
      title: 'Přepínač data',
      content: 'Šipkami ◀ ▶ můžeš přepínat datum a doplnit návyky z jiných dní.',
      position: 'center',
    },
    {
      title: 'Hotovo! 🎉',
      content: 'Začni sledovat své návyky každý den. Každý malý krok se počítá.',
      position: 'center',
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
      localStorage.setItem('onClubTourSeen', 'true');
    }
    onClose();
  };

  const handleSkip = () => {
    handleClose();
  };

  return (
    <>
      <div className="onclub-tour-overlay" onClick={handleSkip} />
      <div className={`onclub-tour-modal onclub-tour-${currentStep.position}`}>
        <div className="onclub-tour-content">
          <button className="onclub-tour-close" onClick={handleSkip} aria-label="Zavřít">
            ✕
          </button>
          <h3>{currentStep.title}</h3>
          <p>{currentStep.content}</p>
          <div className="onclub-tour-progress">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`onclub-tour-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
              />
            ))}
          </div>
          <div className="onclub-tour-actions">
            {!isLast && (
              <button className="onclub-tour-skip" onClick={handleSkip}>
                Přeskočit
              </button>
            )}
            <button className="onclub-tour-next" onClick={handleNext}>
              {isLast ? 'Začít' : 'Další'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .onclub-tour-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          z-index: 9998;
          backdrop-filter: blur(4px);
        }

        .onclub-tour-modal {
          position: fixed;
          z-index: 9999;
          max-width: 420px;
          width: 90%;
        }

        .onclub-tour-center {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .onclub-tour-content {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 2px solid #9b5cff;
          border-radius: 20px;
          padding: 32px 24px 24px;
          box-shadow: 0 20px 60px rgba(155, 92, 255, 0.3);
          position: relative;
        }

        .onclub-tour-close {
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
          transition: all 0.2s;
        }

        .onclub-tour-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .onclub-tour-content h3 {
          margin: 0 0 12px;
          font-size: 24px;
          color: #fff;
          font-weight: 700;
        }

        .onclub-tour-content p {
          margin: 0 0 24px;
          color: #cbd5e1;
          line-height: 1.6;
          font-size: 15px;
        }

        .onclub-tour-progress {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-bottom: 24px;
        }

        .onclub-tour-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.3s;
        }

        .onclub-tour-dot.active {
          background: #9b5cff;
          width: 24px;
          border-radius: 4px;
        }

        .onclub-tour-dot.completed {
          background: #22c55e;
        }

        .onclub-tour-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .onclub-tour-skip,
        .onclub-tour-next {
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }

        .onclub-tour-skip {
          background: transparent;
          color: #94a3b8;
          border: 1px solid #475569;
        }

        .onclub-tour-skip:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }

        .onclub-tour-next {
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
        }

        .onclub-tour-next:hover {
          background: linear-gradient(135deg, #6d28d9, #8b5cf6);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(155, 92, 255, 0.4);
        }

        @media (max-width: 640px) {
          .onclub-tour-modal {
            width: 95%;
          }

          .onclub-tour-content {
            padding: 24px 20px 20px;
          }

          .onclub-tour-content h3 {
            font-size: 20px;
          }
        }
      `}</style>
    </>
  );
}
