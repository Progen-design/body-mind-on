import { useEffect, useRef } from 'react';
import FullscreenOverlay from './FullscreenOverlay';

const DISTANCE_KM_TYPES = ['beh', 'kolo', 'chuze', 'nordic_walking', 'brusleni', 'lyzovani'];
const DIFFICULTY_TYPES = ['silovy', 'kardio', 'ostatni'];
const QUICK_DURATION_OPTIONS = [30, 45, 60, 90];

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
      title="Zapsat trénink"
      subtitle="Přidej hotový trénink do profilu. Uložíme ho do přehledu a navážeme na něj další vyhodnocení."
      size="workout"
      headerActions={(
        <button
          type="button"
          className="workspace-primary-btn"
          onClick={() => formRef.current?.requestSubmit()}
          disabled={saving}
        >
          {saving ? 'Ukládám…' : 'Uložit'}
        </button>
      )}
      footer={(
        <div className="workspace-footer-actions">
          <button type="button" className="workspace-secondary-btn" onClick={onClose} disabled={saving}>
            Zrušit
          </button>
          <button
            type="button"
            className="workspace-primary-btn workspace-primary-btn--footer"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={saving}
          >
            {saving ? 'Ukládám trénink…' : 'Uložit trénink'}
          </button>
        </div>
      )}
    >
      <form ref={formRef} id="workout-overlay-form" className="workspace-form" onSubmit={onSubmit}>
        <section className="workspace-card">
          <div className="workspace-card-head">
            <span className="workspace-kicker">A. Základní info</span>
            <h3>Základní parametry</h3>
            <p>Nejdřív doplň datum, typ a délku. Zbytek formuláře se přizpůsobí podle typu aktivity.</p>
          </div>

          <div className="workspace-grid workspace-grid--two">
            <label className="field">
              <span className="field-label">Datum</span>
              <input
                ref={dateInputRef}
                type="date"
                value={form.workout_date}
                min={toLocalDateInputValue(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))}
                max={toLocalDateInputValue(new Date())}
                onChange={(event) => setForm((current) => ({ ...current, workout_date: event.target.value }))}
                required
              />
            </label>

            <div className="field">
              <span className="field-label">Typ tréninku</span>
              <div className="type-grid" role="group" aria-label="Typ tréninku">
                {workoutTypes.map((type) => {
                  const active = form.workout_type === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      className={`type-chip ${active ? 'type-chip--active' : ''}`}
                      onClick={() => setWorkoutType(type.id)}
                      aria-pressed={active}
                    >
                      <span aria-hidden>{type.emoji}</span>
                      <span>{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="workspace-grid workspace-grid--two">
            <label className="field">
              <span className="field-label">Délka (min)</span>
              <input
                type="number"
                min={1}
                value={form.duration_min}
                onChange={(event) => setForm((current) => ({ ...current, duration_min: Number(event.target.value) || 0 }))}
                required
              />
            </label>

            <div className="field">
              <span className="field-label">Rychlá volba</span>
              <div className="quick-chip-row">
                {QUICK_DURATION_OPTIONS.map((minutes) => {
                  const active = Number(form.duration_min) === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      className={`quick-chip ${active ? 'quick-chip--active' : ''}`}
                      onClick={() => setForm((current) => ({ ...current, duration_min: minutes }))}
                    >
                      {minutes} min
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="workspace-card">
          <div className="workspace-card-head">
            <span className="workspace-kicker">B. Detail podle typu</span>
            <h3>Doplň jen to, co dává smysl</h3>
            <p>Formulář zobrazuje jen relevantní pole, aby se přehledně zapisoval každý typ aktivity.</p>
          </div>

          {isSwimming ? (
            <label className="field field--narrow">
              <span className="field-label">Vzdálenost (m)</span>
              <input
                type="number"
                min={25}
                step={25}
                value={form.distance_m}
                onChange={(event) => setForm((current) => ({ ...current, distance_m: event.target.value }))}
                placeholder="např. 1000"
              />
            </label>
          ) : null}

          {isKmWorkout ? (
            <label className="field field--narrow">
              <span className="field-label">Vzdálenost (km)</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={form.distance_km}
                onChange={(event) => setForm((current) => ({ ...current, distance_km: event.target.value }))}
                placeholder="např. 5.5"
              />
            </label>
          ) : null}

          {showsDifficulty ? (
            <div className="field">
              <span className="field-label">Jak náročné to bylo?</span>
              <div className="difficulty-grid" role="radiogroup" aria-label="Náročnost tréninku">
                {difficultyOptions.map((option) => {
                  const checked = (form.perceived_difficulty || '') === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`difficulty-card ${checked ? 'difficulty-card--active' : ''}`}
                      onClick={() => setForm((current) => ({ ...current, perceived_difficulty: option.id }))}
                      aria-pressed={checked}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="workspace-note">
              Pro vybraný typ tréninku nejsou potřeba další pole. Stačí základní info a případná poznámka.
            </div>
          )}
        </section>

        <section className="workspace-card">
          <div className="workspace-card-head">
            <span className="workspace-kicker">C. Poznámka</span>
            <h3>Krátký kontext k tréninku</h3>
            <p>Poznámka je volitelná, ale pomůže při pozdějším vyhodnocení a doporučeních.</p>
          </div>

          <label className="field">
            <span className="field-label">Poznámka</span>
            <textarea
              rows={5}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="např. nohy, intervaly, lehké tempo, regenerace..."
            />
          </label>
        </section>

        {error ? <p className="workspace-error" role="alert">{error}</p> : null}
        {saving ? (
          <div className="workspace-status" role="status" aria-live="polite">
            <span className="workspace-spinner" aria-hidden />
            <span>Ukládám trénink a aktualizuji profil…</span>
          </div>
        ) : null}
      </form>

      <style jsx>{`
        .workspace-form {
          display: grid;
          gap: 20px;
        }
        .workspace-card {
          display: grid;
          gap: 20px;
          padding: 24px;
          border-radius: 24px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.76) 0%, rgba(15, 23, 42, 0.62) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }
        .workspace-card-head h3 {
          margin: 8px 0 0;
          font-size: 1.28rem;
          line-height: 1.2;
          color: #f8fafc;
        }
        .workspace-card-head p {
          margin: 10px 0 0;
          color: #94a3b8;
          line-height: 1.6;
        }
        .workspace-kicker {
          display: inline-flex;
          width: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(124, 58, 237, 0.14);
          color: #c4b5fd;
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .workspace-grid {
          display: grid;
          gap: 18px;
        }
        .workspace-grid--two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .field {
          display: grid;
          gap: 10px;
        }
        .field--narrow {
          max-width: 260px;
        }
        .field-label {
          font-size: 0.95rem;
          font-weight: 700;
          color: #e2e8f0;
        }
        .field :is(input, textarea) {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(2, 6, 23, 0.58);
          color: #f8fafc;
          padding: 15px 16px;
          font-size: 0.98rem;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .field :is(input, textarea):focus {
          border-color: rgba(96, 165, 250, 0.5);
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.14);
          background: rgba(2, 6, 23, 0.74);
        }
        .field textarea {
          resize: vertical;
          min-height: 132px;
        }
        .type-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .type-chip,
        .quick-chip,
        .difficulty-card,
        .workspace-secondary-btn,
        .workspace-primary-btn {
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.72);
          color: #e2e8f0;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        }
        .type-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 52px;
          padding: 10px 12px;
          border-radius: 16px;
          font-weight: 600;
        }
        .type-chip--active,
        .quick-chip--active,
        .difficulty-card--active {
          border-color: rgba(167, 139, 250, 0.55);
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.22), rgba(59, 130, 246, 0.16));
          box-shadow: 0 16px 30px rgba(15, 23, 42, 0.26);
          color: #ffffff;
        }
        .quick-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .quick-chip {
          min-height: 48px;
          padding: 0 16px;
          border-radius: 14px;
          font-weight: 700;
        }
        .difficulty-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .difficulty-card {
          min-height: 58px;
          padding: 14px 16px;
          border-radius: 18px;
          font-weight: 700;
        }
        .workspace-note {
          padding: 16px 18px;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px dashed rgba(148, 163, 184, 0.2);
          color: #94a3b8;
          line-height: 1.6;
        }
        .workspace-footer-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .workspace-secondary-btn,
        .workspace-primary-btn {
          min-height: 50px;
          padding: 0 18px;
          border-radius: 16px;
          font-size: 0.96rem;
          font-weight: 700;
        }
        .workspace-primary-btn {
          background: linear-gradient(135deg, #8b5cf6, #3b82f6);
          border-color: rgba(167, 139, 250, 0.45);
          color: #ffffff;
        }
        .workspace-primary-btn:hover:not(:disabled),
        .workspace-secondary-btn:hover:not(:disabled),
        .type-chip:hover,
        .quick-chip:hover,
        .difficulty-card:hover {
          transform: translateY(-1px);
        }
        .workspace-secondary-btn {
          min-width: 120px;
        }
        .workspace-primary-btn--footer {
          min-width: 190px;
        }
        .workspace-primary-btn:disabled,
        .workspace-secondary-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .workspace-error {
          margin: 0;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(248, 113, 113, 0.26);
          background: rgba(127, 29, 29, 0.24);
          color: #fecaca;
          line-height: 1.55;
        }
        .workspace-status {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.56);
          border: 1px solid rgba(148, 163, 184, 0.16);
          color: #cbd5e1;
        }
        .workspace-spinner {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid rgba(148, 163, 184, 0.2);
          border-top-color: #8b5cf6;
          animation: spin 0.85s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 767px) {
          .workspace-card {
            padding: 18px;
            border-radius: 20px;
          }
          .workspace-grid--two,
          .type-grid,
          .difficulty-grid {
            grid-template-columns: 1fr;
          }
          .workspace-footer-actions {
            flex-direction: column-reverse;
          }
          .workspace-footer-actions :global(button) {
            width: 100%;
          }
          .field--narrow {
            max-width: none;
          }
        }
      `}</style>
    </FullscreenOverlay>
  );
}
