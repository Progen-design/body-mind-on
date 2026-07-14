/** Sdílené UI primitivy pro panel Dnes a Denní návyky. */

const PRIMITIVES_STYLE = `
  .habit-ui-card {
    padding: 1rem 1.1rem;
    border-radius: 20px;
    background: linear-gradient(160deg, rgba(22, 32, 55, 0.98) 0%, rgba(10, 15, 30, 0.98) 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
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
  }
  .habit-ui-progress-sep { color: #334155; margin: 0 3px; font-weight: 400; }
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
    background: linear-gradient(90deg, #34d399, #10b981, #059669);
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
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(15, 23, 42, 0.55);
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
  .habit-ui-check-row--done {
    border-color: rgba(34, 197, 94, 0.35);
    background: rgba(22, 101, 52, 0.12);
  }
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
    border-color: transparent;
    background: linear-gradient(145deg, #22c55e 0%, #15803d 100%);
    box-shadow: 0 4px 14px rgba(34, 197, 94, 0.45);
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
    border-radius: 10px;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, opacity 0.2s;
  }
  .habit-ui-btn--primary {
    padding: 8px 14px;
    font-size: 0.8125rem;
    color: #e9d5ff;
    background: rgba(124, 58, 237, 0.28);
    border: 1px solid rgba(167, 139, 250, 0.45);
  }
  .habit-ui-btn--primary:hover:not(:disabled) {
    background: rgba(124, 58, 237, 0.42);
  }
  .habit-ui-btn--pill {
    border: 1px solid rgba(167, 139, 250, 0.35);
    background: rgba(15, 23, 42, 0.6);
    color: #cbd5e1;
    border-radius: 999px;
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
  }
  .habit-ui-btn--pill-active {
    background: rgba(124, 58, 237, 0.32);
    border-color: rgba(167, 139, 250, 0.65);
    color: #f3e8ff;
  }
  .habit-ui-btn--pill-sm {
    font-size: 0.78rem;
    padding: 0.25rem 0.55rem;
  }
  .habit-ui-btn:disabled { opacity: 0.5; cursor: not-allowed; }
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
  return <style jsx>{PRIMITIVES_STYLE}</style>;
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
      <div className={`habit-ui-progress ${className}`.trim()} aria-live="polite">
        <span className="habit-ui-progress-nums">
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

export function getHabitGridCellStyle({
  completed,
  isToday,
  isFuture,
  isPast,
  busy,
  isNegative,
  cellWidth = 56,
}) {
  const readOnly = isFuture || isPast;
  const base = {
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    width: `${cellWidth}px`,
    height: '56px',
    padding: 0,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '11px',
    cursor: readOnly ? 'default' : 'pointer',
    border: 'none',
    outline: 'none',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s, opacity 0.18s',
    touchAction: 'manipulation',
    opacity: isFuture ? 0.18 : busy ? 0.55 : isPast ? 0.88 : 1,
    pointerEvents: readOnly ? 'none' : 'auto',
  };
  if (completed) {
    if (isNegative) {
      return {
        ...base,
        background: 'linear-gradient(145deg, #dc2626 0%, #b91c1c 100%)',
        boxShadow: '0 4px 18px rgba(239, 68, 68, 0.5), 0 0 0 1px rgba(248, 113, 113, 0.3) inset',
        color: '#fff',
      };
    }
    return {
      ...base,
      background: 'linear-gradient(145deg, #22c55e 0%, #15803d 100%)',
      boxShadow: '0 4px 18px rgba(34, 197, 94, 0.5), 0 0 0 1px rgba(74, 222, 128, 0.3) inset',
      color: '#fff',
    };
  }
  if (isToday) {
    return {
      ...base,
      background: 'rgba(109, 40, 217, 0.18)',
      boxShadow: '0 0 0 1.5px rgba(139, 92, 246, 0.5) inset',
      color: '#a78bfa',
    };
  }
  return {
    ...base,
    background: 'rgba(255, 255, 255, 0.055)',
    boxShadow: '0 0 0 1.5px rgba(255, 255, 255, 0.09) inset',
    color: '#475569',
  };
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
