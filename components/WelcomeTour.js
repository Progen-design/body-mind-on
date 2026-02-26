// /components/WelcomeTour.js - Welcome tour pro nové uživatele
import { useState, useEffect } from 'react';

export default function WelcomeTour({ onClose }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Tvůj plán je připraven! 👋',
      content: 'První krok: Podívej se níže na jídelníček a zapiš svůj první trénink. Plán máš v e-mailu i tady v aplikaci.',
      position: 'center'
    },
    {
      title: 'Rychlé akce',
      content: 'Klikni na "Zapsat trénink" pro rychlý zápis. Data se aktualizují okamžitě!',
      position: 'top'
    },
    {
      title: 'Tvůj progres',
      content: 'Zde uvidíš vizualizaci změn těla a graf vývoje váhy. Postava se aktualizuje podle tvých měření.',
      position: 'center'
    },
    {
      title: 'Přehled jako u trenéra',
      content: 'KPI karty ti ukážou, kolik tréninků máš tento týden, kolik kalorií jsi spálil a aktuální váhu.',
      position: 'center'
    },
    {
      title: 'Hotovo! 🎉',
      content: 'Teď už víš, jak to funguje. Začni zapsáním prvního tréninku nebo se podívej na dnešní jídlo v plánu!',
      position: 'center'
    }
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
    localStorage.setItem('welcomeTourSeen', 'true');
    onClose();
  };

  const handleSkip = () => {
    handleClose();
  };

  return (
    <>
      <div className="welcome-tour-overlay" onClick={handleSkip} />
      <div className={`welcome-tour-modal welcome-tour-${currentStep.position}`}>
        <div className="welcome-tour-content">
          <button className="welcome-tour-close" onClick={handleSkip} aria-label="Zavřít">
            ✕
          </button>
          <h3>{currentStep.title}</h3>
          <p>{currentStep.content}</p>
          <div className="welcome-tour-progress">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`welcome-tour-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
              />
            ))}
          </div>
          <div className="welcome-tour-actions">
            <button className="welcome-tour-next" onClick={handleNext}>
              {isLast ? 'Začít' : 'Další'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .welcome-tour-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          z-index: 9998;
          backdrop-filter: blur(4px);
        }

        .welcome-tour-modal {
          position: fixed;
          z-index: 9999;
          max-width: 400px;
          width: 90%;
        }

        .welcome-tour-center {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .welcome-tour-top {
          top: 120px;
          left: 50%;
          transform: translateX(-50%);
        }

        .welcome-tour-content {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 2px solid #9b5cff;
          border-radius: 20px;
          padding: 32px 24px 24px;
          box-shadow: 0 20px 60px rgba(155, 92, 255, 0.3);
          position: relative;
        }

        .welcome-tour-close {
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

        .welcome-tour-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .welcome-tour-content h3 {
          margin: 0 0 12px;
          font-size: 24px;
          color: #fff;
          font-weight: 700;
        }

        .welcome-tour-content p {
          margin: 0 0 24px;
          color: #cbd5e1;
          line-height: 1.6;
          font-size: 15px;
        }

        .welcome-tour-progress {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-bottom: 24px;
        }

        .welcome-tour-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.3s;
        }

        .welcome-tour-dot.active {
          background: #9b5cff;
          width: 24px;
          border-radius: 4px;
        }

        .welcome-tour-dot.completed {
          background: #22c55e;
        }

        .welcome-tour-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .welcome-tour-next {
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
        }

        .welcome-tour-next:hover {
          background: linear-gradient(135deg, #6d28d9, #8b5cf6);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(155, 92, 255, 0.4);
        }

        @media (max-width: 640px) {
          .welcome-tour-modal {
            width: 95%;
          }

          .welcome-tour-content {
            padding: 24px 20px 20px;
          }

          .welcome-tour-content h3 {
            font-size: 20px;
          }
        }
      `}</style>
    </>
  );
}

