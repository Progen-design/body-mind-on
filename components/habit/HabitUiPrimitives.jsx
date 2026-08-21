/** Sdílené UI primitivy pro panel Dnes a Denní návyky. */
import { getHabitGridCellStyle } from '../../lib/profile/navykyVzhled.js';
export { getHabitGridCellStyle };

const PRIMITIVES_STYLE = `
  .habit-ui-card {
    padding: 1rem 1.1rem;
    border-radius: 20px;
    /* Návrh v2: skleněná karta — stejný gradient a rám jako karty jídla
       a tělesného vývoje, aby profil vypadal jako jeden systém. */
    background: linear-gradient(180deg, rgba(19, 22, 34, 0.9) 0%, rgba(14, 17, 26, 0.95) 100%);
    border: 1px solid rgba(38, 38, 38, 0.9);
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .habit-ui-card-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 0.75rem;
  }
  .habit-ui-card-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #f8fafc;
  }
  .habit-ui-group { margin-top: 0.75rem; }
  .habit-ui-group-title {
    margin: 0 0 0.35rem;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .habit-ui-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .habit-ui-progress {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 7px;
    flex-shrink: 0;
  }
  .habit-ui-progress-nums {
    font-size: 1.125rem;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .habit-ui-progress-sep {
    color: #94a3b8;
    margin: 0 4px;
    font-weight: 600;
  }
  .habit-ui-progress-bar-wrap {
    width: 130px;
    height: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
    overflow: hidden;
  }
  .habit-ui-progress-bar {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #39ff14, #22c55e, #15803d);
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 10px rgba(52, 211, 153, 0.55);
  }
  .habit-ui-check-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 8px 12px;
    border-radius: 14px;
    border: 1px solid rgba(38, 38, 38, 0.9);
    background: rgba(18, 21, 31, 0.8);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    color: #e2e8f0;
    transition: border-color 0.2s, background 0.2s, opacity 0.2s;
  }
  .habit-ui-check-row:hover:not(:disabled) {
    border-color: rgba(167, 139, 250, 0.35);
    background: rgba(30, 41, 59, 0.75);
  }
  /* Splněno = zelená se září. V celém profilu je tahle zelená vyhrazená
     pro „hotovo“, takže se význam nemusí louskat z kontextu. */
  .habit-ui-check-row--done {
    border-color: rgba(57, 255, 20, 0.4);
    background: linear-gradient(180deg, rgba(19, 27, 32, 0.9) 0%, rgba(14, 20, 26, 0.95) 100%);
    box-shadow: 0 0 18px rgba(57, 255, 20, 0.12);
  }
  /* Nesplněný návyk se ztlumí, ale zůstane čitelný — není to chyba, jen
     ještě neudělaná věc. */
  .habit-ui-check-row:not(.habit-ui-check-row--done) { opacity: 0.72; }
  .habit-ui-check-row:not(.habit-ui-check-row--done):hover { opacity: 1; }
  .habit-ui-check-row--pending { opacity: 0.85; cursor: wait; }
  .habit-ui-check-row:disabled { cursor: not-allowed; opacity: 0.7; }
  .habit-ui-check-box {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 2px solid rgba(255, 255, 255, 0.22);
    background: transparent;
    box-sizing: border-box;
  }
  .habit-ui-check-box--done {
    border-color: #39ff14;
    background: #1b3d26;
    color: #39ff14;
    box-shadow: 0 0 12px rgba(57, 255, 20, 0.4);
  }
  .habit-ui-check-emoji { font-size: 1.1rem; line-height: 1; flex-shrink: 0; }
  .habit-ui-check-label {
    flex: 1;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.35;
    color: #e2e8f0;
  }
  .habit-ui-check-label--done { color: #86efac; }
  .habit-ui-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-top-color: #a78bfa;
    border-radius: 50%;
    animation: habit-ui-spin 0.7s linear infinite;
  }
  .habit-ui-btn {
    border-radius: var(--bmon-radius-button, 12px);
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, opacity 0.15s, transform 0.15s, filter 0.15s, box-shadow 0.15s;
  }
  .habit-ui-btn--primary {
    min-height: 44px;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #00f2fe 0%, #38ef7d 100%);
    border: 1px solid rgba(14, 165, 233, 0.45);
    box-shadow: 0 8px 20px rgba(14, 165, 233, 0.25);
  }
  .habit-ui-btn--primary:hover:not(:disabled) {
    filter: brightness(1.05);
    transform: translateY(-1px);
  }
  .habit-ui-btn--pill {
    border: 1px solid var(--bmon-card-border, rgba(148, 163, 184, 0.22));
    background: rgba(255, 255, 255, 0.06);
    color: var(--bmon-text-muted, #94a3b8);
    border-radius: 999px;
    min-height: 36px;
    padding: 0.4rem 0.9rem;
    font-size: 0.85rem;
  }
  .habit-ui-btn--pill-active {
    background: linear-gradient(135deg, #00f2fe 0%, #38ef7d 100%);
    border-color: rgba(14, 165, 233, 0.45);
    color: #fff;
    box-shadow: 0 6px 16px rgba(14, 165, 233, 0.22);
  }
  .habit-ui-btn--pill-sm {
    font-size: 0.78rem;
    min-height: 32px;
    padding: 0.28rem 0.65rem;
  }
  .habit-ui-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; filter: none; box-shadow: none; }
  .habit-ui-cell-empty {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 2px solid;
    display: block;
    box-sizing: border-box;
  }
  @keyframes habit-ui-spin { to { transform: rotate(360deg); } }
`;

