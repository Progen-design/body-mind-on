import React from 'react';
import { Dumbbell, Sliders, RefreshCw, Scale, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface QuickActionToolbarProps {
  onLogWorkout: () => void;
  onEditPreferences: () => void;
  onSyncAll: () => void;
  onAddWeight: () => void;
  isSyncing?: boolean;
}

export const QuickActionToolbar: React.FC<QuickActionToolbarProps> = ({
  onLogWorkout,
  onEditPreferences,
  onSyncAll,
  onAddWeight,
  isSyncing = false
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 mb-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Rychlé akce:
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Zapsat trénink */}
        <button
          onClick={onLogWorkout}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-emerald-950/80 to-cyan-950/80 hover:from-emerald-900/80 hover:to-cyan-900/80 text-emerald-300 border border-[#39ff14]/40 hover:border-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.2)] transition-all active:scale-95"
        >
          <Dumbbell className="w-3.5 h-3.5 text-[#39ff14]" />
          <span>Zapsat trénink</span>
        </button>

        {/* Upravit preference */}
        <button
          onClick={onEditPreferences}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/60 hover:border-slate-600 transition-all active:scale-95"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>Upravit preference</span>
        </button>

        {/* Synchronizovat teď */}
        <button
          onClick={onSyncAll}
          disabled={isSyncing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-cyan-950/70 hover:bg-cyan-900/70 text-[#00f2fe] border border-cyan-500/40 hover:border-cyan-400 shadow-[0_0_12px_rgba(0,242,254,0.25)] transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#00f2fe] ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Synchronizuji...' : 'Synchronizovat teď'}</span>
        </button>

        {/* Zapsat váhu */}
        <button
          onClick={onAddWeight}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-all active:scale-95"
          title="Manuální záznam váhy"
        >
          <Scale className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Nové vážení</span>
        </button>
      </div>
    </div>
  );
};
