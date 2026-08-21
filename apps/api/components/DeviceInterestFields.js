import { DEVICE_OPTIONS } from '../lib/registrationDevices';

/**
 * Optional multi-select: user interest in smart devices at registration.
 * No OAuth — connect later in profile.
 */
export default function DeviceInterestFields({
  value = [],
  onChange,
  disabled = false,
}) {
  const selected = Array.isArray(value) ? value : [];

  function toggle(deviceValue) {
    if (disabled || typeof onChange !== 'function') return;
    const next = selected.includes(deviceValue)
      ? selected.filter((v) => v !== deviceValue)
      : [...selected, deviceValue];
    onChange(next);
  }

  return (
    <fieldset className="device-interest" disabled={disabled}>
      {/* copy-check:whitelist:start */}
      <legend className="reg-label">Chytrá zařízení (nepovinné)</legend>
      <p className="device-interest-hint">
        Máš chytrou váhu nebo hodinky? Můžeme z nich brát data automaticky,
        ať nemusíš nic zapisovat ručně. Není to podmínka — appka funguje i bez nich.
      </p>
      <p className="device-interest-hint device-interest-hint--secondary">
        Teď umíme napojit váhu Withings a Apple Watch.
        Další zařízení přidáváme — dej nám vědět, co používáš.
      </p>
      {/* copy-check:whitelist:end */}
      <div className="device-interest-options" role="group" aria-label="Chytrá zařízení">
        {DEVICE_OPTIONS.map(({ value: optionValue, label }) => (
          <label key={optionValue} className="device-interest-option">
            <input
              type="checkbox"
              name="devices"
              value={optionValue}
              checked={selected.includes(optionValue)}
              disabled={disabled}
              onChange={() => toggle(optionValue)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <style jsx>{`
        .device-interest {
          grid-column: 1 / -1;
          margin: 0;
          padding: 0;
          border: none;
          min-width: 0;
        }
        .device-interest-hint {
          margin: 4px 0 12px;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.45;
        }
        .device-interest-hint--secondary {
          margin-top: -4px;
        }
        .device-interest-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .device-interest-option {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.35);
          color: #e2e8f0;
          font-size: 14px;
          line-height: 1.4;
          cursor: pointer;
        }
        .device-interest-option input {
          margin-top: 2px;
          flex-shrink: 0;
        }
        .device-interest-option:has(input:checked) {
          border-color: rgba(56, 189, 248, 0.55);
          background: rgba(14, 165, 233, 0.12);
        }
      `}</style>
    </fieldset>
  );
}
