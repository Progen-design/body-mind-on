import React, { useState } from 'react';
import { X, Wifi, Battery, CheckCircle2, RefreshCw, Smartphone, Shield, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface WithingsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onManualSync: () => Promise<void> | void;
}

export const WithingsSyncModal: React.FC<WithingsSyncModalProps> = ({
  isOpen,
  onClose,
  onManualSync
}) => {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [reconnectSuccess, setReconnectSuccess] = useState(false);

  if (!isOpen) return null;

  const handleReconnect = async () => {
    setIsReconnecting(true);
    setReconnectSuccess(false);
    await new Promise(r => setTimeout(r, 1400));
    setIsReconnecting(false);
    setReconnectSuccess(true);
    setTimeout(() => setReconnectSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-lg bg-[#0c1017] rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,242,254,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Integrace Withings Health
              </h3>
              <p className="text-xs text-slate-400">
                Připojené zařízení: Withings Body Scan Pro
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Device status card */}
          <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Stav připojení</span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/40">
                <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-pulse" />
                Aktivní &amp; Spárováno
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center gap-2">
                <Battery className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-[10px] text-slate-400">Stav baterie</div>
                  <div className="text-xs font-bold text-white">92 %</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="text-[10px] text-slate-400">Wi-Fi signál</div>
                  <div className="text-xs font-bold text-white">Silný (5 GHz)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sync toggles */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Automatická ranní synchronizace</div>
                <div className="text-xs text-slate-400">Ihned po stoupnutí na váhu odeslat data trenérovi</div>
              </div>
              <button
                onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                className={`w-12 h-6 rounded-full transition-colors p-1 flex items-center ${
                  autoSyncEnabled ? 'bg-[#00f2fe] justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <motion.div
                  layout
                  className="w-4 h-4 rounded-full bg-slate-950 shadow-md"
                />
              </button>
            </div>
          </div>

          {/* Reconnect Actions */}
          <div className="space-y-2">
            <button
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 transition-all flex items-center justify-center gap-2"
            >
              {isReconnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span>Navazuji spojení s Withings Cloud...</span>
                </>
              ) : reconnectSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#39ff14]" />
                  <span>Spojení úspěšně obnoveno!</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                  <span>Znovu autorizovat OAuth token Withings</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <span>End-to-end šifrování biometrických dat</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#39ff14]"
          >
            Hotovo
          </button>
        </div>
      </motion.div>
    </div>
  );
};
