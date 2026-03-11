import { useEffect, useRef } from 'react';
import FullscreenOverlay from './FullscreenOverlay';

const DISTANCE_KM_TYPES = ['beh', 'kolo', 'chuze', 'nordic_walking', 'brusleni', 'lyzovani'];
const DIFFICULTY_TYPES = ['silovy', 'kardio', 'ostatni'];
const QUICK_DURATION_OPTIONS = [30, 45, 60, 90];
const TYPE_VISUALS = {
  silovy: {
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=70',
    accent: '#7c3aed',
  },
  kardio: {
    image: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=1200&q=70',
    accent: '#2563eb',
  },
  beh: {
    image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=70',
    accent: '#0ea5e9',
  },
  kolo: {
    image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=70',
    accent: '#14b8a6',
  },
  chuze: {
    image: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&q=70',
    accent: '#22c55e',
  },
  plavani: {
    image: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1200&q=70',
    accent: '#06b6d4',
  },
  'strečink': {
    image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=70',
    accent: '#a855f7',
  },
  joga: {
    image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=70',
    accent: '#c026d3',
  },
  nordic_walking: {
    image: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1200&q=70',
    accent: '#16a34a',
  },
  brusleni: {
    image: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=70',
    accent: '#0284c7',
  },
  lyzovani: {
    image: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?auto=format&fit=crop&w=1200&q=70',
    accent: '#0ea5e9',
  },
  sauna: {
    image: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1200&q=70',
    accent: '#f59e0b',
  },
  ostatni: {
    image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=1200&q=70',
    accent: '#64748b',
  },
};

