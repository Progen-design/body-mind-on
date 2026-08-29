import React from 'react';
import { BodyStatsGrid } from './BodyStatsGrid';
import { WeightChart } from './WeightChart';
import { WithingsCard } from './WithingsCard';
import { NadpisSekce } from './NadpisSekce';
import { WeightRecord, TelesneSlozeni, SyncResult } from '../types';
import { Plus, Scale, Sparkles, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

interface BodyCompositionSectionProps {
  currentRecord: WeightRecord | null;
  recordsByFilter: Record<string, WeightRecord[]>;
  /** Existuje řádek ve `withings_connections`? */
  hasWithingsConnection: boolean;
  /** `withings_last_sync_at` z profilu. null = server zatím nestahoval. */
  withingsLastSyncedAt: string | null;
  slozeni?: TelesneSlozeni | null;
  onAddMeasurement: () => void;
  onSync: () => Promise<SyncResult | null>;
  onOpenWithingsSettings: () => void;
}

export const BodyCompositionSection: React.FC<BodyCompositionSectionProps> = ({
  currentRecord,
  recordsByFilter,
  hasWithingsConnection,
  withingsLastSyncedAt,
  slozeni = null,
  onAddMeasurement,
  onSync,
  onOpenWithingsSettings
}) => {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Nadpis sekce. Dřív to byla samostatná barevná karta jen kvůli tomu,
          aby nadpis vypadal jako nadpis — teď to dělá typografie. */}
      <NadpisSekce
        titulek="Tělo & váha"
        podtitulek="Váha, tělesný tuk, svalová hmota a jejich vývoj z chytré váhy"
        ikona={<Scale className="w-5 h-5 text-[#00f2fe]" />}
        akce={
          <button
            onClick={onAddMeasurement}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#00f2fe] text-slate-950 hover:bg-[#00f2fe]/90 shadow-[0_0_15px_rgba(0,242,254,0.3)] transition-all active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Zapsat nové měření</span>
          </button>
        }
      />

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
        hasConnection={hasWithingsConnection}
        lastSyncedAt={withingsLastSyncedAt}
      />
    </div>
  );
};
