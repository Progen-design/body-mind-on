import { useEffect, useRef } from 'react';
import FullscreenOverlay from './FullscreenOverlay';
import WorkoutDaySelector from './WorkoutDaySelector';
import HabitChipGrid from './HabitChipGrid';
import { getFrequencyDayRange } from '../../lib/preferenceConstants';
import { calculateAgeFromBirthDate } from '../../lib/bodyMetricsBirthDate';
import { SMART_SCALE_SETTINGS_CHOICES } from '../../lib/smartScalePreference';
import TrainingEnvironmentFields from '../TrainingEnvironmentFields';

export default function PreferencesOverlay({
  open,
  onClose,
  onSubmit,
  form,
  setForm,
  error,
  saving,
  workoutDayLabels,
}) {
  const formRef = useRef(null);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const saveDisabled = saving || form.selected_habits.length === 0;
  const dayRange = getFrequencyDayRange(form.freq_choice || form.frequency);
  const dayCount = Array.isArray(form.workout_days) ? form.workout_days.length : 0;
  const computedAge = form.birth_date ? calculateAgeFromBirthDate(form.birth_date) : null;

  return (
    <FullscreenOverlay
      open={open}
      onClose={onClose}
      canClose={!saving}
      title="Upravit preference"
      subtitle="Tahle nastavení ovlivní tvůj další plán a doporučení."
      size="large"
      brandedBg
      footer={(
        <div className="prefs-footer-actions">
          <button type="button" className="prefs-secondary-btn" onClick={onClose} disabled={saving}>
            Zrušit
          </button>
          <button
            type="button"
            className="prefs-primary-btn prefs-primary-btn--footer"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={saveDisabled}
          >
            {saving ? 'Ukládám změny…' : 'Uložit změny'}
          </button>
        </div>
      )}
    >
      <form ref={formRef} className="prefs-form" onSubmit={onSubmit}>
        <section className="prefs-intro-card">
          <div>
            <span className="prefs-intro-badge">AI personalization workspace</span>
            <h3>Upravuješ vstupy pro další regeneraci doporučení</h3>
            <p>
              Tady neměníš jen kosmetická nastavení. Tyto hodnoty se zapisují do profilu, aktualizují návyky
              a mohou rovnou spustit další rozhodování a úpravu plánu.
            </p>
          </div>
        </section>

        <section className="prefs-section-card">
          <div className="prefs-section-head">
            <span className="prefs-kicker">Tělesné údaje</span>
            <h3>Váha, výška a datum narození</h3>
            <p>Věk dopočítáme automaticky podle data narození.</p>
          </div>

          <div className="prefs-grid prefs-grid--three">
            <label className="prefs-field">
              <span className="prefs-label">Aktuální váha (kg)</span>
              <input
                type="number"
                min={30}
                max={250}
                step={0.1}
                placeholder="např. 75"
                value={form.weight_kg ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, weight_kg: event.target.value }))}
              />
            </label>

            <label className="prefs-field">
              <span className="prefs-label">Výška (cm)</span>
              <input
                type="number"
                min={120}
                max={230}
                step={1}
                placeholder="např. 175"
                value={form.height_cm ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, height_cm: event.target.value }))}
              />
            </label>

            <label className="prefs-field">
              <span className="prefs-label">Datum narození</span>
              <input
                type="date"
                value={form.birth_date ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, birth_date: event.target.value }))}
              />
            </label>
          </div>

          {computedAge != null ? (
            <p className="prefs-age-hint" role="status">Věk: <strong>{computedAge} let</strong> (dopočítáno z data narození)</p>
          ) : null}
        </section>

        <section className="prefs-section-card">
          <div className="prefs-section-head">
            <span className="prefs-kicker">Chytrá váha</span>
            <h3>Sledování tělesného vývoje</h3>
            <p>Withings je volitelný modul. Pokud ho nepoužíváš, sekce Tělesný vývoj zůstane skrytá.</p>
          </div>
          <div className="prefs-smart-scale-options" role="radiogroup" aria-label="Chytrá váha">
            {SMART_SCALE_SETTINGS_CHOICES.map(({ value, label }) => (
              <label key={value} className="prefs-smart-scale-option">
                <input
                  type="radio"
                  name="smart_scale_choice"
                  value={value}
                  checked={(form.smart_scale_choice || 'none') === value}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, smart_scale_choice: event.target.value }))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {form.smart_scale_choice === 'withings' ? (
            <p className="prefs-smart-scale-hint">Po uložení uvidíš v profilu sekci Tělesný vývoj s tlačítkem Připojit Withings.</p>
          ) : null}
        </section>

        <section className="prefs-section-card">
          <div className="prefs-section-head">
            <span className="prefs-kicker">1. Režim a zátěž</span>
            <h3>Jak teď vypadá tvoje realita</h3>
          </div>

          <div className="prefs-grid prefs-grid--three">
            <label className="prefs-field">
              <span className="prefs-label">Úroveň aktivity</span>
              <select
                ref={firstFieldRef}
                value={form.activity}
                onChange={(event) => setForm((current) => ({ ...current, activity: event.target.value }))}
              >
                <option value="">Vyber</option>
                <option value="Nízká">Nízká</option>
                <option value="Střední">Střední</option>
                <option value="Vysoká">Vysoká</option>
              </select>
            </label>

            <label className="prefs-field">
              <span className="prefs-label">Míra stresu</span>
              <select
                value={form.stress_level}
                onChange={(event) => setForm((current) => ({ ...current, stress_level: event.target.value }))}
              >
                <option value="">Vyber</option>
                <option value="low">Nízká</option>
                <option value="medium">Střední</option>
                <option value="high">Vysoká</option>
              </select>
            </label>

            <label className="prefs-field">
              <span className="prefs-label">Typ práce</span>
              <select
                value={form.occupation}
                onChange={(event) => setForm((current) => ({ ...current, occupation: event.target.value }))}
              >
                <option value="">Vyber</option>
                <option value="Sedavé zaměstnání">Sedavé zaměstnání</option>
                <option value="Aktivní zaměstnání">Aktivní zaměstnání</option>
                <option value="Kombinované">Kombinované</option>
              </select>
            </label>
          </div>
        </section>

        <section className="prefs-section-card">
          <div className="prefs-section-head">
            <span className="prefs-kicker">2. Cíl a trénink</span>
            <h3>Kam chceš mířit a jak často zvládneš cvičit</h3>
          </div>

          <div className="prefs-grid prefs-grid--two">
            <label className="prefs-field">
              <span className="prefs-label">Cíl</span>
              <select
                value={form.goal}
                onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))}
              >
                <option value="">Vyber</option>
                <option value="Redukce hmotnosti">Redukce hmotnosti</option>
                <option value="Nárůst svalů">Nárůst svalů</option>
                <option value="Zdravý životní styl">Zdravý životní styl</option>
              </select>
            </label>

            <label className="prefs-field">
              <span className="prefs-label">Frekvence cvičení</span>
              <select
                value={form.freq_choice || form.frequency}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    freq_choice: event.target.value,
                    frequency: event.target.value,
                    workout_days: Array.isArray(current.workout_days)
                      ? current.workout_days.slice(0, getFrequencyDayRange(event.target.value).max)
                      : [],
                  }))
                }
              >
                <option value="">Vyber</option>
                <option value="1-2x týdně">1-2x týdně</option>
                <option value="2-3x týdně">2-3x týdně</option>
                <option value="4-5x týdně">4-5x týdně</option>
              </select>
            </label>
          </div>

          <TrainingEnvironmentFields
            variant="preferences"
            trainingEnvironment={form.training_environment || ''}
            availableEquipment={Array.isArray(form.available_equipment) ? form.available_equipment : []}
            disabled={saving}
            showErrors={!form.training_environment}
            onTrainingEnvironmentChange={(value) =>
              setForm((current) => ({
                ...current,
                training_environment: value,
                available_equipment: value === 'home_equipment' ? (current.available_equipment || []) : [],
              }))
            }
            onAvailableEquipmentChange={(equipment) =>
              setForm((current) => ({ ...current, available_equipment: equipment }))
            }
          />

          <div className="prefs-block">
            <div className="prefs-block-head">
              <span className="prefs-label">Preferované dny tréninku</span>
              <p>Vyber dny, kdy je realistické mít v plánu hlavní trénink nebo řízený pohyb.</p>
                {dayRange?.normalized ? (
                  <p className="prefs-day-rule">
                    Pro frekvenci <strong>{dayRange.normalized}</strong> je potřeba vybrat {dayRange.min}-{dayRange.max} dní
                    (aktuálně {dayCount}).
                  </p>
                ) : null}
            </div>
            <WorkoutDaySelector
              value={form.workout_days}
              labels={workoutDayLabels}
              onChange={(days) => setForm((current) => ({ ...current, workout_days: days }))}
                maxSelections={dayRange?.max || 7}
                disabled={saving}
            />
          </div>
        </section>

        <section className="prefs-section-card">
          <div className="prefs-section-head">
            <span className="prefs-kicker">3. Strava</span>
            <h3>Omezení a preference pro jídelníček</h3>
          </div>

          <div className="prefs-grid prefs-grid--two">
            <label className="prefs-field">
              <span className="prefs-label">Typ stravy</span>
              <select
                value={form.diet_type}
                onChange={(event) => setForm((current) => ({ ...current, diet_type: event.target.value }))}
              >
                <option value="">Žádná preference</option>
                <option value="vegetarian">Vegetarián</option>
                <option value="vegan">Vegan</option>
                <option value="gluten_free">Bez lepku</option>
                <option value="lactose_free">Bez laktózy</option>
                <option value="paleo">Paleo</option>
                <option value="low_carb">Nízkosacharidová</option>
                <option value="other">Jiné</option>
              </select>
            </label>
          </div>

          <div className="prefs-grid prefs-grid--two">
            <label className="prefs-field">
              <span className="prefs-label">Zdravotní omezení – alergie, intolerance</span>
              <textarea
                rows={4}
                placeholder="např. ořechy, mléko, lepek – kvůli bezpečnosti jídelníčku"
                value={form.dietary_restrictions}
                onChange={(event) => setForm((current) => ({ ...current, dietary_restrictions: event.target.value }))}
              />
              <span className="prefs-hint">Důležité pro zdraví; do plánu nepatří potraviny, které ti škodí.</span>
            </label>

            <label className="prefs-field">
              <span className="prefs-label">Potraviny, které nechceš v plánu – chuť, zvyk</span>
              <textarea
                rows={4}
                placeholder="např. brokolice, avokádo – co neješ, i když nejsi alergický/á"
                value={form.foods_to_avoid}
                onChange={(event) => setForm((current) => ({ ...current, foods_to_avoid: event.target.value }))}
              />
              <span className="prefs-hint">Úprava jen podle preferencí, ne jako lékařské omezení.</span>
            </label>
          </div>
        </section>

        <section className="prefs-section-card">
          <div className="prefs-section-head">
            <span className="prefs-kicker">4. Návyky</span>
            <h3>Co chceš sledovat v každodenním fungování</h3>
          </div>

          <HabitChipGrid
            selectedIds={form.selected_habits}
            onChange={(ids) => setForm((current) => ({ ...current, selected_habits: ids }))}
          />
        </section>

        {error ? <p className="prefs-error" role="alert">{error}</p> : null}
        {saving ? (
          <div className="prefs-status" role="status" aria-live="polite">
            <span className="prefs-spinner" aria-hidden />
            <span>Ukládám preference a připravuji další aktualizaci plánu…</span>
          </div>
        ) : null}
      </form>

      <style jsx>{`
        .prefs-form {
          display: grid;
          gap: 22px;
        }
        .prefs-intro-card,
        .prefs-section-card {
          padding: 24px;
          border-radius: 24px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.76) 0%, rgba(15, 23, 42, 0.58) 100%);
        }
        .prefs-intro-badge,
        .prefs-kicker {
          display: inline-flex;
          width: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .prefs-intro-badge {
          background: rgba(14, 165, 233, 0.14);
          color: #7dd3fc;
        }
        .prefs-kicker {
          background: rgba(124, 58, 237, 0.14);
          color: #c4b5fd;
        }
        .prefs-intro-card h3,
        .prefs-section-head h3 {
          margin: 10px 0 0;
          font-size: 1.32rem;
          color: #f8fafc;
          line-height: 1.2;
        }
        .prefs-intro-card p,
        .prefs-section-head p,
        .prefs-block-head p {
          margin: 10px 0 0;
          color: #94a3b8;
          line-height: 1.6;
        }
        .prefs-section-card {
          display: grid;
          gap: 22px;
        }
        .prefs-grid {
          display: grid;
          gap: 18px;
        }
        .prefs-grid--three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .prefs-grid--two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .prefs-field {
          display: grid;
          gap: 10px;
        }
        .prefs-label {
          font-size: 0.95rem;
          font-weight: 700;
          color: #e2e8f0;
        }
        .prefs-hint {
          font-size: 0.8rem;
          font-weight: 400;
          color: #94a3b8;
          line-height: 1.45;
          margin-top: -4px;
        }
        .prefs-age-hint {
          margin: 4px 0 0;
          color: #94a3b8;
          font-size: 0.92rem;
        }
        .prefs-age-hint strong {
          color: #e2e8f0;
        }
        .prefs-smart-scale-options {
          display: grid;
          gap: 10px;
        }
        .prefs-smart-scale-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.55);
          cursor: pointer;
        }
        .prefs-smart-scale-option input {
          width: 18px;
          height: 18px;
          accent-color: #7c3aed;
        }
        .prefs-smart-scale-hint {
          margin: 12px 0 0;
          font-size: 0.88rem;
          color: #93c5fd;
          line-height: 1.45;
        }
        .prefs-field :is(select, textarea, input[type="number"], input[type="date"]) {
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
        .prefs-field :is(select, textarea, input[type="number"], input[type="date"]):focus {
          border-color: rgba(96, 165, 250, 0.5);
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.14);
          background: rgba(2, 6, 23, 0.74);
        }
        .prefs-field textarea {
          resize: vertical;
          min-height: 118px;
        }
        .prefs-block {
          display: grid;
          gap: 14px;
        }
        .prefs-day-rule {
          margin-top: 8px;
          color: #a5b4fc;
          font-size: 0.9rem;
        }
        .prefs-footer-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .prefs-secondary-btn,
        .prefs-primary-btn {
          min-height: 50px;
          padding: 0 18px;
          border-radius: 16px;
          font-size: 0.96rem;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
        }
        .prefs-secondary-btn {
          min-width: 120px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.72);
          color: #e2e8f0;
        }
        .prefs-primary-btn {
          border: 1px solid rgba(96, 165, 250, 0.34);
          background: linear-gradient(135deg, #8b5cf6, #3b82f6);
          color: #ffffff;
        }
        .prefs-primary-btn--footer {
          min-width: 190px;
        }
        .prefs-secondary-btn:hover:not(:disabled),
        .prefs-primary-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        .prefs-secondary-btn:disabled,
        .prefs-primary-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .prefs-error {
          margin: 0;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(248, 113, 113, 0.26);
          background: rgba(127, 29, 29, 0.24);
          color: #fecaca;
          line-height: 1.55;
        }
        .prefs-status {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.56);
          border: 1px solid rgba(148, 163, 184, 0.16);
          color: #cbd5e1;
        }
        .prefs-spinner {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid rgba(148, 163, 184, 0.2);
          border-top-color: #60a5fa;
          animation: spin 0.85s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 767px) {
          .prefs-form {
            gap: 20px;
            padding-bottom: 32px;
          }
          .prefs-intro-card,
          .prefs-section-card {
            padding: 18px 16px;
            border-radius: 20px;
          }
          .prefs-section-card {
            gap: 18px;
          }
          .prefs-section-head h3 {
            font-size: 1.2rem;
          }
          .prefs-grid--three,
          .prefs-grid--two {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .prefs-field {
            gap: 8px;
          }
          .prefs-field :is(select, textarea) {
            min-height: 48px;
            padding: 14px 16px;
            touch-action: manipulation;
          }
          .prefs-footer-actions {
            flex-direction: column-reverse;
            gap: 12px;
          }
          .prefs-footer-actions :global(button) {
            width: 100%;
            min-height: 50px;
            touch-action: manipulation;
          }
          .prefs-primary-btn:not(.prefs-primary-btn--footer) {
            min-height: 44px;
            padding: 10px 18px;
          }
        }
      `}</style>
    </FullscreenOverlay>
  );
}