function HabitUiStyles() {
  return <style dangerouslySetInnerHTML={{ __html: PRIMITIVES_STYLE }} />;
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HabitUiCard({ as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <>
      <HabitUiStyles />
      <Tag className={`habit-ui-card ${className}`.trim()} {...rest}>
        {children}
      </Tag>
    </>
  );
}

export function HabitUiProgressBar({ done, total, className = '' }) {
  const safeTotal = Math.max(total, 1);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <>
      <HabitUiStyles />
      <div className={`habit-ui-progress ${className}`.trim()} aria-live="polite" aria-label={`${done} z ${total} hotovo`}>
        <span className="habit-ui-progress-nums" aria-hidden="true">
          {done}<span className="habit-ui-progress-sep">/</span>{total}
        </span>
        <div className="habit-ui-progress-bar-wrap">
          <div
            className="habit-ui-progress-bar"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={safeTotal}
          />
        </div>
      </div>
    </>
  );
}

export function HabitUiCheckboxRow({
  checked,
  pending = false,
  disabled = false,
  onToggle,
  label,
  emoji = null,
  ariaLabel,
}) {
  return (
    <>
      <HabitUiStyles />
      <button
        type="button"
        className={`habit-ui-check-row${checked ? ' habit-ui-check-row--done' : ''}${pending ? ' habit-ui-check-row--pending' : ''}`}
        onClick={onToggle}
        disabled={disabled || pending}
        aria-pressed={checked}
        aria-busy={pending}
        aria-label={ariaLabel || label}
      >
        <span className={`habit-ui-check-box${checked ? ' habit-ui-check-box--done' : ''}`} aria-hidden="true">
          {pending ? <span className="habit-ui-spinner" /> : checked ? <CheckIcon /> : null}
        </span>
        {emoji ? <span className="habit-ui-check-emoji" aria-hidden="true">{emoji}</span> : null}
        <span className={`habit-ui-check-label${checked ? ' habit-ui-check-label--done' : ''}`}>{label}</span>
      </button>
    </>
  );
}

export function HabitUiButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}) {
  const classes = [
    'habit-ui-btn',
    variant === 'pill' ? 'habit-ui-btn--pill' : 'habit-ui-btn--primary',
    size === 'sm' ? 'habit-ui-btn--pill-sm' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <>
      <HabitUiStyles />
      <button type="button" className={classes} {...rest}>
        {children}
      </button>
    </>
  );
}


export function HabitUiGridCheckbox({
  completed,
  isToday,
  isFuture,
  isPast,
  busy,
  isNegative,
  onToggle,
  ariaLabel,
  cellWidth = 56,
  className = '',
}) {
  const readOnly = isFuture || isPast;
  const editable = !readOnly && !busy;
  const style = getHabitGridCellStyle({ completed, isToday, isFuture, isPast, busy, isNegative, cellWidth });

  return (
    <>
      <HabitUiStyles />
      <button
        type="button"
        className={`hg-habit-cell${isPast ? ' hg-habit-cell--past' : ''}${isFuture ? ' hg-habit-cell--future' : ''} ${className}`.trim()}
        style={style}
        onClick={() => editable && onToggle?.()}
        disabled={!editable}
        aria-pressed={completed}
        aria-label={ariaLabel}
        onMouseEnter={(e) => {
          if (!editable) return;
          e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)';
          e.currentTarget.style.boxShadow = completed
            ? (isNegative ? '0 8px 24px rgba(239,68,68,0.6)' : '0 8px 24px rgba(34,197,94,0.6)')
            : isToday
              ? '0 0 0 1.5px rgba(139,92,246,0.8) inset, 0 8px 20px rgba(0,0,0,0.3)'
              : '0 0 0 1.5px rgba(255,255,255,0.25) inset, 0 8px 20px rgba(0,0,0,0.25)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = style.boxShadow;
        }}
        onMouseDown={(e) => { if (editable) e.currentTarget.style.transform = 'scale(0.9)'; }}
        onMouseUp={(e) => { if (editable) e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)'; }}
      >
        {busy ? (
          <span className="habit-ui-spinner" />
        ) : completed ? (
          isNegative ? <CrossIcon /> : <CheckIcon />
        ) : (
          <span
            className="habit-ui-cell-empty"
            style={{ borderColor: isToday ? 'rgba(167,139,250,0.65)' : 'rgba(255,255,255,0.28)' }}
            aria-hidden="true"
          />
        )}
      </button>
    </>
  );
}
