import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MUSCLE_GROUP_LABELS_CS } from '../../lib/muscleGroupLabels';
import {
  RECOMMENDED_PRESETS,
  isMuscleHighlighted,
  isBodyZoneHighlighted,
  getRecommendedBodyView,
  getMuscleVisibilityGuidance,
  validateMuscleSelection,
  toggleMuscleInSelection,
  getMuscleDisabledReason,
  getDisabledMuscles,
  getSelectionSuggestion,
} from '../../lib/workoutMuscleGroupRules';
import {
  LOCATION_OPTIONS,
  EQUIPMENT_OPTIONS,
  DEFAULT_EQUIPMENT_BY_LOCATION,
} from '../../lib/workoutTrainingSetup';

const CHIP_IDS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core',
  'glutes', 'quads', 'hamstrings', 'calves',
];

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('aria-hidden'));
}

function MuscleRegion({
  zone, muscleId, label, cx, cy, rx, ry, selected, view, disabled, disabledReason, onToggle,
}) {
  const highlighted = isBodyZoneHighlighted(zone, selected, view);
  const fill = disabled && !highlighted ? '#1e293b' : highlighted ? '#0ea5e9' : '#334155';
  const opacity = disabled && !highlighted ? 0.22 : highlighted ? 0.95 : 0.35;
  const stroke = highlighted ? '#7dd3fc' : 'transparent';
  const strokeWidth = highlighted ? 1.5 : 0;

  const handleActivate = () => {
    if (disabled && !highlighted) return;
    onToggle(muscleId);
  };

  return (
    <ellipse
      role="button"
      tabIndex={disabled && !highlighted ? -1 : 0}
      aria-label={label}
      aria-pressed={highlighted}
      aria-disabled={disabled && !highlighted ? 'true' : 'false'}
      title={disabled && !highlighted ? disabledReason || '' : label}
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill={fill}
      fillOpacity={opacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      className={disabled && !highlighted ? 'wcm-svg-disabled' : ''}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    />
  );
}

const FRONT_REGIONS = [
  { zone: 'chest', muscleId: 'chest', cx: '100', cy: '72', rx: '28', ry: '18' },
  { zone: 'shoulders_left', muscleId: 'shoulders', cx: '62', cy: '68', rx: '14', ry: '10' },
  { zone: 'shoulders_right', muscleId: 'shoulders', cx: '138', cy: '68', rx: '14', ry: '10' },
  { zone: 'biceps_left', muscleId: 'biceps', cx: '48', cy: '95', rx: '12', ry: '22' },
  { zone: 'biceps_right', muscleId: 'biceps', cx: '152', cy: '95', rx: '12', ry: '22' },
  { zone: 'core', muscleId: 'core', cx: '100', cy: '118', rx: '22', ry: '16' },
  { zone: 'quads_left', muscleId: 'quads', cx: '82', cy: '165', rx: '14', ry: '32' },
  { zone: 'quads_right', muscleId: 'quads', cx: '118', cy: '165', rx: '14', ry: '32' },
  { zone: 'calves_left', muscleId: 'calves', cx: '82', cy: '218', rx: '10', ry: '22' },
  { zone: 'calves_right', muscleId: 'calves', cx: '118', cy: '218', rx: '10', ry: '22' },
];

const BACK_REGIONS = [
  { zone: 'back', muscleId: 'back', cx: '100', cy: '85', rx: '30', ry: '28' },
  { zone: 'shoulders_left', muscleId: 'shoulders', cx: '62', cy: '68', rx: '14', ry: '10' },
  { zone: 'shoulders_right', muscleId: 'shoulders', cx: '138', cy: '68', rx: '14', ry: '10' },
  { zone: 'triceps_left', muscleId: 'triceps', cx: '48', cy: '95', rx: '12', ry: '22' },
  { zone: 'triceps_right', muscleId: 'triceps', cx: '152', cy: '95', rx: '12', ry: '22' },
  { zone: 'glutes', muscleId: 'glutes', cx: '100', cy: '138', rx: '26', ry: '16' },
  { zone: 'hamstrings_left', muscleId: 'hamstrings', cx: '82', cy: '175', rx: '14', ry: '28' },
  { zone: 'hamstrings_right', muscleId: 'hamstrings', cx: '118', cy: '175', rx: '14', ry: '28' },
  { zone: 'calves_left', muscleId: 'calves', cx: '82', cy: '218', rx: '10', ry: '22' },
  { zone: 'calves_right', muscleId: 'calves', cx: '118', cy: '218', rx: '10', ry: '22' },
];

function MuscleBodyMap({ selected, disabledMuscles, duration, onToggle, view = 'front' }) {
  const isDisabled = (id) => disabledMuscles.includes(id) && !selected.includes(id) && !selected.includes('full_body');
  const reason = (id) => getMuscleDisabledReason(id, selected, duration);
  const regions = view === 'front' ? FRONT_REGIONS : BACK_REGIONS;
  const shouldersHighlighted = isBodyZoneHighlighted('shoulders_left', selected, view)
    || isBodyZoneHighlighted('shoulders_right', selected, view);

  return (
    <svg viewBox="0 0 200 260" className="muscle-body-svg" aria-hidden="false" role="img">
      <title>Výběr partie — {view === 'front' ? 'zepředu' : 'zezadu'}</title>
      <ellipse cx="100" cy="42" rx="18" ry="22" fill={shouldersHighlighted ? '#38bdf8' : '#475569'} fillOpacity={shouldersHighlighted ? 0.7 : 0.5} />
      <rect x="78" y="58" width="44" height="12" rx="6" fill="#475569" fillOpacity="0.4" />
      {regions.map((r) => (
        <MuscleRegion
          key={`${view}-${r.zone}`}
          zone={r.zone}
          muscleId={r.muscleId}
          label={MUSCLE_GROUP_LABELS_CS[r.muscleId]}
          cx={r.cx}
          cy={r.cy}
          rx={r.rx}
          ry={r.ry}
          selected={selected}
          view={view}
          disabled={isDisabled(r.muscleId)}
          disabledReason={reason(r.muscleId)}
          onToggle={onToggle}
        />
      ))}
    </svg>
  );
}

const DURATION_OPTS = [15, 30, 45, 60];
const INTENSITY_OPTS = [
  { id: 'light', label: 'Lehký' },
  { id: 'medium', label: 'Střední' },
  { id: 'hard', label: 'Náročný' },
];

/**
 * Modal / bottom sheet pro změnu dnešního tréninku (portal + viewport-fixed overlay).
 */
export default function WorkoutChangeModal({
  open,
  onClose,
  planId,
  planDayIndex,
  defaultLocation = 'gym',
  defaultEquipment = 'full_gym',
  defaultDuration = 30,
  defaultIntensity = 'medium',
  onPlanUpdated,
  onEvent,
  returnFocusRef = null,
  scrollLockYRef = null,
}) {
  const [view, setView] = useState('front');
  const [viewManual, setViewManual] = useState(false);
  const [selected, setSelected] = useState(['full_body']);
  const [trainingLocation, setTrainingLocation] = useState(
    ['home', 'gym', 'outdoor'].includes(defaultLocation) ? defaultLocation : 'gym',
  );
  const [equipmentLevel, setEquipmentLevel] = useState(defaultEquipment);
  const [equipmentTouched, setEquipmentTouched] = useState(false);
  const [duration, setDuration] = useState(defaultDuration);
  const [intensity, setIntensity] = useState(defaultIntensity);
  const [step, setStep] = useState('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hint, setHint] = useState(null);
  const [preview, setPreview] = useState(null);
  const [regenLeft, setRegenLeft] = useState(2);

  const sheetRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const handleCloseRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const validation = useMemo(
    () => validateMuscleSelection({ selectedMuscleGroups: selected, durationMinutes: duration }),
    [selected, duration],
  );

  const disabledMuscles = useMemo(
    () => getDisabledMuscles(selected, duration),
    [selected, duration],
  );

  const durationSuggestion = useMemo(
    () => getSelectionSuggestion(selected, duration),
    [selected, duration],
  );

  const visibilityGuidance = useMemo(
    () => getMuscleVisibilityGuidance(selected, view),
    [selected, view],
  );


  const toggleMuscle = useCallback((id) => {
    setSelected((prev) => {
      const result = toggleMuscleInSelection(prev, id, duration);
      if (result.blocked) {
        setHint(result.reason);
        return prev;
      }
      setHint(null);
      setError(null);
      if (!viewManual) {
        setView(getRecommendedBodyView(result.next));
      }
      return result.next;
    });
  }, [duration, viewManual]);

  const applyPreset = useCallback((muscles) => {
    setSelected([...muscles]);
    setHint(null);
    setError(null);
    setView(getRecommendedBodyView(muscles));
    setViewManual(false);
  }, []);

  const handleLocationChange = useCallback((loc) => {
    setTrainingLocation(loc);
    if (!equipmentTouched) {
      setEquipmentLevel(DEFAULT_EQUIPMENT_BY_LOCATION[loc] || 'basic');
    }
  }, [equipmentTouched]);

  const handleEquipmentChange = useCallback((level) => {
    setEquipmentLevel(level);
    setEquipmentTouched(true);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected([]);
    setHint(null);
    setError(null);
  }, []);

  const reset = () => {
    setStep('select');
    setPreview(null);
    setError(null);
    setHint(null);
    setLoading(false);
    setSelected(['full_body']);
    setView('front');
    setViewManual(false);
    setEquipmentTouched(false);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  handleCloseRef.current = handleClose;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    lastFocusedRef.current = returnFocusRef?.current || document.activeElement;
    const savedScrollY = scrollLockYRef?.current;
    const scrollY = savedScrollY != null ? savedScrollY : window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const prev = {
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };

    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    const frame = window.requestAnimationFrame(() => {
      const focusables = getFocusableElements(sheetRef.current);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        sheetRef.current?.focus();
      }
    });

    const handleKeyDown = (event) => {
      if (!sheetRef.current) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        handleCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusableElements(sheetRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        sheetRef.current.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = prev.bodyOverflow;
      html.style.overflow = prev.htmlOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
      const focusTarget = returnFocusRef?.current || lastFocusedRef.current;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        window.requestAnimationFrame(() => {
          try {
            focusTarget.focus({ preventScroll: true });
          } catch {
            focusTarget.focus();
          }
        });
      }
    };
  }, [open, returnFocusRef, scrollLockYRef]);

  const generate = async (isRegen = false) => {
    if (!validation.valid || loading) return;
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
          training_location: trainingLocation,
          equipment_level: equipmentLevel,
          duration_minutes: duration,
          intensity,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Alternativu se nepodařilo vytvořit.');
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

  if (!open || typeof document === 'undefined') return null;

  const showValidationMessage = !validation.valid ? (validation.message || durationSuggestion) : null;

  const modal = (
    <div
      className="wcm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        handleClose();
      }}
    >
      <div
        ref={sheetRef}
        className="wcm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wcm-title"
        tabIndex={-1}
      >
        <button type="button" className="wcm-close" onClick={handleClose} aria-label="Zavřít">×</button>
        <div className="wcm-scroll">
          {step === 'select' ? (
            <>
              <h2 id="wcm-title" className="wcm-title">Co chceš dnes cvičit?</h2>
              <p className="wcm-sub">Vyber jednu nebo více partií ve stejné tréninkové skupině. Připravíme alternativu pouze pro dnešní trénink.</p>

              <p className="wcm-label">Rychlý výběr</p>
              <div className="wcm-presets" role="group" aria-label="Rychlý výběr">
                {RECOMMENDED_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`wcm-preset ${selected.join(',') === preset.muscles.join(',') ? 'on' : ''}`}
                    onClick={() => applyPreset(preset.muscles)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="wcm-selection-toolbar">
                <button type="button" className="wcm-link" onClick={clearSelection}>Zrušit výběr</button>
              </div>

              <p className="wcm-view-label">Pohled na postavu</p>
              <div className="wcm-view-toggle" role="group" aria-label="Pohled na postavu">
                <button
                  type="button"
                  className={view === 'front' ? 'active' : ''}
                  aria-pressed={view === 'front'}
                  onClick={() => { setView('front'); setViewManual(true); }}
                >
                  Zepředu
                </button>
                <button
                  type="button"
                  className={view === 'back' ? 'active' : ''}
                  aria-pressed={view === 'back'}
                  onClick={() => { setView('back'); setViewManual(true); }}
                >
                  Zezadu
                </button>
              </div>
              {visibilityGuidance ? (
                <div className="wcm-view-guidance" role="status">
                  <span>{visibilityGuidance.message}</span>
                  <button
                    type="button"
                    className="wcm-link"
                    onClick={() => {
                      setView(visibilityGuidance.suggestedView);
                      setViewManual(true);
                    }}
                  >
                    {visibilityGuidance.buttonLabel}
                  </button>
                </div>
              ) : null}
              <div className="wcm-body-row">
                <MuscleBodyMap
                  selected={selected}
                  disabledMuscles={disabledMuscles}
                  duration={duration}
                  onToggle={toggleMuscle}
                  view={view}
                />
                <div className="wcm-chips" role="group" aria-label="Partie">
                  <button
                    type="button"
                    className={`wcm-chip ${selected.includes('full_body') ? 'on' : ''}`}
                    aria-pressed={selected.includes('full_body')}
                    onClick={() => toggleMuscle('full_body')}
                  >
                    Celé tělo
                  </button>
                  {CHIP_IDS.map((id) => {
                    const highlighted = isMuscleHighlighted(id, selected);
                    const disabled = disabledMuscles.includes(id) && !highlighted && !selected.includes('full_body');
                    const disabledReason = disabled ? getMuscleDisabledReason(id, selected, duration) : null;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`wcm-chip ${highlighted ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
                        aria-pressed={highlighted}
                        aria-disabled={disabled ? 'true' : 'false'}
                        title={disabledReason || undefined}
                        disabled={disabled}
                        onClick={() => toggleMuscle(id)}
                      >
                        {MUSCLE_GROUP_LABELS_CS[id]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {hint ? <p className="wcm-hint" role="status">{hint}</p> : null}
              {showValidationMessage ? <p className="wcm-hint wcm-hint-warn" role="status">{showValidationMessage}</p> : null}

              <p className="wcm-label">Kde budeš cvičit?</p>
              <div className="wcm-pills" role="group" aria-label="Místo tréninku">
                {LOCATION_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={trainingLocation === o.id ? 'on' : ''}
                    aria-pressed={trainingLocation === o.id}
                    onClick={() => handleLocationChange(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="wcm-label">Jaké máš vybavení?</p>
              <div className="wcm-pills" role="group" aria-label="Vybavení">
                {EQUIPMENT_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={equipmentLevel === o.id ? 'on' : ''}
                    aria-pressed={equipmentLevel === o.id}
                    onClick={() => handleEquipmentChange(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {EQUIPMENT_OPTIONS.find((o) => o.id === equipmentLevel)?.hint ? (
                <p className="wcm-equipment-hint">{EQUIPMENT_OPTIONS.find((o) => o.id === equipmentLevel).hint}</p>
              ) : null}
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
            </>
          ) : (
            <>
              <h2 id="wcm-title" className="wcm-title">{preview?.title || 'Náhled tréninku'}</h2>
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
            </>
          )}
        </div>
        <div className="wcm-actions">
          {step === 'select' ? (
            <>
              <button type="button" className="wcm-secondary" onClick={handleClose}>Zrušit</button>
              <button type="button" className="wcm-primary" disabled={!validation.valid || loading} onClick={() => generate(false)}>
                {loading ? 'Připravujeme alternativní trénink…' : 'Připravit alternativu'}
              </button>
            </>
          ) : (
            <div className="wcm-actions-col">
              <button type="button" className="wcm-primary" disabled={loading} onClick={confirm}>Použít tento trénink</button>
              <button type="button" className="wcm-secondary" disabled={loading || regenLeft <= 0} onClick={() => generate(true)}>
                Zkusit jinou variantu{regenLeft > 0 ? ` (zbývá ${regenLeft})` : ''}
              </button>
              <button type="button" className="wcm-link" onClick={() => setStep('select')}>Ponechat původní</button>
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .wcm-overlay {
          position: fixed;
          inset: 0;
          z-index: 1300;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          box-sizing: border-box;
        }
        @media (min-width: 640px) {
          .wcm-overlay {
            align-items: center;
            padding: 24px;
          }
        }
        .wcm-sheet {
          background: #1e293b;
          color: #f8fafc;
          width: 100%;
          max-width: 760px;
          max-height: 90dvh;
          display: flex;
          flex-direction: column;
          border-radius: 16px 16px 0 0;
          position: relative;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }
        @media (min-width: 640px) {
          .wcm-sheet {
            max-height: calc(100dvh - 48px);
            border-radius: 16px;
          }
        }
        .wcm-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 1.25rem 1.25rem 0.5rem;
        }
        @media (min-width: 640px) {
          .wcm-scroll {
            padding: 1.5rem 1.5rem 0.5rem;
          }
        }
        .wcm-close {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          z-index: 2;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 1.5rem;
          cursor: pointer;
          min-width: 44px;
          min-height: 44px;
        }
        .wcm-title { margin: 0 0 0.35rem; font-size: 1.2rem; font-weight: 700; padding-right: 2rem; }
        .wcm-sub { margin: 0 0 1rem; font-size: 0.9rem; color: #94a3b8; line-height: 1.45; }
        .wcm-presets { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
        .wcm-preset {
          min-height: 40px; padding: 0.35rem 0.7rem; border-radius: 999px;
          border: 1px solid #475569; background: rgba(15, 23, 42, 0.5); color: inherit; font-size: 0.82rem; cursor: pointer;
        }
        .wcm-preset.on { background: rgba(14,165,233,0.25); border-color: #38bdf8; }
        .wcm-selection-toolbar { margin-bottom: 0.75rem; }
        .wcm-view-label { margin: 0 0 0.35rem; font-size: 0.75rem; color: #94a3b8; font-weight: 500; }
        .wcm-view-toggle { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
        .wcm-view-toggle button {
          min-height: 44px; padding: 0.4rem 0.85rem; border-radius: 8px;
          border: 1px solid #475569; background: transparent; color: inherit; cursor: pointer;
        }
        .wcm-view-toggle button.active { background: #0ea5e9; border-color: #0ea5e9; color: #fff; }
        .wcm-view-guidance {
          display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
          margin-bottom: 0.75rem; font-size: 0.82rem; color: #cbd5e1;
        }
        .wcm-equipment-hint { margin: 0.25rem 0 0.5rem; font-size: 0.8rem; color: #94a3b8; }
        .wcm-body-row {
          display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem;
        }
        @media (min-width: 640px) {
          .wcm-body-row { flex-direction: row; align-items: flex-start; }
        }
        .wcm-body-row :global(.muscle-body-svg) {
          width: 160px; max-width: 100%; flex-shrink: 0; margin: 0 auto;
        }
        .wcm-body-row :global(.wcm-svg-disabled) { cursor: not-allowed; }
        .wcm-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; flex: 1; }
        .wcm-chip {
          min-height: 44px; padding: 0.45rem 0.75rem; border-radius: 999px;
          border: 1px solid #475569; background: transparent; color: inherit; font-size: 0.85rem; cursor: pointer;
        }
        .wcm-chip.on { background: rgba(14,165,233,0.35); border-color: #38bdf8; color: #f0f9ff; }
        .wcm-chip.disabled {
          opacity: 0.38;
          cursor: not-allowed;
          border-color: #334155;
        }
        .wcm-hint { color: #94a3b8; font-size: 0.85rem; margin: 0.5rem 0 0; line-height: 1.4; }
        .wcm-hint-warn { color: #fcd34d; }
        .wcm-label { margin: 0.65rem 0 0.35rem; font-size: 0.82rem; font-weight: 600; color: #cbd5e1; }
        .wcm-pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .wcm-pills button {
          min-height: 44px; padding: 0.4rem 0.75rem; border-radius: 999px;
          border: 1px solid #475569; background: transparent; color: inherit; font-size: 0.85rem; cursor: pointer;
        }
        .wcm-pills button.on { background: rgba(14,165,233,0.25); border-color: #38bdf8; }
        .wcm-error { color: #fca5a5; font-size: 0.88rem; margin: 0.75rem 0 0; }
        .wcm-actions {
          flex-shrink: 0;
          display: flex;
          gap: 0.5rem;
          margin: 0;
          flex-wrap: wrap;
          padding: 0.75rem 1.25rem max(1rem, env(safe-area-inset-bottom));
          border-top: 1px solid #334155;
          background: linear-gradient(180deg, rgba(30, 41, 59, 0.96) 0%, #1e293b 100%);
        }
        @media (min-width: 640px) {
          .wcm-actions {
            padding: 1rem 1.5rem 1.25rem;
          }
        }
        .wcm-actions-col {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          width: 100%;
        }
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

  return createPortal(modal, document.body);
}
