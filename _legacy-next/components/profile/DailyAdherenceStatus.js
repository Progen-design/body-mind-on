import { HODNOCENI_UI } from '../../lib/dailyAdherence';

/**
 * Read-only daily adherence — derived from meals, workout, Apple Watch.
 */
export default function DailyAdherenceStatus({ adherence, loading = false }) {
  const hodnoceni = adherence?.hodnoceni || 'zadna_data';
  const ui = HODNOCENI_UI[hodnoceni] || HODNOCENI_UI.zadna_data;

  if (loading && !adherence) {
    return (
      <p className="daily-adherence daily-adherence--loading" aria-live="polite">
        Dnešek: …
      </p>
    );
  }

  return (
    <p className={`daily-adherence daily-adherence--${hodnoceni}`} aria-live="polite">
      <span className="daily-adherence-label">Dnešek:</span>
      <span className="daily-adherence-emoji" aria-hidden="true">{ui.emoji}</span>
      <span className="daily-adherence-text">{ui.label}</span>
      <style jsx>{`
        .daily-adherence {
          margin: 0 0 12px;
          font-size: 0.88rem;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-wrap: wrap;
        }
        .daily-adherence-label {
          color: #64748b;
        }
        .daily-adherence-emoji {
          font-size: 0.95rem;
          line-height: 1;
        }
        .daily-adherence-text {
          font-weight: 600;
          color: #cbd5e1;
        }
        .daily-adherence--skvele .daily-adherence-text {
          color: #86efac;
        }
        .daily-adherence--dobre .daily-adherence-text {
          color: #a7f3d0;
        }
        .daily-adherence--castecne .daily-adherence-text {
          color: #fde68a;
        }
        .daily-adherence--slabe .daily-adherence-text {
          color: #fdba74;
        }
        .daily-adherence--zadna_data .daily-adherence-text {
          color: #94a3b8;
          font-weight: 500;
        }
        .daily-adherence--loading {
          opacity: 0.7;
        }
      `}</style>
    </p>
  );
}
