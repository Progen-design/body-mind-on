import { SMART_SCALE_CHOICES } from '../lib/smartScalePreference';

/**
 * Otázka „Používáte chytrou váhu?“ pro registraci (krok 2).
 */
export default function SmartScaleChoiceField({
  value = 'none',
  onChange,
  disabled = false,
  name = 'smart_scale_choice',
  className = '',
}) {
  return (
    <div className={`smart-scale-choice ${className}`.trim()}>
      <label className="reg-label">Používáte chytrou váhu?</label>
      <p className="smart-scale-hint">Withings je volitelný — můžeš ho připojit později v profilu.</p>
      <div className="reg-training-env" role="radiogroup" aria-label="Používáte chytrou váhu?">
        {SMART_SCALE_CHOICES.map(({ value: optionValue, label }) => (
          <label key={optionValue} className="reg-training-env-option">
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              disabled={disabled}
              onChange={onChange}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <style jsx>{`
        .smart-scale-choice {
          grid-column: 1 / -1;
        }
        .smart-scale-hint {
          margin: 4px 0 10px;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
