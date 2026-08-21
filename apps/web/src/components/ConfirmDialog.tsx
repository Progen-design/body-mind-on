import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'neutral';
  icon?: React.ElementType;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Potvrdit',
  cancelLabel = 'Zrušit',
  tone = 'danger',
  icon,
  onConfirm,
  onCancel
}) => {
  // Escape zavírá dialog
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  const Icon = icon ?? AlertTriangle;
  const isDanger = tone === 'danger';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={`relative z-10 w-full max-w-sm rounded-3xl bg-[#0c1017] border p-5 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.7)] ${
              isDanger ? 'border-red-500/40' : 'border-cyan-500/30'
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center border ${
                  isDanger
                    ? 'bg-red-950/60 border-red-500/40 text-red-400'
                    : 'bg-cyan-950/60 border-cyan-500/40 text-[#00f2fe]'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{description}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition-all active:scale-95"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                autoFocus
                className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  isDanger
                    ? 'text-white bg-red-600 hover:bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.35)]'
                    : 'text-slate-950 bg-[#00f2fe] hover:bg-[#00f2fe]/90 shadow-[0_0_18px_rgba(0,242,254,0.3)]'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
