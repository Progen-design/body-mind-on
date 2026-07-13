import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function AddMeasurementModal({ accessToken, onClose, onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weightKg, setWeightKg] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [hipsCm, setHipsCm] = useState('');
  const [chestCm, setChestCm] = useState('');
  const [armCm, setArmCm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        measured_at: date ? new Date(`${date}T12:00:00`).toISOString() : new Date().toISOString(),
      };
      if (weightKg !== '') body.weight_kg = Number(weightKg);
      if (waistCm !== '') body.waist_cm = Number(waistCm);
      if (hipsCm !== '') body.hips_cm = Number(hipsCm);
      if (chestCm !== '') body.chest_cm = Number(chestCm);
      if (armCm !== '') body.arm_cm = Number(armCm);

      const res = await fetch('/api/body-measurements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Nepodařilo se uložit měření.');
        return;
      }
      onSaved?.();
    } catch (err) {
      setError('Nepodařilo se uložit měření.');
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div className="amm-overlay" onClick={onClose} role="presentation">
      <div className="amm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="amm-title">
        <h3 id="amm-title">Přidat měření</h3>
        <p className="amm-hint">Zadej datum a alespoň jednu hodnotu (kg / cm).</p>
        <form onSubmit={handleSubmit}>
          <label>
            Datum
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Hmotnost (kg)
            <input type="number" min={20} max={400} step={0.1} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="např. 75,5" />
          </label>
          <label>
            Obvod pasu (cm)
            <input type="number" min={20} max={300} step={0.1} value={waistCm} onChange={(e) => setWaistCm(e.target.value)} />
          </label>
          <label>
            Obvod boků (cm)
            <input type="number" min={20} max={300} step={0.1} value={hipsCm} onChange={(e) => setHipsCm(e.target.value)} />
          </label>
          <label>
            Obvod hrudníku (cm)
            <input type="number" min={20} max={300} step={0.1} value={chestCm} onChange={(e) => setChestCm(e.target.value)} />
          </label>
          <label>
            Obvod paže (cm)
            <input type="number" min={20} max={300} step={0.1} value={armCm} onChange={(e) => setArmCm(e.target.value)} />
          </label>
          {error && <p className="amm-error" role="alert">{error}</p>}
          <div className="amm-actions">
            <button type="button" onClick={onClose} disabled={saving}>Zrušit</button>
            <button type="submit" disabled={saving}>{saving ? 'Ukládám…' : 'Uložit měření'}</button>
          </div>
        </form>
        <style jsx>{`
          .amm-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.65);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10050;
            padding: 16px;
          }
          .amm-modal {
            width: 100%;
            max-width: 420px;
            background: #1a1228;
            border: 1px solid rgba(167, 139, 250, 0.3);
            border-radius: 14px;
            padding: 20px;
            color: #f5f3ff;
          }
          .amm-modal h3 { margin: 0 0 8px; }
          .amm-hint { margin: 0 0 16px; font-size: 0.9rem; color: #c4b5fd; }
          label {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 12px;
            font-size: 0.9rem;
          }
          input {
            border-radius: 8px;
            border: 1px solid rgba(167, 139, 250, 0.35);
            background: rgba(0, 0, 0, 0.25);
            color: #fff;
            padding: 8px 10px;
          }
          .amm-error { color: #fca5a5; font-size: 0.9rem; }
          .amm-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 8px;
          }
          .amm-actions button {
            border-radius: 8px;
            padding: 8px 14px;
            border: 1px solid rgba(167, 139, 250, 0.35);
            background: transparent;
            color: #e9d5ff;
            cursor: pointer;
          }
          .amm-actions button[type="submit"] {
            background: #7c3aed;
            border-color: #7c3aed;
            color: #fff;
          }
        `}</style>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
