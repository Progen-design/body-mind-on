// /components/Toast.js - Toast notifikace pro feedback
import { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose, duration = 3000 }) {
  useEffect(() => {
    if (message && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!message) return null;

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
  };

  const colors = {
    success: { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', text: '#22c55e' },
    error: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#f87171' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#3b82f6' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#f59e0b' },
  };

  const style = colors[type] || colors.success;

  return (
    <div className="toast" style={style}>
      <span className="toast-icon">{icons[type]}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Zavřít">
        ✕
      </button>

      <style jsx>{`
        .toast {
          position: fixed;
          top: 20px;
          right: 20px;
          background: ${style.bg};
          border: 1px solid ${style.border};
          border-radius: 12px;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 280px;
          max-width: 400px;
          z-index: 10000;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          animation: slideIn 0.3s ease-out;
          backdrop-filter: blur(10px);
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .toast-icon {
          font-size: 20px;
          flex-shrink: 0;
        }

        .toast-message {
          flex: 1;
          color: ${style.text};
          font-size: 14px;
          font-weight: 500;
          line-height: 1.4;
        }

        .toast-close {
          background: transparent;
          border: none;
          color: ${style.text};
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: all 0.2s;
          flex-shrink: 0;
          opacity: 0.7;
        }

        .toast-close:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
        }

        @media (max-width: 640px) {
          .toast {
            top: 10px;
            right: 10px;
            left: 10px;
            min-width: auto;
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}

