import React from 'react';
import { Dumbbell, ChevronRight, Flame, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { WorkoutDay } from '../types';

interface WorkoutCardProps {
  todayWorkout: WorkoutDay;
  onOpenWeeklyPlan: () => void;
}

export const WorkoutCard: React.FC<WorkoutCardProps> = ({
  todayWorkout,
  onOpenWeeklyPlan
}) => {
  const completedExercises = todayWorkout?.exercises.filter(e => e.completed).length || 0;
  const totalExercises = todayWorkout?.exercises.length || 0;
  const progressPct = totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.45 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between group hover:border-cyan-400/50 transition-all duration-300"
    >
      {/* Ambient background glow */}
      <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-lime-500/10 rounded-full blur-2xl pointer-events-none" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Dnešní trénink
          </h3>
          <Dumbbell className="w-4 h-4 text-emerald-400 opacity-80" />
        </div>

        {/* Workout Title & Focus */}
        <div className="mb-4">
          <div className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <span>{todayWorkout.title}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-[#39ff14] border border-emerald-500/30">
              Čtvrtek
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 line-clamp-1">
            {todayWorkout.focus}
          </p>
        </div>

        {/* Quick Stats Badges */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-medium">Délka</div>
              <div className="text-xs font-bold text-slate-200">{todayWorkout.durationMin} min</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-medium">Spáleno</div>
              <div className="text-xs font-bold text-slate-200">~{todayWorkout.caloriesBurned} kcal</div>
            </div>
          </div>
        </div>

        {/* Workout completion progress */}
        <div className="space-y-1.5 mb-5">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Průběh tréninku</span>
            <span className="font-semibold text-[#39ff14]">{completedExercises} z {totalExercises} cviků</span>
          </div>
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              style={{ width: `${progressPct}%` }}
              className="h-full bg-gradient-to-r from-cyan-400 to-[#39ff14] rounded-full transition-all duration-500 shadow-[0_0_8px_#39ff14]"
            />
          </div>
        </div>
      </div>

      {/* Action Button: "Zobrazit týdenní trénink" */}
      <button
        onClick={onOpenWeeklyPlan}
        className="w-full py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-semibold text-slate-200 bg-slate-900/80 hover:bg-slate-800 hover:text-white border border-slate-700/60 hover:border-lime-500/40 transition-all duration-200 text-center active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
      >
        <span>Zobrazit týdenní trénink</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
      </button>
    </motion.div>
  );
};
