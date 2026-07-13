import { useCallback, useMemo, useState } from 'react';
import {
  MUSCLE_GROUP_IDS,
  MUSCLE_GROUP_LABELS_CS,
  MAX_SPECIFIC_MUSCLE_GROUPS,
  normalizeMuscleGroupSelection,
} from '../../lib/muscleGroupLabels';

const CHIP_IDS = MUSCLE_GROUP_IDS.filter((id) => id !== 'full_body');

/** Jednoduché SVG — klikatelné oblasti + chips se synchronním stavem. */
function MuscleBodyMap({ selected, onToggle, view = 'front' }) {
  const isSelected = (id) => selected.includes(id);
  const fill = (id) => (isSelected(id) ? '#38bdf8' : '#334155');
  const opacity = (id) => (isSelected(id) ? 0.85 : 0.35);

  const regions = view === 'front' ? (
    <>
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.chest} cx="100" cy="72" rx="28" ry="18" fill={fill('chest')} fillOpacity={opacity('chest')} onClick={() => onToggle('chest')} onKeyDown={(e) => e.key === 'Enter' && onToggle('chest')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.shoulders} cx="62" cy="68" rx="14" ry="10" fill={fill('shoulders')} fillOpacity={opacity('shoulders')} onClick={() => onToggle('shoulders')} onKeyDown={(e) => e.key === 'Enter' && onToggle('shoulders')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.shoulders} cx="138" cy="68" rx="14" ry="10" fill={fill('shoulders')} fillOpacity={opacity('shoulders')} onClick={() => onToggle('shoulders')} onKeyDown={(e) => e.key === 'Enter' && onToggle('shoulders')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.biceps} cx="48" cy="95" rx="12" ry="22" fill={fill('biceps')} fillOpacity={opacity('biceps')} onClick={() => onToggle('biceps')} onKeyDown={(e) => e.key === 'Enter' && onToggle('biceps')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.biceps} cx="152" cy="95" rx="12" ry="22" fill={fill('biceps')} fillOpacity={opacity('biceps')} onClick={() => onToggle('biceps')} onKeyDown={(e) => e.key === 'Enter' && onToggle('biceps')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.core} cx="100" cy="118" rx="22" ry="16" fill={fill('core')} fillOpacity={opacity('core')} onClick={() => onToggle('core')} onKeyDown={(e) => e.key === 'Enter' && onToggle('core')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.quads} cx="82" cy="165" rx="14" ry="32" fill={fill('quads')} fillOpacity={opacity('quads')} onClick={() => onToggle('quads')} onKeyDown={(e) => e.key === 'Enter' && onToggle('quads')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.quads} cx="118" cy="165" rx="14" ry="32" fill={fill('quads')} fillOpacity={opacity('quads')} onClick={() => onToggle('quads')} onKeyDown={(e) => e.key === 'Enter' && onToggle('quads')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.calves} cx="82" cy="218" rx="10" ry="22" fill={fill('calves')} fillOpacity={opacity('calves')} onClick={() => onToggle('calves')} onKeyDown={(e) => e.key === 'Enter' && onToggle('calves')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.calves} cx="118" cy="218" rx="10" ry="22" fill={fill('calves')} fillOpacity={opacity('calves')} onClick={() => onToggle('calves')} onKeyDown={(e) => e.key === 'Enter' && onToggle('calves')} />
    </>
  ) : (
    <>
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.back} cx="100" cy="85" rx="30" ry="28" fill={fill('back')} fillOpacity={opacity('back')} onClick={() => onToggle('back')} onKeyDown={(e) => e.key === 'Enter' && onToggle('back')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.triceps} cx="48" cy="95" rx="12" ry="22" fill={fill('triceps')} fillOpacity={opacity('triceps')} onClick={() => onToggle('triceps')} onKeyDown={(e) => e.key === 'Enter' && onToggle('triceps')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.triceps} cx="152" cy="95" rx="12" ry="22" fill={fill('triceps')} fillOpacity={opacity('triceps')} onClick={() => onToggle('triceps')} onKeyDown={(e) => e.key === 'Enter' && onToggle('triceps')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.glutes} cx="100" cy="138" rx="26" ry="16" fill={fill('glutes')} fillOpacity={opacity('glutes')} onClick={() => onToggle('glutes')} onKeyDown={(e) => e.key === 'Enter' && onToggle('glutes')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.hamstrings} cx="82" cy="175" rx="14" ry="28" fill={fill('hamstrings')} fillOpacity={opacity('hamstrings')} onClick={() => onToggle('hamstrings')} onKeyDown={(e) => e.key === 'Enter' && onToggle('hamstrings')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.hamstrings} cx="118" cy="175" rx="14" ry="28" fill={fill('hamstrings')} fillOpacity={opacity('hamstrings')} onClick={() => onToggle('hamstrings')} onKeyDown={(e) => e.key === 'Enter' && onToggle('hamstrings')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.calves} cx="82" cy="218" rx="10" ry="22" fill={fill('calves')} fillOpacity={opacity('calves')} onClick={() => onToggle('calves')} onKeyDown={(e) => e.key === 'Enter' && onToggle('calves')} />
      <ellipse role="button" tabIndex={0} aria-label={MUSCLE_GROUP_LABELS_CS.calves} cx="118" cy="218" rx="10" ry="22" fill={fill('calves')} fillOpacity={opacity('calves')} onClick={() => onToggle('calves')} onKeyDown={(e) => e.key === 'Enter' && onToggle('calves')} />
    </>
  );

  return (
    <svg viewBox="0 0 200 260" className="muscle-body-svg" aria-hidden="false" role="img">
      <title>Výběr partie — {view === 'front' ? 'zepředu' : 'zezadu'}</title>
      <ellipse cx="100" cy="42" rx="18" ry="22" fill="#475569" fillOpacity="0.5" />
      <rect x="78" y="58" width="44" height="12" rx="6" fill="#475569" fillOpacity="0.4" />
      {regions}
    </svg>
  );
}

