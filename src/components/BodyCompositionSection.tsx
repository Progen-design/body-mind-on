import React from 'react';
import { BodyStatsGrid } from './BodyStatsGrid';
import { WeightChart } from './WeightChart';
import { WithingsCard } from './WithingsCard';
import { NadpisSekce } from './NadpisSekce';
import { NabidkaPropojeni } from './NabidkaPropojeni';
import { WeightRecord, TelesneSlozeni, SyncResult } from '../types';
import { Plus, Scale, Sparkles, TrendingUp, Watch } from 'lucide-react';
import { motion } from 'motion/react';

interface BodyCompositionSectionProps {
  currentRecord: WeightRecord | null;
  recordsByFilter: Record<string, WeightRecord[]>;
  /** Existuje řádek ve `withings_connections`? */
  hasWithingsConnection: boolean;
  /** `withings_last_sync_at` z profilu. null = server zatím nestahoval. */
  withingsLastSyncedAt: string | null;
  slozeni?: TelesneSlozeni | null;
  /** Vlastní odhad appky (Mifflin–St Jeor). null = nemáme z čeho spočítat. */
  vlastniBmrKcal?: number | null;
  /** ISO čas posledního payloadu z Apple Health. null = zatím nic nedorazilo. */
  zdraviPosledni?: string | null;
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
  vlastniBmrKcal = null,
  zdraviPosledni = null,
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
        ikona={<Scale className="w-5 h-5 text-akcent-cyan" />}
        akce={
          <button
            onClick={onAddMeasurement}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-akcent-cyan text-slate-950 hover:bg-akcent-cyan/90 shadow-[0_0_15px_rgba(0,242,254,0.3)] transition-all active:scale-95 whitespace-nowrap"
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
        vlastniBmrKcal={vlastniBmrKcal}
        onAddMeasurement={onAddMeasurement}
      />

      {/* 2. Interactive Neon Weight Chart */}
      <WeightChart
        recordsByFilter={recordsByFilter}
        onAddMeasurement={onAddMeasurement}
      />

      {/* 3. PŘIPOJENÁ ZAŘÍZENÍ. Váha i hodinky pod jedním nadpisem — dokud
          stály jako dvě nesouvisející karty na konci stránky, nebylo poznat,
          že tohle je místo, kde se zařízení propojují. */}
      <NadpisSekce
        titulek="Připojená zařízení"
        podtitulek="Odkud bereme měření. Víc zdrojů zatím nemáme — co neumíme, tu neslibujeme"
        ikona={<Watch className="w-5 h-5 text-akcent-lime" />}
      />

      <WithingsCard
        onSync={onSync}
        onOpenSettings={onOpenWithingsSettings}
        hasConnection={hasWithingsConnection}
        lastSyncedAt={withingsLastSyncedAt}
      />

      {/* 4. HODINKY. Sekce nabízela k propojení jedině váhu, takže kdo přišel
          s hodinkami, nenašel k nim nic. Tlačítko tu být nemůže: Apple
          neumožňuje číst HealthKit ze serveru, takže odesílání spustí jedině
          telefon. Karta proto říká, čím začít, a nesmí slibovat značky,
          které appka neumí — dnes chodí data z Apple Health a z Withings,
          odjinud ne. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-3xl p-5 sm:p-6 bg-povrch/95 border border-slate-800 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-lime-950/50 border border-lime-500/30 flex items-center justify-center text-akcent-lime shrink-0">
            <Watch className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-white">Hodinky &amp; náramky</h3>
              {!zdraviPosledni && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40">
                  Nepřipojeno
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {zdraviPosledni
                ? 'Data z hodinek chodí přes Apple Health. Regeneraci, tep a spánek najdeš na záložce Regenerace & Spánek.'
                : 'Tep, spánek a regeneraci bereme z Apple Health. V aplikaci Health Auto Export na iPhonu nastav odesílání na Body & Mind ON — hodinky, které do Health píšou, se přidají samy.'}
            </p>
          </div>
        </div>
        {/* Nabídka pomoci až pod obě karty — platí pro váhu i hodinky. */}
        <div className="mt-4">
          <NabidkaPropojeni />
        </div>
      </motion.div>
    </div>
  );
};
