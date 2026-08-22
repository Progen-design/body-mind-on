import React from 'react';
import { TrendingUp, TrendingDown, Plus, Scale } from 'lucide-react';
import { motion } from 'motion/react';
import { WeightRecord, TelesneSlozeni } from '../types';
import { hodnotaNeboPomlcka, kdyMereno, zmenaText } from '../data/adaptery';
import { Vysvetlivka } from './Vysvetlivka';

interface BodyStatsGridProps {
  currentRecord: WeightRecord | null;
  /** Z chytré váhy. null = žádné měření složení, karty se nezobrazí. */
  slozeni: TelesneSlozeni | null;
  onAddMeasurement: () => void;
}

/**
 * ŽÁDNÉ VYMYŠLENÉ DELTY. Do 22. 8. 2026 tu svítilo natvrdo „+2,7 kg" a
 * „-0,3 %" bez ohledu na skutečná měření. Změna se teď počítá ze dvou
 * skutečných snapshotů; když druhý nemáme, nezobrazuje se nic.
 *
 * CHYBĚJÍCÍ HODNOTA JE „—", NIKDY 0.
 */

/** Trendová pilulka. Klesající tuk je dobře, klesající svaly ne. */
const Zmena: React.FC<{ text: string | null; kladneJeDobre: boolean }> = ({ text, kladneJeDobre }) => {
  if (!text) return null;
  const roste = text.startsWith('+');
  const dobre = roste === kladneJeDobre;
  const Ikona = roste ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
          dobre
            ? 'bg-emerald-950/50 border-emerald-500/30 text-[#39ff14]'
            : 'bg-slate-900 border-slate-700 text-slate-400'
        }`}
      >
        <Ikona className="w-4 h-4" />
      </div>
      <div className="text-right">
        <div className={`text-sm font-bold leading-none ${dobre ? 'text-[#39ff14]' : 'text-slate-300'}`}>
          {text}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">Od minula</div>
      </div>
    </div>
  );
};

const Dlazdice: React.FC<{ popisek: string; hodnota: string; delay: number; pojem?: string }> = ({
  popisek,
  hodnota,
  delay,
  pojem
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.4, delay }}
    className="relative overflow-hidden rounded-3xl p-4 sm:p-5 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
  >
    <span className="text-xs sm:text-sm font-medium text-slate-400 inline-flex items-center gap-1">
      {popisek}
      {pojem && <Vysvetlivka pojem={pojem} />}
    </span>
    <div className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-1">{hodnota}</div>
  </motion.div>
);

export const BodyStatsGrid: React.FC<BodyStatsGridProps> = ({
  currentRecord,
  slozeni,
  onAddMeasurement
}) => {
  const merenoText = slozeni ? kdyMereno(slozeni.measured_at) : '';

  return (
    <div className="space-y-3.5 sm:space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4">
        {/* Váha — jediná hodnota, kterou máme vždy */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="md:col-span-5 relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between min-h-[170px]"
        >
          <div className="absolute -top-10 -left-10 w-28 h-28 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-400">Váha:</span>
              <button
                onClick={onAddMeasurement}
                className="p-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 transition-all"
                title="Zapsat váhu"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-1">
              {hodnotaNeboPomlcka(currentRecord?.weight, 'kg')}
            </div>
          </div>
        </motion.div>

        {/* Složení z chytré váhy — bez měření se nic nezobrazuje */}
        {slozeni && (
          <div className="md:col-span-7 flex flex-col gap-3.5 sm:gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="relative overflow-hidden rounded-3xl p-5 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center justify-between gap-3"
            >
              <div>
                <span className="text-sm font-medium text-slate-400">Tuk:</span>
                <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">
                  {hodnotaNeboPomlcka(slozeni.fat_percent, '%')}
                </div>
              </div>
              <Zmena text={zmenaText(slozeni.zmena.fat_percent, '%')} kladneJeDobre={false} />
            </motion.div>

            {/* Chytrá váha posílá osm hodnot najednou, profil do 3.10 ukazoval
                pět. Tuk v kilogramech, kostní hmota a hydratace ležely
                v databázi u 36 ze 40 měření a nikdo je nečetl. Dlaždice bez
                naměřené hodnoty ukáže „—", nikdy nulu. */}
            <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
              <Dlazdice
                popisek="Tuk:"
                hodnota={hodnotaNeboPomlcka(slozeni.fat_mass_kg, 'kg')}
                delay={0.2}
                pojem="tuk_kg"
              />
              <Dlazdice
                popisek="Svalová hmota:"
                hodnota={hodnotaNeboPomlcka(slozeni.muscle_mass_kg, 'kg')}
                delay={0.22}
              />
              <Dlazdice popisek="BMI:" hodnota={hodnotaNeboPomlcka(slozeni.bmi)} delay={0.25} pojem="bmi" />
              <Dlazdice
                popisek="Viscerální tuk:"
                hodnota={hodnotaNeboPomlcka(slozeni.visceral_fat)}
                delay={0.28}
                pojem="visceralni_tuk"
              />
              <Dlazdice
                popisek="Kostní hmota:"
                hodnota={hodnotaNeboPomlcka(slozeni.bone_mass_kg, 'kg')}
                delay={0.31}
                pojem="kostni_hmota"
              />
              <Dlazdice
                popisek="Hydratace:"
                hodnota={hodnotaNeboPomlcka(slozeni.hydration_kg, 'kg')}
                delay={0.34}
                pojem="hydratace_kg"
              />
              <Dlazdice
                popisek="Bazální metabolismus:"
                hodnota={hodnotaNeboPomlcka(slozeni.basal_metabolic_rate, 'kcal', 0)}
                delay={0.37}
                pojem="bazalni_metabolismus"
              />
            </div>
          </div>
        )}
      </div>

      {/* Kdy se měřilo. Data z jiného dne než z váhy nesmí vypadat jako dnešní. */}
      {slozeni && merenoText && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 px-1">
          <Scale className="w-3.5 h-3.5 text-slate-600" />
          <span>Složení těla změřeno {merenoText}</span>
        </div>
      )}
    </div>
  );
};