function toLocalDateInputValue(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

export default function WorkoutOverlay({
  open,
  onClose,
  onSubmit,
  form,
  setForm,
  error,
  saving,
  workoutTypes,
  difficultyOptions,
}) {
  const formRef = useRef(null);
  const dateInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => dateInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const isKmWorkout = DISTANCE_KM_TYPES.includes(form.workout_type);
  const isSwimming = form.workout_type === 'plavani';
  const showsDifficulty = DIFFICULTY_TYPES.includes(form.workout_type);
  const selectedType = workoutTypes.find((x) => x.id === form.workout_type) || workoutTypes[0];
  const selectedVisual = TYPE_VISUALS[selectedType?.id] || TYPE_VISUALS.ostatni;

  const setWorkoutType = (nextType) => {
    setForm((current) => ({
      ...current,
      workout_type: nextType,
      distance_m: nextType === 'plavani' ? current.distance_m : '',
      distance_km: DISTANCE_KM_TYPES.includes(nextType) ? current.distance_km : '',
      perceived_difficulty: DIFFICULTY_TYPES.includes(nextType) ? current.perceived_difficulty : '',
    }));
  };

  return (
    <FullscreenOverlay
      open={open}
      onClose={onClose}
      canClose={!saving}
      title="Záznam tréninku"
      subtitle="Vyplň jen datum, typ a délku. Ostatní pole se ukážou automaticky podle zvolené aktivity."
      size="workout"
      transparent
      headerActions={(
        <button
          type="button"
          className="btn-save"
          onClick={() => formRef.current?.requestSubmit()}
          disabled={saving}
        >
          {saving ? 'Ukládám…' : 'Uložit'}
        </button>
      )}
      footer={saving ? (
        <div className="footer-saving" role="status" aria-live="polite">
          <span className="spinner" aria-hidden />
          <span>Ukládám trénink a aktualizuji plán…</span>
        </div>
      ) : (
        <div className="footer-row">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Zrušit
          </button>
          <button
            type="button"
            className="btn-save btn-save--lg"
            onClick={() => formRef.current?.requestSubmit()}
          >
            Uložit záznam
          </button>
        </div>
      )}
    >
      <form ref={formRef} id="workout-overlay-form" className="wf" onSubmit={onSubmit}>
        <fieldset className="wf-lock" disabled={saving}>
        <section className="ws">
          <div className="type-hero" style={{ '--hero-image': `url("${selectedVisual.image}")` }}>
            <span className="type-hero-badge">Aktivita</span>
            <h4>{selectedType?.label || 'Trénink'}</h4>
            <p>Vyplň parametry a systém je použije pro výpočet zátěže, kalorií a doporučení v profilu.</p>
          </div>
          <h3 className="ws-title">Základní údaje</h3>
          <div className="row-two">
            <label className="field">
              <span className="field-label">Datum</span>
              <input
                ref={dateInputRef}
                type="date"
                value={form.workout_date}
                min={toLocalDateInputValue(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))}
                max={toLocalDateInputValue(new Date())}
                onChange={(e) => setForm((c) => ({ ...c, workout_date: e.target.value }))}
                required
              />
            </label>

            <div className="field">
              <span className="field-label">Délka tréninku</span>
              <div className="duration-row">
                <input
                  type="number"
                  min={1}
                  value={form.duration_min}
                  onChange={(e) => setForm((c) => ({ ...c, duration_min: Number(e.target.value) || 0 }))}
                  placeholder="min"
                  required
                  className="input-narrow"
                />
                <div className="quick-row">
                  {QUICK_DURATION_OPTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`quick-btn ${Number(form.duration_min) === m ? 'quick-btn--on' : ''}`}
                      onClick={() => setForm((c) => ({ ...c, duration_min: m }))}
                    >
                      {m}′
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Typ aktivity</span>
            <div className="type-grid" role="group" aria-label="Typ aktivity">
              {workoutTypes.map((type) => {
                const active = form.workout_type === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    className={`type-btn ${active ? 'type-btn--on' : ''}`}
                    style={{ '--type-image': `url("${(TYPE_VISUALS[type.id] || TYPE_VISUALS.ostatni).image}")` }}
                    onClick={() => setWorkoutType(type.id)}
                    aria-pressed={active}
                  >
                    {active && <span className="type-dot" aria-hidden />}
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="hint">Zobrazujeme jen pole, která se k vybranému typu tréninku opravdu vážou.</p>

          {isSwimming && (
            <label className="field field--half">
              <span className="field-label">Vzdálenost</span>
              <div className="input-unit">
                <input
                  type="number"
                  min={25}
                  step={25}
                  value={form.distance_m}
                  onChange={(e) => setForm((c) => ({ ...c, distance_m: e.target.value }))}
                  placeholder="0"
                />
                <span className="unit">m</span>
              </div>
            </label>
          )}

          {isKmWorkout && (
            <label className="field field--half">
              <span className="field-label">Vzdálenost</span>
              <div className="input-unit">
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={form.distance_km}
                  onChange={(e) => setForm((c) => ({ ...c, distance_km: e.target.value }))}
                  placeholder="0.0"
                />
                <span className="unit">km</span>
              </div>
            </label>
          )}

          {showsDifficulty && (
            <div className="field">
              <span className="field-label">Subjektivní náročnost</span>
              <div className="diff-grid" role="radiogroup">
                {difficultyOptions.map((opt) => {
                  const on = (form.perceived_difficulty || '') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`diff-btn ${on ? 'diff-btn--on' : ''}`}
                      onClick={() => setForm((c) => ({ ...c, perceived_difficulty: opt.id }))}
                      aria-pressed={on}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isSwimming && !isKmWorkout && !showsDifficulty && (
            <p className="no-extra">Pro tento typ aktivity nejsou potřeba doplňující parametry.</p>
          )}

          <label className="field">
            <span className="field-label">Poznámka <span className="optional">(nepovinné)</span></span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
              placeholder="Nohy, intervaly, regenerace, lehké tempo…"
            />
          </label>
        </section>
        </fieldset>

        {error && <p className="err-msg" role="alert">{error}</p>}
        {saving && (
          <div className="status-row" role="status" aria-live="polite">
            <span className="spinner" aria-hidden />
            <span>Ukládám záznam…</span>
          </div>
        )}
      </form>

      <style jsx>{`
        /* ── Layout ──────────────────────────────────────────────── */
        .wf {
          display: grid;
          gap: 12px;
        }
        .wf-lock {
          margin: 0;
          padding: 0;
          border: 0;
          min-width: 0;
          display: grid;
          gap: 12px;
        }
        .wf-lock:disabled {
          opacity: 0.62;
          cursor: wait;
        }

        /* ── Sekce ───────────────────────────────────────────────── */
        .ws {
          display: grid;
          gap: 18px;
          padding: 20px 22px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(8, 15, 31, 0.34);
        }
        .type-hero {
          position: relative;
          overflow: hidden;
          border-radius: 16px;
          border: 1px solid rgba(125, 211, 252, 0.26);
          padding: 14px 16px 16px;
          background-image:
            linear-gradient(160deg, rgba(2, 6, 23, 0.82), rgba(2, 6, 23, 0.58)),
            var(--hero-image);
          background-size: cover;
          background-position: center;
          box-shadow: 0 18px 34px rgba(2, 6, 23, 0.3);
        }
        .type-hero-badge {
          display: inline-flex;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 700;
          color: #e2e8f0;
          background: rgba(14, 116, 144, 0.38);
          border: 1px solid rgba(56, 189, 248, 0.44);
        }
        .type-hero h4 {
          margin: 8px 0 4px;
          font-size: 1.08rem;
          color: #f8fafc;
          letter-spacing: -0.01em;
        }
        .type-hero p {
          margin: 0;
          color: #cbd5e1;
          font-size: 0.86rem;
          line-height: 1.45;
          max-width: 60ch;
        }
        .ws-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: #f1f5f9;
          letter-spacing: -0.01em;
        }
        .hint {
          margin: -4px 0 2px;
          font-size: 0.84rem;
          color: #94a3b8;
        }

        /* ── Grid ────────────────────────────────────────────────── */
        .row-two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          align-items: start;
        }

        /* ── Field ───────────────────────────────────────────────── */
        .field {
          display: grid;
          gap: 8px;
        }
        .field--half {
          max-width: 280px;
        }
        .field-label {
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .optional {
          font-weight: 400;
          text-transform: none;
          letter-spacing: 0;
          color: #475569;
        }

        /* ── Inputs ──────────────────────────────────────────────── */
        .field :is(input[type="date"], input[type="number"], textarea),
        .input-narrow {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 14px;
          border-radius: 12px;
          border: 1px solid rgba(100, 116, 139, 0.22);
          background: rgba(15, 23, 42, 0.52);
          color: #f1f5f9;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .field :is(input, textarea):focus,
        .input-narrow:focus {
          border-color: rgba(148, 163, 184, 0.5);
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.08);
        }
        .field textarea {
          resize: vertical;
          min-height: 100px;
        }

        /* ── Duration row ────────────────────────────────────────── */
        .duration-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .input-narrow {
          width: 90px;
          flex-shrink: 0;
        }
        .quick-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .quick-btn {
          height: 38px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid rgba(100, 116, 139, 0.22);
          background: rgba(15, 23, 42, 0.5);
          color: #94a3b8;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .quick-btn--on {
          border-color: rgba(148, 163, 184, 0.45);
          background: rgba(30, 41, 59, 0.9);
          color: #e2e8f0;
        }
        .quick-btn:hover:not(.quick-btn--on) {
          border-color: rgba(100, 116, 139, 0.4);
          color: #cbd5e1;
        }

        /* ── Typ aktivity ────────────────────────────────────────── */
        .type-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .type-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 11px 8px;
          border-radius: 12px;
          border: 1px solid rgba(100, 116, 139, 0.18);
          background-image:
            linear-gradient(180deg, rgba(2, 6, 23, 0.86), rgba(2, 6, 23, 0.68)),
            var(--type-image);
          background-size: cover;
          background-position: center;
          color: #94a3b8;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          text-align: center;
          transition: transform 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s;
        }
        .type-btn--on {
          border-color: rgba(148, 163, 184, 0.5);
          background-image:
            linear-gradient(180deg, rgba(30, 41, 59, 0.66), rgba(30, 41, 59, 0.58)),
            var(--type-image);
          color: #f1f5f9;
          font-weight: 600;
          box-shadow: 0 12px 24px rgba(15, 23, 42, 0.28);
        }
        .type-btn:hover:not(.type-btn--on) {
          border-color: rgba(100, 116, 139, 0.35);
          color: #cbd5e1;
          transform: translateY(-1px);
        }
        .type-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #94a3b8;
          flex-shrink: 0;
        }

        /* ── Unit input ──────────────────────────────────────────── */
        .input-unit {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-unit input {
          padding-right: 46px;
        }
        .unit {
          position: absolute;
          right: 14px;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #475569;
          pointer-events: none;
        }

        /* ── Náročnost ───────────────────────────────────────────── */
        .diff-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
        }
        .diff-btn {
          padding: 12px 10px;
          border-radius: 12px;
          border: 1px solid rgba(100, 116, 139, 0.18);
          background: rgba(15, 23, 42, 0.45);
          color: #94a3b8;
          font-size: 0.84rem;
          font-weight: 500;
          cursor: pointer;
          text-align: center;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .diff-btn--on {
          border-color: rgba(148, 163, 184, 0.5);
          background: rgba(30, 41, 59, 0.9);
          color: #f1f5f9;
          font-weight: 600;
        }
        .diff-btn:hover:not(.diff-btn--on) {
          border-color: rgba(100, 116, 139, 0.35);
          color: #cbd5e1;
        }

        /* ── Footer ──────────────────────────────────────────────── */
        .footer-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .footer-saving {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          min-height: 46px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid rgba(100, 116, 139, 0.18);
          background: rgba(15, 23, 42, 0.5);
          color: #cbd5e1;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .btn-cancel {
          height: 44px;
          padding: 0 20px;
          border-radius: 9px;
          border: 1px solid rgba(100, 116, 139, 0.22);
          background: rgba(15, 23, 42, 0.22);
          color: #64748b;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .btn-cancel:hover:not(:disabled) {
          color: #94a3b8;
          border-color: rgba(100, 116, 139, 0.4);
        }
        .btn-save {
          height: 44px;
          padding: 0 22px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(30, 41, 59, 0.95);
          color: #e2e8f0;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .btn-save:hover:not(:disabled) {
          background: rgba(51, 65, 85, 0.95);
          border-color: rgba(148, 163, 184, 0.5);
          color: #f8fafc;
        }
        .btn-save--lg {
          min-width: 160px;
        }
        .btn-cancel:disabled,
        .btn-save:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        /* ── States ──────────────────────────────────────────────── */
        .no-extra {
          margin: 0;
          font-size: 0.875rem;
          color: #475569;
          line-height: 1.6;
        }
        .err-msg {
          margin: 0;
          padding: 13px 16px;
          border-radius: 9px;
          border: 1px solid rgba(248, 113, 113, 0.2);
          background: rgba(127, 29, 29, 0.18);
          color: #fca5a5;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .status-row {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(100, 116, 139, 0.16);
          color: #94a3b8;
          font-size: 0.875rem;
        }
        .spinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(100, 116, 139, 0.2);
          border-top-color: #94a3b8;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Responsive ──────────────────────────────────────────── */
        @media (max-width: 767px) {
          .ws {
            padding: 16px;
          }
          .row-two {
            grid-template-columns: 1fr;
          }
          .type-hero {
            padding: 12px 14px;
          }
          .type-hero h4 { font-size: 1rem; }
          .type-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
          .type-btn {
            min-height: 44px;
            padding: 12px 10px;
            font-size: 0.8rem;
            touch-action: manipulation;
          }
          .duration-row { gap: 12px; }
          .quick-btn {
            min-height: 44px;
            padding: 0 14px;
            touch-action: manipulation;
          }
          .diff-btn {
            min-height: 44px;
            touch-action: manipulation;
          }
          .footer-row {
            flex-direction: column-reverse;
            gap: 10px;
          }
          .footer-row button {
            width: 100%;
            min-height: 48px;
            touch-action: manipulation;
          }
          .btn-save--lg { min-width: 0; }
          .field--half {
            max-width: none;
          }
        }
        @media (max-width: 400px) {
          .type-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </FullscreenOverlay>
  );
}
