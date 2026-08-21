import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, Wifi, Zap } from 'lucide-react';
import { motion } from 'motion/react';

interface WithingsCardProps {
  onSync: () => Promise<void> | void;
  onOpenSettings: () => void;
  lastSyncedText?: string;
}

export const WithingsCard: React.FC<WithingsCardProps> = ({
  onSync,
  onOpenSettings,
  lastSyncedText = 'dnes v 08:45'
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleSyncClick = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncSuccess(false);

    try {
      if (onSync) {
        await onSync();
      }
      // Simulated sync animation
      await new Promise((res) => setTimeout(res, 1200));
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-cyan-400/50 transition-all duration-300"
    >
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
        {/* Text descriptions */}
        <div className="max-w-md">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-xl font-bold text-white tracking-tight">
              Withings
            </h3>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-[#39ff14] border border-emerald-500/30">
              <Wifi className="w-2.5 h-2.5" />
              Online
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Propojte svou chytrou váhu Withings pro automatickou synchronizaci měření tělesné kompozice a tepové frekvence.
          </p>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
            <span>Poslední úspěšná synchronizace:</span>
            <span className="text-slate-300 font-medium">{lastSyncedText}</span>
          </div>
        </div>

        {/* Action Buttons matching screenshot layout */}
        <div className="flex flex-col gap-2.5 w-full md:w-auto min-w-[200px] sm:min-w-[240px]">
          {/* Primary Cyan Glow Button: "Synchronizovat teď" */}
          <button
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="w-full relative overflow-hidden py-3 px-5 rounded-2xl font-bold text-sm text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#38ef7d] hover:from-[#2bf5ff] hover:to-[#50fa8f] transition-all duration-300 shadow-[0_0_24px_rgba(0,242,254,0.4)] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-80"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 text-slate-950 animate-spin" />
                <span>Synchronizuji data...</span>
              </>
            ) : syncSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                <span>Aktualizováno!</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-slate-950 fill-current" />
                <span>Synchronizovat teď</span>
              </>
            )}
          </button>

          {/* Secondary Button: "Znovu propojit Withings" */}
          <button
            onClick={onOpenSettings}
            className="w-full py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-semibold text-slate-300 bg-slate-900/80 hover:bg-slate-800 hover:text-white border border-slate-700/60 hover:border-slate-600 transition-all duration-200 text-center active:scale-[0.98]"
          >
            Znovu propojit Withings
          </button>
        </div>
      </div>
    </motion.div>
  );
};
