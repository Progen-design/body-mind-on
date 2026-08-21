import React from 'react';
import { TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { WeightRecord } from '../types';

interface BodyStatsGridProps {
  currentRecord: WeightRecord;
  onAddMeasurement: () => void;
}

export const BodyStatsGrid: React.FC<BodyStatsGridProps> = ({
  currentRecord,
  onAddMeasurement
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4">
      {/* 1. Large Váha Card (Left block - spans 5 columns on desktop) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="md:col-span-5 relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between group hover:border-cyan-400/50 transition-all duration-300 min-h-[170px]"
      >
        {/* Glow corner */}
        <div className="absolute -top-10 -left-10 w-28 h-28 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Váha:</span>
            <button
              onClick={onAddMeasurement}
              className="p-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 transition-all"
              title="Zadat nové měření"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-1">
            {currentRecord.weight.toString().replace('.', ',')} kg
          </div>
        </div>

        {/* Trend Pill matching screenshot */}
        <div className="relative z-10 mt-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/50 border border-emerald-500/30 flex items-center justify-center text-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.2)]">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#39ff14] leading-none">
              +2,7 kg
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Od minula
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right column container (spans 7 columns on desktop) */}
      <div className="md:col-span-7 flex flex-col gap-3.5 sm:gap-4">
        {/* 2. Tuk Card (Top right) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="relative overflow-hidden rounded-3xl p-5 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center justify-between group hover:border-cyan-400/50 transition-all duration-300"
        >
          <div>
            <span className="text-sm font-medium text-slate-400">Tuk:</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">
              {currentRecord.fatPercent.toString().replace('.', ',')} %
            </div>
          </div>

          {/* Trend Pill matching screenshot */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/50 border border-emerald-500/30 flex items-center justify-center text-[#39ff14] shadow-[0_0_10px_rgba(57,255,20,0.2)]">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-[#39ff14] leading-none">
                -0,3 %
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Od minula
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom row: Svalová hmota & BMI */}
        <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
          {/* 3. Svalová hmota */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="relative overflow-hidden rounded-3xl p-4 sm:p-5 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-cyan-400/50 transition-all duration-300"
          >
            <span className="text-xs sm:text-sm font-medium text-slate-400 block truncate">
              Svalová hmota:
            </span>
            <div className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-1">
              {currentRecord.muscleKg.toString().replace('.', ',')} kg
            </div>
          </motion.div>

          {/* 4. BMI */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="relative overflow-hidden rounded-3xl p-4 sm:p-5 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-cyan-400/50 transition-all duration-300"
          >
            <span className="text-xs sm:text-sm font-medium text-slate-400 block">
              BMI:
            </span>
            <div className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-1">
              {currentRecord.bmi.toString().replace('.', ',')}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