const LOCATION_OPTS = [
  { id: 'home', label: 'Doma' },
  { id: 'gym', label: 'Fitness centrum' },
  { id: 'no_equipment', label: 'Bez vybavení' },
];
const DURATION_OPTS = [15, 30, 45, 60];
const INTENSITY_OPTS = [
  { id: 'light', label: 'Lehký' },
  { id: 'medium', label: 'Střední' },
  { id: 'hard', label: 'Náročný' },
];

/**
 * Modal / bottom sheet pro změnu dnešního tréninku.
 */
export default function WorkoutChangeModal({
  open,
  onClose,
  planId,
  planDayIndex,
  defaultLocation = 'gym',
  defaultDuration = 30,
  defaultIntensity = 'medium',
  onPlanUpdated,
  onEvent,
}) {
  const [view, setView] = useState('front');
  const [selected, setSelected] = useState(['full_body']);
  const [location, setLocation] = useState(defaultLocation);
  const [duration, setDuration] = useState(defaultDuration);
  const [intensity, setIntensity] = useState(defaultIntensity);
  const [step, setStep] = useState('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [regenLeft, setRegenLeft] = useState(2);

  const toggleMuscle = useCallback((id) => {
    setSelected((prev) => {
      if (id === 'full_body') return ['full_body'];
      const withoutFull = prev.filter((x) => x !== 'full_body');
      if (withoutFull.includes(id)) return withoutFull.filter((x) => x !== id);
      if (withoutFull.length >= MAX_SPECIFIC_MUSCLE_GROUPS) return withoutFull;
      return [...withoutFull, id];
    });
  }, []);

  const selectionValid = useMemo(() => normalizeMuscleGroupSelection(selected).ok, [selected]);

  const reset = () => {
    setStep('select');
    setPreview(null);
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const generate = async (isRegen = false) => {
    if (!selectionValid || loading) return;
    setLoading(true);
    setError(null);
    onEvent?.(isRegen ? 'workout_alternative_regenerated' : 'workout_change_preferences_selected');
    try {
      const { supabase } = await import('../../lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Přihlas se prosím znovu.');
      const res = await fetch('/api/workout/replace-today', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planId,
          plan_day_index: planDayIndex,
          selected_muscle_groups: selected,
          location,
          duration_minutes: duration,
          intensity,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Alternativu se nepodařilo vytvořit.');
      setPreview(data);
      setStep('preview');
      if (typeof data.generation_attempt === 'number') {
        setRegenLeft(Math.max(0, 2 - data.generation_attempt));
      } else {
        setRegenLeft((n) => Math.max(0, n - 1));
      }
    } catch (e) {
      setError(e.message || 'Alternativu se nepodařilo vytvořit.');
      onEvent?.('workout_change_failed');
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview?.replacement_id || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { supabase } = await import('../../lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Přihlas se prosím znovu.');
      const res = await fetch('/api/workout/confirm-replacement', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replacement_id: preview.replacement_id,
          plan_id: planId,
          plan_day_index: planDayIndex,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Nepodařilo uložit trénink.');
      onPlanUpdated?.(data);
      onEvent?.('workout_alternative_confirmed');
      handleClose();
    } catch (e) {
      setError(e.message || 'Nepodařilo uložit trénink.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="wcm-overlay" role="dialog" aria-modal="true" aria-labelledby="wcm-title">
      <div className="wcm-sheet">
        <button type="button" className="wcm-close" onClick={handleClose} aria-label="Zavřít">×</button>
        {step === 'select' ? (
          <>
            <h2 id="wcm-title" className="wcm-title">Co chceš dnes cvičit?</h2>
            <p className="wcm-sub">Vyber jednu nebo více partií. Připravíme alternativu pouze pro dnešní trénink.</p>
            <div className="wcm-view-toggle">
              <button type="button" className={view === 'front' ? 'active' : ''} onClick={() => setView('front')}>Zepředu</button>
              <button type="button" className={view === 'back' ? 'active' : ''} onClick={() => setView('back')}>Zezadu</button>
            </div>
            <div className="wcm-body-row">
              <MuscleBodyMap selected={selected} onToggle={toggleMuscle} view={view} />
              <div className="wcm-chips" role="group" aria-label="Partie">
                <button type="button" className={`wcm-chip ${selected.includes('full_body') ? 'on' : ''}`} onClick={() => toggleMuscle('full_body')}>Celé tělo</button>
                {CHIP_IDS.map((id) => (
                  <button key={id} type="button" className={`wcm-chip ${selected.includes(id) ? 'on' : ''}`} onClick={() => toggleMuscle(id)}>{MUSCLE_GROUP_LABELS_CS[id]}</button>
                ))}
              </div>
            </div>
            <p className="wcm-label">Kde budeš cvičit?</p>
            <div className="wcm-pills">
              {LOCATION_OPTS.map((o) => (
                <button key={o.id} type="button" className={location === o.id ? 'on' : ''} onClick={() => setLocation(o.id)}>{o.label}</button>
              ))}
            </div>
            <p className="wcm-label">Kolik máš času?</p>
            <div className="wcm-pills">
              {DURATION_OPTS.map((m) => (
                <button key={m} type="button" className={duration === m ? 'on' : ''} onClick={() => setDuration(m)}>{m} minut</button>
              ))}
            </div>
            <p className="wcm-label">Jak náročný trénink chceš?</p>
            <div className="wcm-pills">
              {INTENSITY_OPTS.map((o) => (
                <button key={o.id} type="button" className={intensity === o.id ? 'on' : ''} onClick={() => setIntensity(o.id)}>{o.label}</button>
              ))}
            </div>
            {error ? <p className="wcm-error" role="alert">{error}</p> : null}
            <div className="wcm-actions">
              <button type="button" className="wcm-secondary" onClick={handleClose}>Zrušit</button>
              <button type="button" className="wcm-primary" disabled={!selectionValid || loading} onClick={() => generate(false)}>
                {loading ? 'Připravujeme alternativní trénink…' : 'Připravit alternativu'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="wcm-title">{preview?.title || 'Náhled tréninku'}</h2>
            <p className="wcm-sub">~{preview?.duration_minutes} min · {(preview?.focus || []).map((f) => MUSCLE_GROUP_LABELS_CS[f] || f).join(', ')}</p>
            <ul className="wcm-ex-list">
              {(preview?.exercises || []).map((ex, i) => (
                <li key={i}>
                  <strong>{ex.name}</strong>
                  <span> · {ex.sets}× {ex.reps}{ex.equipment ? ` · ${ex.equipment}` : ''}</span>
                </li>
              ))}
            </ul>
            {error ? <p className="wcm-error" role="alert">{error}</p> : null}
            <div className="wcm-actions wcm-actions--col">
              <button type="button" className="wcm-primary" disabled={loading} onClick={confirm}>Použít tento trénink</button>
              <button type="button" className="wcm-secondary" disabled={loading || regenLeft <= 0} onClick={() => generate(true)}>
                Zkusit jinou variantu{regenLeft > 0 ? ` (zbývá ${regenLeft})` : ''}
              </button>
              <button type="button" className="wcm-link" onClick={() => setStep('select')}>Ponechat původní</button>
            </div>
          </>
        )}
      </div>
      <style jsx>{`
        .wcm-overlay {
          position: fixed; inset: 0; z-index: 1200;
          background: rgba(0,0,0,0.55);
          display: flex; align-items: flex-end; justify-content: center;
        }
        @media (min-width: 640px) {
          .wcm-overlay { align-items: center; }
        }
        .wcm-sheet {
          background: #1e293b; color: #f8fafc;
          width: 100%; max-width: 700px; max-height: 92vh; overflow-y: auto;
          border-radius: 16px 16px 0 0; padding: 1.25rem 1.25rem 1.5rem;
          position: relative;
        }
        @media (min-width: 640px) {
          .wcm-sheet { border-radius: 16px; padding: 1.5rem; }
        }
        .wcm-close {
          position: absolute; top: 0.75rem; right: 0.75rem;
          background: transparent; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer;
        }
        .wcm-title { margin: 0 0 0.35rem; font-size: 1.2rem; font-weight: 700; }
        .wcm-sub { margin: 0 0 1rem; font-size: 0.9rem; color: #94a3b8; line-height: 1.45; }
        .wcm-view-toggle { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
        .wcm-view-toggle button {
          min-height: 44px; padding: 0.4rem 0.85rem; border-radius: 8px;
          border: 1px solid #475569; background: transparent; color: inherit; cursor: pointer;
        }
        .wcm-view-toggle button.active { background: #0ea5e9; border-color: #0ea5e9; }
        .wcm-body-row {
          display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem;
        }
        @media (min-width: 640px) {
          .wcm-body-row { flex-direction: row; align-items: flex-start; }
        }
        .wcm-body-row :global(.muscle-body-svg) {
          width: 160px; max-width: 100%; flex-shrink: 0; margin: 0 auto;
        }
        .wcm-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; flex: 1; }
        .wcm-chip {
          min-height: 44px; padding: 0.45rem 0.75rem; border-radius: 999px;
          border: 1px solid #475569; background: transparent; color: inherit; font-size: 0.85rem; cursor: pointer;
        }
        .wcm-chip.on { background: rgba(14,165,233,0.25); border-color: #38bdf8; }
        .wcm-label { margin: 0.65rem 0 0.35rem; font-size: 0.82rem; font-weight: 600; color: #cbd5e1; }
        .wcm-pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .wcm-pills button {
          min-height: 44px; padding: 0.4rem 0.75rem; border-radius: 999px;
          border: 1px solid #475569; background: transparent; color: inherit; font-size: 0.85rem; cursor: pointer;
        }
        .wcm-pills button.on { background: rgba(14,165,233,0.25); border-color: #38bdf8; }
        .wcm-error { color: #fca5a5; font-size: 0.88rem; margin: 0.75rem 0 0; }
        .wcm-actions { display: flex; gap: 0.5rem; margin-top: 1.25rem; flex-wrap: wrap; }
        .wcm-actions--col { flex-direction: column; }
        .wcm-primary {
          min-height: 48px; flex: 1; border: none; border-radius: 10px;
          background: #0ea5e9; color: #fff; font-weight: 600; cursor: pointer;
        }
        .wcm-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .wcm-secondary {
          min-height: 44px; padding: 0.5rem 1rem; border-radius: 10px;
          border: 1px solid #475569; background: transparent; color: inherit; cursor: pointer;
        }
        .wcm-link { background: none; border: none; color: #94a3b8; text-decoration: underline; cursor: pointer; padding: 0.5rem; }
        .wcm-ex-list { margin: 0; padding: 0; list-style: none; }
        .wcm-ex-list li { padding: 0.5rem 0; border-bottom: 1px solid #334155; font-size: 0.92rem; line-height: 1.4; }
        .wcm-ex-list span { color: #94a3b8; }
      `}</style>
    </div>
  );
}
