import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('aria-hidden'));
}

export default function FullscreenOverlay({
  open,
  onClose,
  canClose = true,
  title,
  subtitle,
  size = 'medium',
  transparent = false,
  brandedBg = false,
  headerActions = null,
  footer = null,
  children,
  labelledBy,
}) {
  const panelRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const initialFocusDoneRef = useRef(false);

  const panelClassName = useMemo(() => {
    if (size === 'large') return 'overlay-panel overlay-panel--large';
    if (size === 'workout') return 'overlay-panel overlay-panel--workout';
    return 'overlay-panel overlay-panel--medium';
  }, [size]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    lastFocusedRef.current = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    let frame = null;
    if (!initialFocusDoneRef.current) {
      initialFocusDoneRef.current = true;
      frame = window.requestAnimationFrame(() => {
        const focusables = getFocusableElements(panelRef.current);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          panelRef.current?.focus();
        }
      });
    }

    const handleKeyDown = (event) => {
      if (!panelRef.current) return;

      if (event.key === 'Escape') {
        if (!canClose) return;
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusableElements(panelRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
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
      if (frame != null) window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      initialFocusDoneRef.current = false;
      if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === 'function') {
        lastFocusedRef.current.focus();
      }
    };
  }, [open, canClose, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`overlay-root ${transparent ? 'overlay-root--transparent' : ''} ${brandedBg ? 'overlay-root--branded' : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || !canClose) return;
        onClose?.();
      }}
    >
      <div
        ref={panelRef}
        className={`${panelClassName} ${transparent ? 'overlay-panel--transparent' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'fullscreen-overlay-title'}
        tabIndex={-1}
      >
        <div className="overlay-header">
          <div className="overlay-header-main">
            <button
              type="button"
              className="overlay-back-button"
              onClick={() => onClose?.()}
              disabled={!canClose}
              aria-label="Zavřít pracovní plochu"
            >
              ←
            </button>
            <div className="overlay-title-wrap">
              <h2 id={labelledBy || 'fullscreen-overlay-title'} className="overlay-title">
                {title}
              </h2>
              {subtitle ? <p className="overlay-subtitle">{subtitle}</p> : null}
            </div>
          </div>
          {headerActions ? <div className="overlay-header-actions">{headerActions}</div> : null}
        </div>

        <div className={`overlay-body ${footer ? 'overlay-body-has-footer' : ''}`}>{children}</div>

        {footer ? <div className="overlay-footer">{footer}</div> : null}
      </div>

      <style jsx>{`
        .overlay-root {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: 0;
          background:
            radial-gradient(circle at top, rgba(124, 58, 237, 0.2), transparent 30%),
            rgba(2, 6, 23, 0.84);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .overlay-root--transparent {
          background:
            radial-gradient(circle at top, rgba(124, 58, 237, 0.16), transparent 34%),
            rgba(2, 6, 23, 0.56);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .overlay-root--branded {
          background:
            linear-gradient(135deg, #120638 0%, #1a0645 30%, #34026b 60%, #1a0645 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .overlay-root--branded::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle 50% at 20% 20%, rgba(159, 70, 255, 0.25) 0%, transparent 50%),
            radial-gradient(circle 40% at 80% 80%, rgba(52, 2, 107, 0.3) 0%, transparent 50%),
            radial-gradient(circle 35% at 50% 50%, rgba(139, 92, 255, 0.15) 0%, transparent 55%);
        }
        .overlay-root--branded .overlay-panel {
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
        }
        .overlay-panel {
          position: relative;
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          background:
            linear-gradient(180deg, rgba(8, 15, 31, 0.98) 0%, rgba(7, 12, 24, 0.98) 100%);
          color: #f8fafc;
          border: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow: 0 32px 80px rgba(2, 6, 23, 0.55);
          overflow: hidden;
        }
        .overlay-panel--transparent {
          background:
            linear-gradient(180deg, rgba(8, 15, 31, 0.78) 0%, rgba(7, 12, 24, 0.74) 100%);
          border-color: rgba(148, 163, 184, 0.14);
          box-shadow: 0 26px 62px rgba(2, 6, 23, 0.38);
        }
        .overlay-panel--workout {
          max-width: 860px;
        }
        .overlay-panel--medium {
          max-width: 960px;
        }
        .overlay-panel--large {
          max-width: 1100px;
        }
        .overlay-header {
          position: sticky;
          top: 0;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
          background: linear-gradient(180deg, rgba(8, 15, 31, 0.98) 0%, rgba(8, 15, 31, 0.92) 100%);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .overlay-header-main {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          min-width: 0;
        }
        .overlay-back-button {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.86);
          color: #e2e8f0;
          font-size: 22px;
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .overlay-back-button:hover:not(:disabled) {
          transform: translateX(-1px);
          border-color: rgba(167, 139, 250, 0.45);
          background: rgba(30, 41, 59, 0.95);
        }
        .overlay-back-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .overlay-title-wrap {
          min-width: 0;
        }
        .overlay-title {
          margin: 0;
          font-size: clamp(1.4rem, 1rem + 1vw, 2rem);
          line-height: 1.05;
          letter-spacing: -0.03em;
        }
        .overlay-subtitle {
          margin: 8px 0 0;
          max-width: 680px;
          font-size: 0.98rem;
          line-height: 1.55;
          color: #94a3b8;
        }
        .overlay-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }
        .overlay-body {
          flex: 1;
          overflow-y: auto;
          padding: 28px 24px 32px;
          -webkit-overflow-scrolling: touch;
        }
        .overlay-body-has-footer {
          padding-bottom: 100px;
        }
        .overlay-footer {
          position: sticky;
          bottom: 0;
          z-index: 3;
          padding: 18px 24px 22px;
          border-top: 1px solid rgba(148, 163, 184, 0.14);
          background: linear-gradient(180deg, rgba(8, 15, 31, 0.9) 0%, rgba(8, 15, 31, 0.98) 100%);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        @media (min-width: 768px) {
          .overlay-root {
            align-items: center;
            padding: 24px;
          }
          .overlay-panel {
            height: min(94vh, 980px);
            border-radius: 28px;
          }
        }

        @media (max-width: 767px) {
          .overlay-header {
            padding: 14px 16px;
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 12px;
          }
          .overlay-header-main {
            min-width: 0;
            flex: 1 1 auto;
          }
          .overlay-title-wrap { min-width: 0; }
          .overlay-title {
            font-size: 1.2rem;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .overlay-subtitle { font-size: 0.875rem; margin-top: 4px; }
          .overlay-body {
            padding: 18px 16px 24px;
            -webkit-overflow-scrolling: touch;
            overflow-y: auto;
          }
          .overlay-body-has-footer {
            padding-bottom: 120px;
          }
          .overlay-footer {
            padding: 16px 16px max(18px, env(safe-area-inset-bottom));
            min-height: 76px;
          }
          .overlay-header-actions {
            width: 100%;
            justify-content: flex-end;
            flex-shrink: 0;
          }
          .overlay-header-actions button {
            min-height: 44px;
            min-width: 44px;
            padding: 10px 18px;
            touch-action: manipulation;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
