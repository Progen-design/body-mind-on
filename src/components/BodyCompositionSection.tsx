import React from 'react';
import { BodyStatsGrid } from './BodyStatsGrid';
import { WeightChart } from './WeightChart';
import { WithingsCard } from './WithingsCard';
import { WeightRecord, TelesneSlozeni } from '../types';
import { Plus, Scale, Sparkles, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

interface BodyCompositionSectionProps {
  currentRecord: WeightRecord | null;
  recordsByFilter: Record<string, WeightRecord[]>;
  lastSyncedText: string;
  slozeni?: TelesneSlozeni | null;
  onAddMeasurement: () => void;
  onSync: () => void;
  onOpenWithingsSettings: () => void;
}

export const BodyCompositionSection: React.FC<BodyCompositionSectionProps> = ({
  currentRecord,
  recordsByFilter,
  lastSyncedText,
  slozeni = null,
  onAddMeasurement,
  onSync,
  onOpenWithingsSettings
}) => {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="rounded-3xl p-5 sm:p-6 bg-[#0c1017]/90 border border-cyan-500/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-white tracking-tight">Tělesné složení &amp; Withings Body Scan</h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/30">
              Chytrá váha aktivní
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Segmentální analýza tělesného tuku, svalové hmoty a viscerálního tuku
          </p>
        </div>

        <button
          onClick={onAddMeasurement}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#00f2fe] text-slate-950 hover:bg-[#00f2fe]/90 shadow-[0_0_15px_rgba(0,242,254,0.3)] transition-all active:scale-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Zapsat nové měření</span>
        </button>
      </div>

      {/* 1. Body Stats Bento Grid: Váha, Tuk, Svalová hmota, BMI */}
      <BodyStatsGrid
        currentRecord={currentRecord}
        slozeni={slozeni}
        onAddMeasurement={onAddMeasurement}
      />

      {/* 2. Interactive Neon Weight Chart */}
      <WeightChart
        recordsByFilter={recordsByFilter}
        onAddMeasurement={onAddMeasurement}
      />

      {/* 3. Withings Sync & Device Info */}
      <WithingsCard
        onSync={onSync}
        onOpenSettings={onOpenWithingsSettings}
        lastSyncedText={lastSyncedText}
      />
    </div>
  );
};
