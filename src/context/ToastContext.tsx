import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Doba zobrazení v ms (výchozí 4500). */
  durationMs?: number;
}

interface ToastRecord extends Required<Omit<ToastInput, 'description'>> {
  id: number;
  description?: string;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLE: Record<ToastVariant, { border: string; icon: React.ElementType; iconColor: string }> = {
  success: {
    border: 'border-[#39ff14]/50 shadow-[0_0_25px_rgba(57,255,20,0.18)]',
    icon: CheckCircle2,
    iconColor: 'text-[#39ff14]'
  },
  error: {
    border: 'border-red-500/50 shadow-[0_0_25px_rgba(239,68,68,0.18)]',
    icon: AlertTriangle,
    iconColor: 'text-red-400'
  },
  info: {
    border: 'border-cyan-500/50 shadow-[0_0_25px_rgba(0,242,254,0.18)]',
    icon: Info,
    iconColor: 'text-[#00f2fe]'
  }
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, description, variant = 'info', durationMs = 4500 }: ToastInput) => {
      const id = nextId.current++;
      setToasts(prev => [...prev.slice(-2), { id, title, description, variant, durationMs }]);
      const timer = setTimeout(() => {
        timers.current.delete(id);
        setToasts(prev => prev.filter(t => t.id !== id));
      }, durationMs);
      timers.current.set(id, timer);
    },
    []
  );

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Zásobník notifikací */}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col items-stretch sm:items-end gap-2 pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map(toast => {
            const style = VARIANT_STYLE[toast.variant];
            const Icon = style.icon;
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                className={`pointer-events-auto w-full sm:w-[22rem] p-3.5 rounded-2xl bg-[#0c1017]/95 backdrop-blur-xl border ${style.border} flex items-start gap-3`}
                role="status"
                aria-live="polite"
              >
                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.iconColor}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white">{toast.title}</div>
                  {toast.description && (
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {toast.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/80 transition-all"
                  aria-label="Zavřít notifikaci"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast musí být použit uvnitř <ToastProvider>.');
  }
  return ctx;
}
