import React from 'react';
import { Check, Flame, Droplets, Footprints } from 'lucide-react';
import { motion } from 'motion/react';
import { HabitItem } from '../types';

interface HabitsGridProps {
  habits: HabitItem[];
  onToggleHabit: (id: string) => void;
}

export const HabitsGrid: React.FC<HabitsGridProps> = ({
  habits,
  onToggleHabit
}) => {
  return (
    <div className="space-y-2">
      {/* 2 Primary cards matching screenshot 1:1 */}
      <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
        {habits.slice(0, 2).map((habit, idx) => (
          <motion.div
            key={habit.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.5 + idx * 0.05 }}
            onClick={() => onToggleHabit(habit.id)}
            className={`relative overflow-hidden rounded-3xl p-5 bg-[#0e131d]/85 backdrop-blur-xl border transition-all duration-300 cursor-pointer select-none group min-h-[140px] flex flex-col justify-between ${
              habit.completed
                ? 'border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:border-lime-400/50'
                : 'border-slate-800/80 opacity-70 hover:opacity-100 hover:border-slate-700'
            }`}
          >
            {/* Ambient subtle glow when completed */}
            {habit.completed && (
              <div className="absolute top-0 left-0 w-24 h-24 bg-lime-500/10 rounded-full blur-2xl pointer-events-none" />
            )}

            {/* Glowing checkmark icon matching screenshot */}
            <div className="flex items-center justify-between">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  habit.completed
                    ? 'bg-[#39ff14] text-slate-950 shadow-[0_0_16px_rgba(57,255,20,0.55)]'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
              </div>

              {habit.streakDays > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400/90 bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  <Flame className="w-3 h-3 fill-current text-amber-400" />
                  {habit.streakDays} d
                </span>
              )}
            </div>

            {/* Habit Title matching screenshot */}
            <div className="mt-4">
              <div className="text-sm sm:text-base font-bold text-white leading-tight">
                {habit.title}
              </div>
              {habit.subtitle && (
                <div className="text-xs text-slate-400 mt-1">
                  {habit.subtitle}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Secondary Quick Tracking Badges (Water & Steps) */}
      {habits.length > 2 && (
        <div className="grid grid-cols-2 gap-3.5 sm:gap-4 pt-1">
          {habits.slice(2, 4).map((habit, idx) => (
            <motion.div
              key={habit.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 + idx * 0.05 }}
              onClick={() => onToggleHabit(habit.id)}
              className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  {habit.iconType === 'water' ? (
                    <Droplets className="w-4 h-4" />
                  ) : (
                    <Footprints className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">{habit.title}</div>
                  <div className="text-[11px] text-slate-400 font-medium">{habit.value}</div>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                habit.completed ? 'bg-[#39ff14] text-slate-950 shadow-[0_0_8px_#39ff14]' : 'bg-slate-800 text-slate-600'
              }`}>
                <Check className="w-3 h-3 stroke-[2.5]" />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
