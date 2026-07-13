import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const CATEGORIES = [
  { value: 'useful', label: 'Užitečné' },
  { value: 'confusing', label: 'Matoucí' },
  { value: 'unrealistic', label: 'Nereálné' },
  { value: 'missing_feature', label: 'Chybí funkce' },
  { value: 'technical_problem', label: 'Technický problém' },
  { value: 'other', label: 'Jiné' },
];

export default function BetaFeedbackButton({ context = 'general', label = 'Poslat zpětnou vazbu' }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!score || submitting) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context,
          score,
          category: category || null,
          message: message.trim() || null,
        }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => setOpen(false), 1200);
      }
    } catch {
      /* silent */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className="beta-feedback-trigger" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="beta-feedback-overlay" role="dialog" aria-modal="true" aria-labelledby="beta-feedback-title">
          <div className="beta-feedback-modal">
            <h3 id="beta-feedback-title">Zpětná vazba k betě</h3>
            <p className="beta-feedback-hint">Neposílej prosím citlivé zdravotní nebo osobní údaje.</p>
            <div className="beta-feedback-stars" aria-label="Hodnocení 1 až 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`beta-feedback-star ${score >= n ? 'beta-feedback-star--on' : ''}`}
                  onClick={() => setScore(n)}
                  aria-label={`${n} z 5`}
                >
                  ★
                </button>
              ))}
            </div>
            <label className="beta-feedback-label">
              Kategorie
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— volitelné —</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="beta-feedback-label">
              Komentář (volitelné)
              <textarea
                value={message}
                maxLength={1000}
                rows={4}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Co bys zlepšil/a?"
              />
            </label>
            <div className="beta-feedback-actions">
              <button type="button" className="beta-feedback-cancel" onClick={() => setOpen(false)}>Zrušit</button>
              <button type="button" className="beta-feedback-submit" disabled={!score || submitting} onClick={submit}>
                {done ? 'Děkujeme!' : submitting ? 'Odesílám…' : 'Odeslat'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .beta-feedback-trigger {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: inherit;
          border-radius: 8px;
          padding: 0.4rem 0.75rem;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .beta-feedback-overlay {
          position: fixed;
          inset: 0;
          z-index: 10050;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .beta-feedback-modal {
          width: 100%;
          max-width: 420px;
          background: #1a202c;
          color: #fff;
          border-radius: 12px;
          padding: 1.1rem;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
        }
        .beta-feedback-modal h3 {
          margin: 0 0 0.35rem;
        }
        .beta-feedback-hint {
          margin: 0 0 0.75rem;
          font-size: 0.82rem;
          opacity: 0.8;
        }
        .beta-feedback-stars {
          display: flex;
          gap: 0.25rem;
          margin-bottom: 0.75rem;
        }
        .beta-feedback-star {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: rgba(255, 255, 255, 0.35);
          cursor: pointer;
        }
        .beta-feedback-star--on {
          color: #f6e05e;
        }
        .beta-feedback-label {
          display: block;
          margin-bottom: 0.65rem;
          font-size: 0.85rem;
        }
        .beta-feedback-label select,
        .beta-feedback-label textarea {
          display: block;
          width: 100%;
          margin-top: 0.25rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(0, 0, 0, 0.2);
          color: inherit;
          padding: 0.45rem;
          font-size: 0.9rem;
        }
        .beta-feedback-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .beta-feedback-cancel,
        .beta-feedback-submit {
          border-radius: 8px;
          padding: 0.45rem 0.85rem;
          font-size: 0.88rem;
          cursor: pointer;
          border: none;
        }
        .beta-feedback-cancel {
          background: transparent;
          color: inherit;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .beta-feedback-submit {
          background: #3182ce;
          color: #fff;
        }
        .beta-feedback-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
