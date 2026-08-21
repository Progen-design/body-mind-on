import {
  TRAINING_ENVIRONMENT_OPTIONS,
  EQUIPMENT_OPTIONS,
} from '../lib/trainingEnvironment';

/**
 * „Kde budeš nejčastěji cvičit?“ — registrace i Nastavení profilu.
 */
export default function TrainingEnvironmentFields({
  trainingEnvironment = '',
  availableEquipment = [],
  trainingEnvironmentDetail = '',
  onTrainingEnvironmentChange,
  onAvailableEquipmentChange,
  onTrainingEnvironmentDetailChange,
  disabled = false,
  variant = 'registration',
  showErrors = false,
}) {
  const isPrefs = variant === 'preferences';
  const detailValue = typeof trainingEnvironmentDetail === 'string' ? trainingEnvironmentDetail : '';
  const detailMissing = trainingEnvironment === 'other' && !detailValue.trim();

  const handleEnvChange = (event) => {
    const value = event.target.value;
    if (typeof onTrainingEnvironmentChange === 'function') {
      onTrainingEnvironmentChange(value);
    }
    if (value !== 'home_equipment' && typeof onAvailableEquipmentChange === 'function') {
      onAvailableEquipmentChange([]);
    }
    if (value !== 'other' && typeof onTrainingEnvironmentDetailChange === 'function') {
      onTrainingEnvironmentDetailChange('');
    }
  };

  const toggleEquipment = (value, checked) => {
    if (typeof onAvailableEquipmentChange !== 'function') return;
    const current = Array.isArray(availableEquipment) ? availableEquipment : [];
    const next = checked
      ? [...current, value]
      : current.filter((item) => item !== value);
    onAvailableEquipmentChange(next);
  };

  return (
    <div className={`training-env-fields ${isPrefs ? 'training-env-fields--prefs' : ''}`.trim()}>
      <div className="training-env-head">
        <span className={isPrefs ? 'prefs-label' : 'step3-label'}>Kde budeš nejčastěji cvičit?</span>
        <p className={isPrefs ? 'prefs-hint' : 'step3-hint'}>
          Podle prostředí přizpůsobíme cviky v plánu (posilovna / doma).
        </p>
      </div>
      <div className={isPrefs ? 'prefs-smart-scale-options' : 'reg-training-env'} role="radiogroup" aria-label="Kde budeš nejčastěji cvičit?">
        {TRAINING_ENVIRONMENT_OPTIONS.map(({ value, label }) => (
          <label key={value} className={isPrefs ? 'prefs-smart-scale-option' : 'reg-training-env-option'}>
            <input
              type="radio"
              name="training_environment"
              value={value}
              checked={trainingEnvironment === value}
              disabled={disabled}
              onChange={handleEnvChange}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {showErrors && !trainingEnvironment ? (
        <p className={isPrefs ? 'prefs-error-inline' : 'step3-hint step3-hint-error'} role="alert">
          Vyber prostředí tréninku.
        </p>
      ) : null}

      {trainingEnvironment === 'home_equipment' ? (
        <div className="training-env-equipment">
          <span className={isPrefs ? 'prefs-label' : 'step3-label'}>Jaké pomůcky máš doma?</span>
          <div className={isPrefs ? 'prefs-equipment-grid' : 'reg-workout-days'}>
            {EQUIPMENT_OPTIONS.map(({ value, label }) => (
              <label key={value} className={isPrefs ? 'prefs-equipment-option' : 'reg-workout-day-check'}>
                <input
                  type="checkbox"
                  checked={Array.isArray(availableEquipment) && availableEquipment.includes(value)}
                  disabled={disabled}
                  onChange={(event) => toggleEquipment(value, event.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {trainingEnvironment === 'other' ? (
        <div className="training-env-other">
          <label className={isPrefs ? 'prefs-label' : 'step3-label'} htmlFor="training_environment_detail">
            Popiš prostředí
          </label>
          <textarea
            id="training_environment_detail"
            name="training_environment_detail"
            className={isPrefs ? 'prefs-textarea' : 'reg-textarea'}
            rows={3}
            maxLength={280}
            disabled={disabled}
            value={detailValue}
            placeholder="Napiš kde a s čím (např. venku, bazén, v práci s gumami)"
            onChange={(event) => {
              if (typeof onTrainingEnvironmentDetailChange === 'function') {
                onTrainingEnvironmentDetailChange(event.target.value);
              }
            }}
          />
          {showErrors && detailMissing ? (
            <p className={isPrefs ? 'prefs-error-inline' : 'step3-hint step3-hint-error'} role="alert">
              Napiš, kde a s čím budeš cvičit.
            </p>
          ) : null}
        </div>
      ) : null}

      <style jsx>{`
        .training-env-fields {
          display: grid;
          gap: 10px;
        }
        .training-env-fields--prefs {
          margin-top: 18px;
        }
        .training-env-head {
          display: grid;
          gap: 6px;
        }
        .training-env-equipment,
        .training-env-other {
          display: grid;
          gap: 10px;
          margin-top: 4px;
        }
        .prefs-equipment-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .prefs-equipment-option {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.45);
          cursor: pointer;
        }
        .prefs-equipment-option input {
          width: 16px;
          height: 16px;
          accent-color: #7c3aed;
        }
        .prefs-error-inline {
          margin: 0;
          color: #f87171;
          font-size: 0.88rem;
        }
        .reg-textarea,
        .prefs-textarea {
          width: 100%;
          box-sizing: border-box;
          resize: vertical;
          min-height: 72px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.45);
          color: #e2e8f0;
          font: inherit;
          line-height: 1.45;
        }
        .reg-textarea::placeholder,
        .prefs-textarea::placeholder {
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
