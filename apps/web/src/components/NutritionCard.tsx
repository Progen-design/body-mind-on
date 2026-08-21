import React from 'react';
import { Utensils, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

interface NutritionCardProps {
  currentCalories: number;
  targetCalories: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  onOpenMealPlan: () => void;
}

export const NutritionCard: React.FC<NutritionCardProps> = ({
  currentCalories = 2146,
  targetCalories = 2164,
  proteinPct = 19,
  carbsPct = 54,
  fatPct = 27,
  onOpenMealPlan
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between group hover:border-cyan-400/50 transition-all duration-300"
    >
      {/* Ambient background glow */}
      <div className="absolute -bottom-8 -right-8 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Jídlo dnes
          </h3>
          <Utensils className="w-4 h-4 text-cyan-400 opacity-80" />
        </div>

        {/* Calories counter matching screenshot typography */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {currentCalories.toLocaleString('cs-CZ')}
          </span>
          <span className="text-xs sm:text-sm text-slate-400 font-medium">
            kcal / cíl {targetCalories.toLocaleString('cs-CZ')}
          </span>
        </div>

        {/* Segmented macronutrient bar matching screenshot 1:1 */}
        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-1.5 h-2.5 w-full rounded-full overflow-hidden p-0.5 bg-slate-900/90 border border-slate-800">
            {/* Protein Segment */}
            <div
              style={{ width: `${proteinPct}%` }}
              className="h-full rounded-full bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]"
              title={`Bílkoviny: ${proteinPct}%`}
            />
            {/* Carbs Segment */}
            <div
              style={{ width: `${carbsPct}%` }}
              className="h-full rounded-full bg-[#2dd4bf] shadow-[0_0_8px_#2dd4bf]"
              title={`Sacharidy: ${carbsPct}%`}
            />
            {/* Fat Segment */}
            <div
              style={{ width: `${fatPct}%` }}
              className="h-full rounded-full bg-[#39ff14] shadow-[0_0_8px_#39ff14]"
              title={`Tuky: ${fatPct}%`}
            />
          </div>

          {/* Labels underneath matching screenshot */}
          <div className="flex items-center justify-between text-xs font-semibold px-0.5">
            <div className="flex items-center gap-1 text-[#00f2fe]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f2fe]" />
              <span>B {proteinPct} %</span>
            </div>
            <div className="flex items-center gap-1 text-[#2dd4bf]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf]" />
              <span>S {carbsPct} %</span>
            </div>
            <div className="flex items-center gap-1 text-[#39ff14]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14]" />
              <span>T {fatPct} %</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button: "Zobrazit dnešní jídlo" */}
      <button
        onClick={onOpenMealPlan}
        className="w-full py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-semibold text-slate-200 bg-slate-900/80 hover:bg-slate-800 hover:text-white border border-slate-700/60 hover:border-cyan-500/40 transition-all duration-200 text-center active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
      >
        <span>Zobrazit dnešní jídlo</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
      </button>
    </motion.div>
  );
};
